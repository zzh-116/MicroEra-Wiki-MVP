// TB-3 (Phase 3) — parse error classification + source/temp file lifecycle +
// failure recovery, against the isolated test database (`microera_wiki_test`),
// never the dev DB.
//
// Covers:
//   - permanent vs retryable Docling error classification (encrypted/corrupted/
//     empty-output are permanent; timeout/dependency-missing/parse-failed are
//     retryable) and the retry-then-succeed recovery loop;
//   - cancel and parent-KB soft-delete (DOCUMENT_GONE permanent) write nothing;
//   - controlled source-file GC: active-source protection, active-parse-job
//     protection (GC concurrency), soft-delete retention window, orphan scan,
//     and dry-run-first safety (a dry run removes nothing and reports exactly
//     what a real run would remove — never file bodies);
//   - temp-file GC for leaked Docling working dirs (dry-run-first, scoped to
//     known `docling_*` prefixes only).
//
// Self-provisioning like the other parity suites: creates the test DB if
// missing, applies the additive migration chain (advisory-locked), seeds UNIQUE
// rows (no TRUNCATE), and targeted-cleans afterwards. Ollama is spied for
// deterministic embeddings; Docling `parseFile` is spied only for deterministic
// fault cases, never for the real-Docling end-to-end (that lives in the TB-2
// suite). A temp DATA_DIR keeps all file writes off the dev DATA_DIR.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';
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

let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

describe.skipIf(!dbAvailable)('TB-3 — parse error classification + file lifecycle GC (isolated test DB)', () => {
  let parseJobService: typeof import('../../backend/services/parse-job.service.js')['parseJobService'];
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let ParseWorker: typeof import('../../backend/services/parse-worker.service.js')['ParseWorker'];
  let createParseProcessor: typeof import('../../backend/services/parse-processor.service.js')['createParseProcessor'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let parseApiService: typeof import('../../backend/services/parse-api.service.js')['parseApiService'];
  let knowledgeRepository: typeof import('../../backend/repositories/knowledge.repository.js')['knowledgeRepository'];
  let ollamaEmbedder: typeof import('../../backend/embedding/ollama.js')['ollamaEmbedder'];
  let doclingParser: typeof import('../../backend/parser/docling.js')['doclingParser'];
  let ParserError: typeof import('../../backend/parser/models.js')['ParserError'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  let db: typeof import('../../backend/db/connection.js')['db'];
  let config: typeof import('../../backend/config.js')['config'];
  let SourceFileGc: typeof import('../../backend/storage/source-file-gc.js')['SourceFileGc'];
  let TempFileGc: typeof import('../../backend/storage/temp-file-gc.js')['TempFileGc'];
  const envSnapshot: Record<string, string | undefined> = {};

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = `worker-tb3-${suffix}`;
  const createdKbIds: number[] = [];
  const createdJobIds: string[] = [];
  let tempDataDir = '';

  function trackJob(jobId: string): void {
    createdJobIds.push(jobId);
  }

  async function makeKb(): Promise<number> {
    const kb = await knowledgeService.createKb({ name: `kb-tb3-${suffix}-${createdKbIds.length}` });
    createdKbIds.push(kb.id);
    return kb.id;
  }

  async function uploadFile(
    kbId: number,
    file: { name: string; mime: string; buffer: Buffer },
  ): Promise<{ docId: number; jobId: string }> {
    const { document_id, job_id } = await parseApiService.uploadFile({ kb_id: kbId, title: file.name, file });
    trackJob(job_id);
    return { docId: document_id, jobId: job_id };
  }

  async function runJob(jobId: string, processor: (job: any) => Promise<void>): Promise<void> {
    const claimed = await parseJobRepository.claim(jobId, owner, 60);
    expect(claimed).toBeDefined();
    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor });
    await worker.runJob(claimed!);
  }

  async function sourceAbsPath(docId: number): Promise<string> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    const source = doc && doc.source_id != null ? await knowledgeRepository.findSourceById(doc.source_id) : undefined;
    if (!source?.uri) throw new Error(`document ${docId} has no source uri`);
    return path.join(config.dataDir, source.uri);
  }

  async function withDeterministicEmbed<T>(fn: () => Promise<T>): Promise<T> {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map(() => new Array<number>(1024).fill(0.1)),
      failed: [],
    }));
    try {
      return await fn();
    } finally {
      spy.mockRestore();
    }
  }

  async function documentParseStatus(documentId: number): Promise<string> {
    const { rows } = await pool.query<{ s: string }>(
      'SELECT parse_status AS s FROM documents WHERE id = $1',
      [documentId],
    );
    return rows[0]?.s ?? '';
  }

  async function hasDeadletter(jobId: string): Promise<boolean> {
    const dls = await parseJobService.deadletters();
    return dls.items.some((d) => d.job_id === jobId);
  }

  /** A minimal PDF so the router reaches the Docling branch (spied in fault tests). */
  const MIN_PDF = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
    'latin1',
  );

  beforeAll(async () => {
    envSnapshot.DATABASE_URL = process.env.DATABASE_URL;
    envSnapshot.DATA_DIR = process.env.DATA_DIR;

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb3-'));
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

    ({ parseJobService } = await import('../../backend/services/parse-job.service.js'));
    ({ parseJobRepository } = await import('../../backend/repositories/parse-job.repository.js'));
    ({ ParseWorker } = await import('../../backend/services/parse-worker.service.js'));
    ({ createParseProcessor } = await import('../../backend/services/parse-processor.service.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ parseApiService } = await import('../../backend/services/parse-api.service.js'));
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ ollamaEmbedder } = await import('../../backend/embedding/ollama.js'));
    ({ doclingParser } = await import('../../backend/parser/docling.js'));
    ({ ParserError } = await import('../../backend/parser/models.js'));
    ({ pool, db } = await import('../../backend/db/connection.js'));
    ({ config } = await import('../../backend/config.js'));
    ({ SourceFileGc } = await import('../../backend/storage/source-file-gc.js'));
    ({ TempFileGc } = await import('../../backend/storage/temp-file-gc.js'));

    await assertTestDatabase(pool, TEST_DB_NAME);
  }, 60000);

  afterAll(async () => {
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

  // ── Error classification: permanent vs retryable ────────────────────────
  it('encrypted file: SOURCE_FILE_ENCRYPTED → permanent fail, no deadletter', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadFile(kbId, { name: 'enc.pdf', mime: 'application/pdf', buffer: MIN_PDF });

    const spy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError('enc', 'ENCRYPTED'));
    try {
      await runJob(jobId, createParseProcessor());
    } finally {
      spy.mockRestore();
    }

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed'); // permanent — a retry cannot decrypt the file
    expect(job!.error_code).toBe('SOURCE_FILE_ENCRYPTED');
    expect(await hasDeadletter(jobId)).toBe(false);
    expect(await documentParseStatus(docId)).toBe('pending');
  }, 30000);

  it('corrupted file: SOURCE_FILE_CORRUPTED → permanent fail, no deadletter', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadFile(kbId, { name: 'corrupt.pdf', mime: 'application/pdf', buffer: MIN_PDF });

    const spy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError('corrupt', 'CORRUPTED'));
    try {
      await runJob(jobId, createParseProcessor());
    } finally {
      spy.mockRestore();
    }

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed');
    expect(job!.error_code).toBe('SOURCE_FILE_CORRUPTED');
    expect(await hasDeadletter(jobId)).toBe(false);
    expect(await documentParseStatus(docId)).toBe('pending');
  }, 30000);

  it('empty Docling output: DOCLING_EMPTY_OUTPUT → permanent fail, no deadletter', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadFile(kbId, { name: 'empty.pdf', mime: 'application/pdf', buffer: MIN_PDF });

    const spy = vi.spyOn(doclingParser, 'parseFile').mockResolvedValue({ markdown: '   ' } as any);
    try {
      await runJob(jobId, createParseProcessor());
    } finally {
      spy.mockRestore();
    }

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed');
    expect(job!.error_code).toBe('DOCLING_EMPTY_OUTPUT');
    expect(await hasDeadletter(jobId)).toBe(false);
    expect(await documentParseStatus(docId)).toBe('pending');
  }, 30000);

  it('Docling timeout: DOCLING_TIMEOUT → retryable (pending, attempt bumped), no deadletter', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadFile(kbId, { name: 'timeout.pdf', mime: 'application/pdf', buffer: MIN_PDF });

    const spy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError('timeout', 'TIMEOUT'));
    try {
      await runJob(jobId, createParseProcessor());
    } finally {
      spy.mockRestore();
    }

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('pending'); // retryable — a transient timeout may succeed next time
    expect(job!.error_code).toBe('DOCLING_TIMEOUT');
    expect(job!.attempt).toBe(1);
    expect(await hasDeadletter(jobId)).toBe(false);
    expect(await documentParseStatus(docId)).toBe('pending');
  }, 30000);

  it('Docling dependency missing: DOCLING_DEPENDENCY_MISSING → retryable (pending)', async () => {
    const kbId = await makeKb();
    const { jobId } = await uploadFile(kbId, { name: 'dep.pdf', mime: 'application/pdf', buffer: MIN_PDF });

    const spy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError('missing', 'DEPENDENCY_MISSING'));
    try {
      await runJob(jobId, createParseProcessor());
    } finally {
      spy.mockRestore();
    }

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('pending');
    expect(job!.error_code).toBe('DOCLING_DEPENDENCY_MISSING');
    expect(await hasDeadletter(jobId)).toBe(false);
  }, 30000);

  it('retryable failure recovers on retry (PARSE_FAILED → pending → succeeded)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadFile(kbId, { name: 'recover.pdf', mime: 'application/pdf', buffer: MIN_PDF });

      // First attempt: transient Docling failure → retryable, back to pending.
      const failSpy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValueOnce(new ParserError('boom', 'PARSE_FAILED'));
      await runJob(jobId, createParseProcessor());
      failSpy.mockRestore();

      let job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('pending');
      expect(job!.error_code).toBe('DOCLING_PARSE_FAILED');

      // Second attempt (retry): Docling now succeeds → published.
      const okSpy = vi
        .spyOn(doclingParser, 'parseFile')
        .mockResolvedValue({ markdown: '# Recovered\n\nzephyrquasar recovery proves the retry loop closes.\n' } as any);
      try {
        await runJob(jobId, createParseProcessor());
      } finally {
        okSpy.mockRestore();
      }

      job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
    });
  }, 30000);

  // ── Cancel + soft-delete write nothing ──────────────────────────────────
  it('cancel: a cancelled job writes nothing (CANCELLED no-op)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadFile(kbId, { name: 'cancel.txt', mime: 'text/plain', buffer: Buffer.from('cancel me\n') });

      const claimed = await parseJobRepository.claim(jobId, owner, 60);
      await parseJobService.cancel(jobId);
      const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
      await worker.runJob(claimed!);

      expect((await parseJobRepository.findById(jobId))!.status).toBe('cancelled');
      expect(await documentParseStatus(docId)).toBe('pending');
    });
  }, 30000);

  it('parent-KB soft-delete: DOCUMENT_GONE permanent fail, file stays recoverable', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadFile(kbId, { name: 'soft.txt', mime: 'text/plain', buffer: Buffer.from('soft delete me\n') });
    const abs = await sourceAbsPath(docId);

    await knowledgeService.deleteKb(kbId);

    await runJob(jobId, createParseProcessor());

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed');
    expect(job!.error_code).toBe('DOCUMENT_GONE');
    expect(await hasDeadletter(jobId)).toBe(false);

    // Soft-delete revokes access but keeps the bytes on disk for restore/GC.
    expect(fs.existsSync(abs)).toBe(true);
  }, 30000);

  // ── Source-file GC ──────────────────────────────────────────────────────
  it('GC keeps a file with a live source reference (active-source protection)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadFile(kbId, { name: 'keep.txt', mime: 'text/plain', buffer: Buffer.from('keep me\n') });
      // Complete the job so there is no active-job signal; the live source/doc
      // alone must keep the file.
      await runJob(jobId, createParseProcessor());
      const abs = await sourceAbsPath(docId);

      const gc = new SourceFileGc({ dataDir: tempDataDir, retentionMs: 0, db: db as any });
      const report = await gc.run(true);

      const mine = report.candidates.find((c) => c.uri === `sources/${path.basename(abs)}`);
      expect(mine).toBeDefined();
      expect(mine!.activeSourceRef).toBe(true);
      expect(mine!.eligible).toBe(false);

      await gc.run(false);
      expect(fs.existsSync(abs)).toBe(true); // never deleted while actively referenced
    });
  }, 30000);

  it('GC keeps a soft-deleted file within the retention window, then deletes it after', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadFile(kbId, { name: 'retain.txt', mime: 'text/plain', buffer: Buffer.from('retain me\n') });
      await runJob(jobId, createParseProcessor()); // resolve the pending job first
      const abs = await sourceAbsPath(docId);
      const storedName = path.basename(abs);

      await knowledgeService.deleteKb(kbId); // source's parent KB soft-deleted

      // Inside the retention window → retained.
      const fresh = new SourceFileGc({ dataDir: tempDataDir, retentionMs: 60 * 60 * 1000, db: db as any });
      const freshReport = await fresh.run(true);
      const freshCand = freshReport.candidates.find((c) => c.storedName === storedName);
      expect(freshCand).toBeDefined();
      expect(freshCand!.eligible).toBe(false);
      expect(freshCand!.skippedReason).toBe('retained');
      expect(fs.existsSync(abs)).toBe(true);

      // After the window (retentionMs=0) → eligible and removed.
      const gc = new SourceFileGc({ dataDir: tempDataDir, retentionMs: 0, db: db as any });
      const report = await gc.run(true);
      const cand = report.candidates.find((c) => c.storedName === storedName);
      expect(cand).toBeDefined();
      expect(cand!.eligible).toBe(true);

      const run = await gc.run(false);
      expect(run.removed).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(abs)).toBe(false);
    });
  }, 30000);

  it('GC keeps a file with a pending parse job even after its KB is soft-deleted (GC concurrency)', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadFile(kbId, { name: 'active-job.txt', mime: 'text/plain', buffer: Buffer.from('active job\n') });
    const abs = await sourceAbsPath(docId);
    const storedName = path.basename(abs);

    await knowledgeService.deleteKb(kbId); // parent gone, but the parse job is still pending

    const gc = new SourceFileGc({ dataDir: tempDataDir, retentionMs: 0, db: db as any });
    const report = await gc.run(true);
    const cand = report.candidates.find((c) => c.storedName === storedName);
    expect(cand).toBeDefined();
    expect(cand!.activeJobRef).toBe(true);
    expect(cand!.eligible).toBe(false);
    expect(cand!.skippedReason).toBe('active_job');

    await gc.run(false);
    expect(fs.existsSync(abs)).toBe(true); // a retry could still need the file

    expect(jobId).toBeTruthy(); // (job id retained for cleanup tracking)
    expect(docId).toBeGreaterThan(0);
  }, 30000);

  it('orphan scan: an unreferenced file older than retention is removed; a fresh one is kept', async () => {
    const sourcesDir = path.join(tempDataDir, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });

    const staleOrphan = path.join(sourcesDir, `orphan-stale-${Date.now()}.txt`);
    fs.writeFileSync(staleOrphan, 'stale orphan');
    fs.utimesSync(staleOrphan, new Date(0), new Date(0)); // epoch → older than any retention

    const freshOrphan = path.join(sourcesDir, `orphan-fresh-${Date.now()}.txt`);
    fs.writeFileSync(freshOrphan, 'fresh orphan'); // recent mtime

    const gc = new SourceFileGc({ dataDir: tempDataDir, retentionMs: 60 * 60 * 1000, db: db as any });
    const report = await gc.run(true);

    const stale = report.candidates.find((c) => c.storedName === path.basename(staleOrphan));
    const fresh = report.candidates.find((c) => c.storedName === path.basename(freshOrphan));
    expect(stale).toBeDefined();
    expect(stale!.reason).toBe('orphan');
    expect(stale!.eligible).toBe(true);
    expect(fresh).toBeDefined();
    expect(fresh!.reason).toBe('orphan');
    expect(fresh!.eligible).toBe(false);

    await gc.run(false);
    expect(fs.existsSync(staleOrphan)).toBe(false);
    expect(fs.existsSync(freshOrphan)).toBe(true);
  }, 30000);

  it('GC dry-run removes nothing and reports non-sensitive metadata only', async () => {
    const sourcesDir = path.join(tempDataDir, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });
    const orphan = path.join(sourcesDir, `dryrun-${Date.now()}.txt`);
    fs.writeFileSync(orphan, 'dry run body that must never be reported');
    fs.utimesSync(orphan, new Date(0), new Date(0));

    const gc = new SourceFileGc({ dataDir: tempDataDir, retentionMs: 0, db: db as any });
    const report = await gc.run(true);

    const cand = report.candidates.find((c) => c.storedName === path.basename(orphan));
    expect(cand).toBeDefined();
    expect(cand!.eligible).toBe(true);
    expect(fs.existsSync(orphan)).toBe(true); // dry run removed nothing

    // The report carries no file body: only name/size/mtime/reason.
    expect(JSON.stringify(report)).not.toContain('dry run body that must never be reported');

    const run = await gc.run(false);
    expect(run.removed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(orphan)).toBe(false);
  }, 30000);

  // ── Temp-file GC ────────────────────────────────────────────────────────
  it('temp-file GC removes stale leaked Docling dirs (dry-run-first) and never touches other tmp entries', async () => {
    const tmpDir = path.join(tempDataDir, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });

    const staleLeak = path.join(tmpDir, `docling_${Date.now()}`);
    fs.mkdirSync(staleLeak, { recursive: true });
    fs.writeFileSync(path.join(staleLeak, 'out.md'), 'partial parse output');
    fs.utimesSync(staleLeak, new Date(0), new Date(0));

    const freshLeak = path.join(tmpDir, `docling_buf_${Date.now()}`);
    fs.mkdirSync(freshLeak, { recursive: true }); // recent mtime → retained

    const other = path.join(tmpDir, `other_${Date.now()}`);
    fs.mkdirSync(other, { recursive: true });

    const gc = new TempFileGc({ dataDir: tempDataDir, staleMs: 60 * 60 * 1000 });
    const report = await gc.run(true);

    const stale = report.candidates.find((c) => c.name === path.basename(staleLeak));
    expect(stale).toBeDefined();
    expect(stale!.eligible).toBe(true);
    expect(fs.existsSync(staleLeak)).toBe(true); // dry run removed nothing

    const fresh = report.candidates.find((c) => c.name === path.basename(freshLeak));
    expect(fresh).toBeDefined();
    expect(fresh!.eligible).toBe(false);

    // Non-docling entries are never scanned.
    expect(report.candidates.some((c) => c.name === path.basename(other))).toBe(false);

    const run = await gc.run(false);
    expect(run.removed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(staleLeak)).toBe(false);
    expect(fs.existsSync(freshLeak)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
  }, 30000);
});
