// TB-1 (Phase 2) — controlled source-file storage + multipart upload E2E
// against the isolated test database (`microera_wiki_test`), never the dev DB.
//
// Covers, at both the service layer and through a real Express app:
//   - happy path: PDF/DOCX/MD/TXT upload → document + source + pending job,
//     file stored under a TEMP DATA_DIR/sources/<uuid>.<ext> with SHA-256 match;
//   - rejection: unsupported extension, content/extension mismatch, spoofed
//     MIME, empty file, oversized file, path traversal, client filename with
//     traversal (never used as the server path), soft-deleted KB;
//   - compensation: a DB/enqueue failure removes the just-written file (no
//     orphan file) and leaves no parse job;
//   - HTTP: multipart route auth (401) + validation (400) + success (200).
//
// Self-provisioning like the other parity E2E suites: creates the test DB if
// missing, applies the additive migration chain, uses a temp DATA_DIR, seeds
// UNIQUE rows, targeted-cleans. DB identity is asserted with assertTestDatabase.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from '../helpers/assert-test-db.js';
import { applyMigrations } from '../helpers/apply-migrations.js';

const TEST_DB_NAME = 'microera_wiki_test';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5433/postgres';
const TEST_DB_URL = `postgresql://postgres:postgres@localhost:5433/${TEST_DB_NAME}`;
const MIGRATIONS_DIR = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
  'backend',
  'db',
  'migrations',
);

// ── deterministic source-file fixtures ──────────────────────────────────────
// The "content feature" (magic bytes / text heuristic) is what the validator
// checks; TB-1 does NOT run Docling, so these need only look like their format.
const pdfBytes = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'latin1',
);
const docxBytes = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK\x03\x04
  Buffer.from('fakezip-entry[Content_Types].xml <word/document.xml> fake bytes', 'latin1'),
]);
const mdBytes = Buffer.from('# Zephyrquasar Source Upload\n\nSome markdown content.\n', 'utf8');
const txtBytes = Buffer.from('plain text content\n', 'utf8');
const exeBytes = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00', 'latin1');

let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

describe.skipIf(!dbAvailable)('TB-1 — controlled source-file storage + multipart upload', () => {
  // Dynamically imported after env setup (DATABASE_URL + DATA_DIR are read at
  // module load, so they must point at the test DB and a temp dir first).
  let parseApiService: any;
  let knowledgeService: any;
  let knowledgeRepository: any;
  let parseJobRepository: any;
  let parseJobService: any;
  let pool: any;
  let config: any;
  let sha256Buffer: any;
  let storage: any; // backend/storage/source-files.js
  let createApp: any;
  let signToken: any;

  let server: Server | undefined;
  let baseUrl = '';
  let token = '';

  let tempDataDir = '';
  const envSnapshot: Record<string, string | undefined> = {};
  const createdKbIds: number[] = [];
  const createdJobIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const sourcesDir = () => path.join(config.dataDir, 'sources');
  const listSourceFiles = (): string[] => {
    const dir = sourcesDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).sort();
  };

  /** Run validateSourceFile and return the error code, or undefined on success. */
  function validateErr(buf: Buffer, opts: { name: string; mime: string; maxBytes?: number }): string | undefined {
    try {
      storage.validateSourceFile(buf, opts);
      return undefined;
    } catch (e: any) {
      return e?.code;
    }
  }

  beforeAll(async () => {
    envSnapshot.DATABASE_URL = process.env.DATABASE_URL;
    envSnapshot.DATA_DIR = process.env.DATA_DIR;

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-upload-'));
    process.env.DATA_DIR = tempDataDir;

    const admin = new pg.Pool({ connectionString: ADMIN_URL });
    try {
      const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
      if (rows.length === 0) await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    } finally {
      await admin.end();
    }

    const testPool = new pg.Pool({ connectionString: TEST_DB_URL });
    await assertTestDatabase(testPool, TEST_DB_NAME);
    await applyMigrations(TEST_DB_URL, MIGRATIONS_DIR);
    await testPool.end();

    process.env.DATABASE_URL = TEST_DB_URL;
    vi.resetModules();

    ({ parseApiService } = await import('../../backend/services/parse-api.service.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ parseJobRepository } = await import('../../backend/repositories/parse-job.repository.js'));
    ({ parseJobService } = await import('../../backend/services/parse-job.service.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    ({ config } = await import('../../backend/config.js'));
    ({ sha256Buffer } = await import('../../backend/utils/hash.js'));
    storage = await import('../../backend/storage/source-files.js');
    ({ createApp } = await import('../../backend/app.js'));
    ({ signToken } = await import('../../server/middleware/auth.js'));

    await assertTestDatabase(pool, TEST_DB_NAME);

    // A real Express app for the HTTP-level assertions (bootstrap off → no
    // migrations/seed/warmup; only route wiring + the images dir mkdir).
    const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const port = (server!.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    token = signToken({ userId: 1, username: 'tb1', role: 'admin' });
  }, 60000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (pool) {
      try {
        if (createdJobIds.length > 0) {
          await pool.query('DELETE FROM parse_deadletters WHERE job_id = ANY($1::text[])', [createdJobIds]);
          await pool.query('DELETE FROM parse_jobs WHERE id = ANY($1::text[])', [createdJobIds]);
        }
        if (createdKbIds.length > 0) {
          await pool.query('DELETE FROM knowledge_bases WHERE id = ANY($1::int[])', [createdKbIds]);
        }
      } catch {
        /* best-effort cleanup */
      }
      try {
        await pool.end();
      } catch {
        /* pool already closed */
      }
    }
    if (tempDataDir) {
      try {
        fs.rmSync(tempDataDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
    if (envSnapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    if (envSnapshot.DATA_DIR === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = envSnapshot.DATA_DIR;
    vi.resetModules();
  });

  async function makeKb(): Promise<number> {
    const kb = await knowledgeService.createKb({ name: `kb-tb1-${suffix}-${createdKbIds.length}` });
    createdKbIds.push(kb.id);
    return kb.id;
  }

  // ── service level: happy path (DB + filesystem) ───────────────────────────
  it('PDF upload: document + source + pending job + file on disk (SHA-256 verified)', async () => {
    const kbId = await makeKb();
    const before = listSourceFiles().length;
    const { document_id, job_id } = await parseApiService.uploadFile({
      kb_id: kbId,
      title: 'Quarterly Review',
      file: { name: 'sample.pdf', mime: 'application/pdf', buffer: pdfBytes },
    });
    createdJobIds.push(job_id);

    const job = await parseJobRepository.findById(job_id);
    expect(job.status).toBe('pending');
    expect(job.document_id).toBe(document_id);

    const doc = await knowledgeRepository.findDocumentById(document_id);
    expect(doc.file_name).toBe('sample.pdf');
    expect(doc.file_size).toBe(pdfBytes.length);
    expect(doc.file_hash).toBe(sha256Buffer(pdfBytes));
    expect(doc.parse_status).toBe('pending');

    const { rows } = await pool.query('SELECT * FROM sources WHERE id = $1', [doc.source_id]);
    const source = rows[0];
    expect(source.uri).toMatch(/^sources\/[a-f0-9-]{36}\.pdf$/);
    expect(source.checksum).toBe(sha256Buffer(pdfBytes));

    const abs = path.join(config.dataDir, source.uri);
    expect(fs.existsSync(abs)).toBe(true);
    expect(fs.readFileSync(abs)).toEqual(pdfBytes);
    expect(listSourceFiles().length).toBe(before + 1);
  });

  it('DOCX upload: accepted, .docx source reference + checksum + file on disk', async () => {
    const kbId = await makeKb();
    const { document_id, job_id } = await parseApiService.uploadFile({
      kb_id: kbId,
      file: {
        name: 'report.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxBytes,
      },
    });
    createdJobIds.push(job_id);
    const doc = await knowledgeRepository.findDocumentById(document_id);
    const { rows } = await pool.query('SELECT uri, checksum FROM sources WHERE id = $1', [doc.source_id]);
    expect(rows[0].uri).toMatch(/^sources\/[a-f0-9-]{36}\.docx$/);
    expect(rows[0].checksum).toBe(sha256Buffer(docxBytes));
    expect(fs.existsSync(path.join(config.dataDir, rows[0].uri))).toBe(true);
  });

  it('MD upload: text/markdown accepted', async () => {
    const kbId = await makeKb();
    const { document_id, job_id } = await parseApiService.uploadFile({
      kb_id: kbId,
      file: { name: 'notes.md', mime: 'text/markdown', buffer: mdBytes },
    });
    createdJobIds.push(job_id);
    const doc = await knowledgeRepository.findDocumentById(document_id);
    const { rows } = await pool.query('SELECT uri FROM sources WHERE id = $1', [doc.source_id]);
    expect(rows[0].uri).toMatch(/^sources\/[a-f0-9-]{36}\.md$/);
    expect(fs.existsSync(path.join(config.dataDir, rows[0].uri))).toBe(true);
  });

  it('TXT upload: text/plain accepted', async () => {
    const kbId = await makeKb();
    const { document_id, job_id } = await parseApiService.uploadFile({
      kb_id: kbId,
      file: { name: 'notes.txt', mime: 'text/plain', buffer: txtBytes },
    });
    createdJobIds.push(job_id);
    const doc = await knowledgeRepository.findDocumentById(document_id);
    const { rows } = await pool.query('SELECT uri FROM sources WHERE id = $1', [doc.source_id]);
    expect(rows[0].uri).toMatch(/^sources\/[a-f0-9-]{36}\.txt$/);
    expect(fs.existsSync(path.join(config.dataDir, rows[0].uri))).toBe(true);
  });

  // ── validation (no DB write, no file) ─────────────────────────────────────
  it('rejects an unsupported extension (UNSUPPORTED_FORMAT)', () => {
    expect(validateErr(exeBytes, { name: 'evil.exe', mime: 'application/octet-stream' })).toBe('UNSUPPORTED_FORMAT');
  });

  it('rejects a content/extension mismatch — text bytes named .pdf (CONTENT_MISMATCH)', () => {
    expect(validateErr(mdBytes, { name: 'fake.pdf', mime: 'application/pdf' })).toBe('CONTENT_MISMATCH');
  });

  it('rejects a spoofed MIME — pdf bytes declared image/png (MIME_MISMATCH)', () => {
    expect(validateErr(pdfBytes, { name: 'sample.pdf', mime: 'image/png' })).toBe('MIME_MISMATCH');
  });

  it('rejects an empty file (EMPTY_FILE)', () => {
    expect(validateErr(Buffer.alloc(0), { name: 'x.pdf', mime: 'application/pdf' })).toBe('EMPTY_FILE');
  });

  it('rejects an oversized file (FILE_TOO_LARGE)', () => {
    const big = Buffer.alloc(11, 0x61);
    expect(validateErr(big, { name: 'x.pdf', mime: 'application/pdf', maxBytes: 10 })).toBe('FILE_TOO_LARGE');
  });

  // ── storage: path traversal + exclusive naming ────────────────────────────
  it('rejects path traversal in resolve/remove (INVALID_STORED_NAME / false)', () => {
    expect(() => storage.resolveSourceFilePath(config.dataDir, '../evil.pdf')).toThrowError(storage.SourceFileError);
    expect(() => storage.resolveSourceFilePath(config.dataDir, 'sources/../../evil.pdf')).toThrowError(
      storage.SourceFileError,
    );
    expect(storage.removeSourceFile(config.dataDir, '../evil.pdf')).toBe(false);
  });

  it('writeSourceFile uses unique UUID names and never overwrites', () => {
    const a = storage.writeSourceFile(config.dataDir, pdfBytes, { name: 'a.pdf', mime: 'application/pdf' });
    const b = storage.writeSourceFile(config.dataDir, pdfBytes, { name: 'a.pdf', mime: 'application/pdf' });
    expect(a.storedName).not.toBe(b.storedName);
    expect(a.absolutePath).not.toBe(b.absolutePath);
    expect(fs.existsSync(a.absolutePath)).toBe(true);
    expect(fs.existsSync(b.absolutePath)).toBe(true);
    expect(fs.readFileSync(a.absolutePath)).toEqual(pdfBytes);
    expect(fs.readFileSync(b.absolutePath)).toEqual(pdfBytes);
  });

  // ── security: client path never used, soft-deleted KB ─────────────────────
  it('client filename with traversal is never used as the server path', async () => {
    const kbId = await makeKb();
    const { document_id, job_id } = await parseApiService.uploadFile({
      kb_id: kbId,
      file: { name: '../evil.pdf', mime: 'application/pdf', buffer: pdfBytes },
    });
    createdJobIds.push(job_id);
    const doc = await knowledgeRepository.findDocumentById(document_id);
    const { rows } = await pool.query('SELECT uri FROM sources WHERE id = $1', [doc.source_id]);
    expect(rows[0].uri).toMatch(/^sources\/[a-f0-9-]{36}\.pdf$/);
    expect(fs.existsSync(path.join(config.dataDir, 'evil.pdf'))).toBe(false);
    expect(fs.existsSync(path.join(tempDataDir, '..', 'evil.pdf'))).toBe(false);
  });

  it('rejects upload to a soft-deleted KB (resource_not_found, no file written)', async () => {
    const kbId = await makeKb();
    await knowledgeService.deleteKb(kbId);
    const before = listSourceFiles().length;
    await expect(
      parseApiService.uploadFile({
        kb_id: kbId,
        file: { name: 'sample.pdf', mime: 'application/pdf', buffer: pdfBytes },
      }),
    ).rejects.toThrow('not found');
    expect(listSourceFiles().length).toBe(before);
  });

  // ── compensation: DB/enqueue failure removes the file, leaves no job ──────
  it('enqueue failure: compensation removes the just-written file (no orphan)', async () => {
    const kbId = await makeKb();
    const before = listSourceFiles().length;
    const spy = vi.spyOn(parseJobService, 'enqueue').mockRejectedValue(new Error('db down'));
    try {
      await expect(
        parseApiService.uploadFile({
          kb_id: kbId,
          file: { name: 'sample.pdf', mime: 'application/pdf', buffer: pdfBytes },
        }),
      ).rejects.toThrow('db down');
    } finally {
      spy.mockRestore();
    }
    expect(listSourceFiles().length).toBe(before);
    const { rows: jobs } = await pool.query(
      'SELECT pj.id FROM parse_jobs pj JOIN documents d ON d.id = pj.document_id WHERE d.kb_id = $1',
      [kbId],
    );
    expect(jobs.length).toBe(0);
  });

  // ── HTTP level: the multipart route through a real Express app ────────────
  it('HTTP POST /doc/upload-file: valid multipart → 200 ok {document_id, job_id}', async () => {
    const kbId = await makeKb();
    const form = new FormData();
    form.append('kb_id', String(kbId));
    form.append('title', 'HTTP PDF');
    form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'http-sample.pdf');
    const res = await fetch(`${baseUrl}/api/v2/ops/doc/upload-file`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.document_id).toBeTruthy();
    expect(body.data.job_id).toBeTruthy();
    createdJobIds.push(body.data.job_id);

    const doc = await knowledgeRepository.findDocumentById(body.data.document_id);
    expect(doc.file_name).toBe('http-sample.pdf');
    const { rows } = await pool.query('SELECT uri FROM sources WHERE id = $1', [doc.source_id]);
    expect(fs.existsSync(path.join(config.dataDir, rows[0].uri))).toBe(true);
  });

  it('HTTP POST /doc/upload-file: unauthenticated → 401', async () => {
    const kbId = await makeKb();
    const form = new FormData();
    form.append('kb_id', String(kbId));
    form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'x.pdf');
    const res = await fetch(`${baseUrl}/api/v2/ops/doc/upload-file`, { method: 'POST', body: form });
    expect(res.status).toBe(401);
  });

  it('HTTP POST /doc/upload-file: disallowed type → 400 validation_failed, no file', async () => {
    const kbId = await makeKb();
    const before = listSourceFiles().length;
    const form = new FormData();
    form.append('kb_id', String(kbId));
    form.append('file', new Blob([exeBytes], { type: 'application/octet-stream' }), 'evil.exe');
    const res = await fetch(`${baseUrl}/api/v2/ops/doc/upload-file`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_ARGUMENT');
    expect(listSourceFiles().length).toBe(before);
  });

  it('HTTP POST /doc/upload-file: missing file field → 400', async () => {
    const kbId = await makeKb();
    const form = new FormData();
    form.append('kb_id', String(kbId));
    const res = await fetch(`${baseUrl}/api/v2/ops/doc/upload-file`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(res.status).toBe(400);
  });
});
