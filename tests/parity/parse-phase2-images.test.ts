// B-2 — Docling image trusted-attribution wiring (P1-B) end-to-end, against the
// isolated test database (`microera_wiki_test`) + a temp DATA_DIR, never the dev
// DB or dev DATA_DIR.
//
// Proves, at the processor → fenced-commit boundary:
//   - a full content re-parse (content re-derived from the stored source file)
//     atomically REPLACES `document_images` ownership with exactly the image
//     names the trusted Docling parse actually wrote (never names scraped from
//     the editable markdown body);
//   - an index-only rebuild (content re-used from `documents.content`, empty
//     `savedImages`) PRESERVES existing ownership;
//   - cancel / lost-lease / superseded / parent-KB-soft-delete write NO image
//     ownership and never delete existing rows;
//   - a shared image still referenced by another document stays accessible after
//     one document drops it (and no physical file is ever deleted);
//   - real Docling on a real PDF and a real DOCX that each contain a body image
//     (gated on the `docling` CLI) registers the extracted image + its file.
//
// Embedding is stubbed deterministically everywhere (image wiring is orthogonal
// to vectors); the real-Docling tests therefore need only the `docling` CLI, not
// Ollama. Fault injection (spying `parseFile` → `parseString`) is used only for
// deterministic cases, never for the real acceptance.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
const FIXTURES_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'fixtures');

const execFileAsync = promisify(execFile);

// 1x1 PNG (valid, ~67 bytes). `extractAndSaveImages` only base64-decodes and
// writes; it does not validate the decoded raster, so this is sufficient.
const PNG_1x1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function mdWithPng(): string {
  return `# Zephyrquasar Image Document\n\n![pic](data:image/png;base64,${PNG_1x1_B64})\n\nBody text mentioning zephyrquasar for retrieval.\n`;
}

function mdNoImage(): string {
  return '# Zephyrquasar Text Document\n\nBody text with no embedded image.\n';
}

// ── Environment probe (decides the real-Docling skips before the suite runs) ──
let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

let doclingReady = false;
try {
  await execFileAsync('docling', ['--version'], { timeout: 60000, windowsHide: true });
  doclingReady = true;
} catch {
  doclingReady = false;
}

// Strict acceptance mode: DOCLING_STRICT=1 forbids skips — the real image
// PDF/DOCX tests MUST run. If a dependency is missing, fail the suite outright
// instead of silently skipping, so a skip can never stand in for local delivery
// acceptance.
if (process.env.DOCLING_STRICT === '1') {
  const missing: string[] = [];
  if (!dbAvailable) missing.push('Postgres (microera_wiki_test)');
  if (!doclingReady) missing.push('docling CLI');
  if (missing.length > 0) {
    throw new Error(
      `DOCLING_STRICT=1 forbids skipping, but these dependencies are unavailable: ${missing.join(', ')}`,
    );
  }
}

describe.skipIf(!dbAvailable)('B-2 — Docling image trusted-attribution wiring', () => {
  let parseJobService: typeof import('../../backend/services/parse-job.service.js')['parseJobService'];
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let ParseWorker: typeof import('../../backend/services/parse-worker.service.js')['ParseWorker'];
  let createParseProcessor: typeof import('../../backend/services/parse-processor.service.js')['createParseProcessor'];
  let createPureTextProcessor: typeof import('../../backend/services/parse-processor.service.js')['createPureTextProcessor'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let parseApiService: typeof import('../../backend/services/parse-api.service.js')['parseApiService'];
  let knowledgeRepository: typeof import('../../backend/repositories/knowledge.repository.js')['knowledgeRepository'];
  let documentImageRepository: typeof import('../../backend/repositories/document-image.repository.js')['documentImageRepository'];
  let ollamaEmbedder: typeof import('../../backend/embedding/ollama.js')['ollamaEmbedder'];
  let doclingParser: typeof import('../../backend/parser/docling.js')['doclingParser'];
  let ParserError: typeof import('../../backend/parser/models.js')['ParserError'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  let config: typeof import('../../backend/config.js')['config'];
  const envSnapshot: Record<string, string | undefined> = {};

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = `worker-b2-img-${suffix}`;
  const createdKbIds: number[] = [];
  const createdJobIds: string[] = [];
  let tempDataDir = '';

  function trackJob(jobId: string): void {
    createdJobIds.push(jobId);
  }

  async function makeKb(): Promise<number> {
    const kb = await knowledgeService.createKb({ name: `kb-b2img-${suffix}-${createdKbIds.length}` });
    createdKbIds.push(kb.id);
    return kb.id;
  }

  async function uploadPdf(kbId: number): Promise<{ docId: number; jobId: string }> {
    // Arbitrary non-empty bytes with a .pdf name → the router takes the source-file
    // branch and reaches `doclingParser.parseFile`, which the deterministic tests spy.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1');
    const { document_id, job_id } = await parseApiService.uploadFile({
      kb_id: kbId,
      title: `img-doc-${suffix}-${createdKbIds.length}`,
      file: { name: 'img.pdf', mime: 'application/pdf', buffer: pdf },
    });
    trackJob(job_id);
    return { docId: document_id, jobId: job_id };
  }

  async function uploadText(kbId: number, content: string): Promise<{ docId: number; jobId: string }> {
    const { document_id, job_id } = await parseApiService.upload({
      kb_id: kbId,
      title: `txt-doc-${suffix}-${createdKbIds.length}`,
      content,
    });
    trackJob(job_id);
    return { docId: document_id, jobId: job_id };
  }

  async function runJob(jobId: string, processor: (job: any) => Promise<void>): Promise<void> {
    const claimed = await parseJobRepository.claim(jobId, owner, 60);
    expect(claimed).toBeDefined();
    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor });
    await worker.runJob(claimed!);
  }

  /** Deterministic 1024-dim embeddings — image wiring is orthogonal to vectors. */
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

  /** Route `parseFile` (PDF/DOCX) through the real `parseString` text path, which
   *  performs genuine image extraction into the temp DATA_DIR and returns the real
   *  `savedImages`. Only the CLI invocation is stubbed. */
  function spyParseMarkdown(md: string) {
    return vi.spyOn(doclingParser, 'parseFile').mockImplementation(async () => doclingParser.parseString(md, 'doc.md'));
  }

  async function imageNames(docId: number): Promise<string[]> {
    const { rows } = await pool.query<{ n: string }>(
      'SELECT image_name AS n FROM document_images WHERE document_id = $1 ORDER BY image_name',
      [docId],
    );
    return rows.map((r) => r.n);
  }

  function imagesDir(): string {
    return path.join(config.dataDir, 'images');
  }

  async function documentParseStatus(documentId: number): Promise<string> {
    const { rows } = await pool.query<{ s: string }>('SELECT parse_status AS s FROM documents WHERE id = $1', [documentId]);
    return rows[0]?.s ?? '';
  }

  beforeAll(async () => {
    envSnapshot.DATABASE_URL = process.env.DATABASE_URL;
    envSnapshot.DATA_DIR = process.env.DATA_DIR;

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-img-'));
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
    ({ createParseProcessor, createPureTextProcessor } = await import('../../backend/services/parse-processor.service.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ parseApiService } = await import('../../backend/services/parse-api.service.js'));
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ documentImageRepository } = await import('../../backend/repositories/document-image.repository.js'));
    ({ ollamaEmbedder } = await import('../../backend/embedding/ollama.js'));
    ({ doclingParser } = await import('../../backend/parser/docling.js'));
    ({ ParserError } = await import('../../backend/parser/models.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    ({ config } = await import('../../backend/config.js'));

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

  // ── Deterministic wiring (spy `parseFile` → real `parseString` extraction) ──

  it('full re-parse registers the parser\'s savedImages atomically (row + file + accessible)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      const spy = spyParseMarkdown(mdWithPng());
      try {
        await runJob(jobId, createParseProcessor());
      } finally {
        spy.mockRestore();
      }

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');

      const names = await imageNames(docId);
      expect(names).toHaveLength(1);
      const name = names[0];
      expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);

      // The registered name is a real file the parser wrote, and is authorized.
      expect(fs.existsSync(path.join(imagesDir(), name))).toBe(true);
      expect(await documentImageRepository.isImageAccessible(name)).toBe(true);

      // The published body references the image by the same URL.
      const doc = await knowledgeRepository.findDocumentById(docId);
      expect(doc!.content).toContain(`/api/images/${name}`);
    });
  }, 30000);

  it('re-parse replaces ownership: old image dropped, new image registered', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      let spy = spyParseMarkdown(mdWithPng());
      try {
        await runJob(jobId, createParseProcessor());
      } finally {
        spy.mockRestore();
      }
      const [first] = await imageNames(docId);
      expect(first).toBeTruthy();

      const { job_id: job2 } = await parseApiService.reparse({ doc_id: docId });
      trackJob(job2);
      spy = spyParseMarkdown(mdWithPng()); // a *different* image name (new UUID)
      try {
        await runJob(job2, createParseProcessor());
      } finally {
        spy.mockRestore();
      }

      const names = await imageNames(docId);
      expect(names).toHaveLength(1);
      expect(names[0]).not.toBe(first);
      expect(await documentImageRepository.isImageAccessible(names[0])).toBe(true);
      // The old name lost its ownership → no longer authorized (file still on disk:
      // physical GC is out of scope this round).
      expect(await documentImageRepository.isImageAccessible(first)).toBe(false);
    });
  }, 30000);

  it('failed re-parse preserves existing image ownership (no add/delete)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      let spy = spyParseMarkdown(mdWithPng());
      try {
        await runJob(jobId, createParseProcessor());
      } finally {
        spy.mockRestore();
      }
      const [before] = await imageNames(docId);
      expect(before).toBeTruthy();

      const { job_id: job2 } = await parseApiService.reparse({ doc_id: docId });
      trackJob(job2);
      const failSpy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError('boom', 'PARSE_FAILED'));
      try {
        await runJob(job2, createParseProcessor());
      } finally {
        failSpy.mockRestore();
      }

      expect((await parseJobRepository.findById(job2))!.status).toBe('pending'); // retryable
      const names = await imageNames(docId);
      expect(names).toEqual([before]);
      expect(await documentImageRepository.isImageAccessible(before)).toBe(true);
    });
  }, 30000);

  it('cancelled job registers no image ownership', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      const claimed = await parseJobRepository.claim(jobId, owner, 60);

      await parseJobService.cancel(jobId);

      const spy = spyParseMarkdown(mdWithPng());
      try {
        const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
        await worker.runJob(claimed!);
      } finally {
        spy.mockRestore();
      }

      expect((await parseJobRepository.findById(jobId))!.status).toBe('cancelled');
      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await imageNames(docId)).toEqual([]);
    });
  }, 30000);

  it('lost-lease worker registers no image ownership', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      const claimed = await parseJobRepository.claim(jobId, owner, 60);

      await pool.query(`UPDATE parse_jobs SET lease_expires_at = now() - interval '5 seconds' WHERE id = $1`, [jobId]);
      await pool.query(
        `UPDATE parse_jobs SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL, stage = NULL, lease_version = lease_version + 1, updated_at = now() WHERE id = $1 AND status = 'running'`,
        [jobId],
      );

      const spy = spyParseMarkdown(mdWithPng());
      try {
        const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
        await worker.runJob(claimed!);
      } finally {
        spy.mockRestore();
      }

      expect((await parseJobRepository.findById(jobId))!.status).toBe('pending');
      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await imageNames(docId)).toEqual([]);
    });
  }, 30000);

  it('superseded old parse preserves existing ownership; the new parse replaces it', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId: job1 } = await uploadPdf(kbId);
      let spy = spyParseMarkdown(mdWithPng());
      try {
        await runJob(job1, createParseProcessor());
      } finally {
        spy.mockRestore();
      }
      const [imgA] = await imageNames(docId);
      expect(imgA).toBeTruthy();

      // job2 claims, then job3 supersedes it → job2 must be fenced out and must
      // NOT touch the existing imgA ownership.
      const { job_id: job2 } = await parseApiService.reparse({ doc_id: docId });
      trackJob(job2);
      const claimed2 = await parseJobRepository.claim(job2, owner, 60);
      const { job_id: job3 } = await parseApiService.reparse({ doc_id: docId });
      trackJob(job3);

      spy = spyParseMarkdown(mdWithPng()); // would-be job2 image
      const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
      try {
        await worker.runJob(claimed2!);
      } finally {
        spy.mockRestore();
      }

      expect((await parseJobRepository.findById(job2))!.status).toBe('failed');
      expect((await parseJobRepository.findById(job2))!.error_code).toBe('SUPERSEDED');
      expect(await imageNames(docId)).toEqual([imgA]);
      expect(await documentImageRepository.isImageAccessible(imgA)).toBe(true);

      // The newest job completes and replaces ownership.
      spy = spyParseMarkdown(mdWithPng());
      try {
        await runJob(job3, createParseProcessor());
      } finally {
        spy.mockRestore();
      }
      const after = await imageNames(docId);
      expect(after).toHaveLength(1);
      expect(after[0]).not.toBe(imgA);
    });
  }, 30000);

  it('parent-KB soft-delete registers no image ownership', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      const claimed = await parseJobRepository.claim(jobId, owner, 60);

      await knowledgeService.deleteKb(kbId);

      const spy = spyParseMarkdown(mdWithPng());
      try {
        const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
        await worker.runJob(claimed!);
      } finally {
        spy.mockRestore();
      }

      expect((await parseJobRepository.findById(jobId))!.status).toBe('failed');
      expect((await parseJobRepository.findById(jobId))!.error_code).toBe('DOCUMENT_GONE');
      expect(await imageNames(docId)).toEqual([]);
    });
  }, 30000);

  it('forged markdown: an /api/images/ URL pasted into content grants no ownership', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const forged = 'forged-not-owned-by-this-doc.png';
      fs.mkdirSync(imagesDir(), { recursive: true });
      fs.writeFileSync(path.join(imagesDir(), forged), Buffer.from('x'));
      const content = `# Forged\n\n![x](/api/images/${forged})\n\nBody text.\n`;
      const { docId, jobId } = await uploadText(kbId, content);

      await runJob(jobId, createPureTextProcessor());

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await imageNames(docId)).toEqual([]);
      expect(await documentImageRepository.isImageAccessible(forged)).toBe(false);
    });
  }, 30000);

  it('index-only rebuild (empty savedImages) preserves existing ownership', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadPdf(kbId);
      let spy = spyParseMarkdown(mdWithPng());
      try {
        await runJob(jobId, createParseProcessor());
      } finally {
        spy.mockRestore();
      }
      const [imgA] = await imageNames(docId);
      expect(imgA).toBeTruthy();

      // A rebuild from existing content (`createPureTextProcessor`, which passes
      // replaceImages=false and empty savedImages) must NOT delete imgA.
      const { job_id: job2 } = await parseApiService.reparse({ doc_id: docId });
      trackJob(job2);
      await runJob(job2, createPureTextProcessor());

      expect((await parseJobRepository.findById(job2))!.status).toBe('succeeded');
      expect(await imageNames(docId)).toEqual([imgA]);
      expect(await documentImageRepository.isImageAccessible(imgA)).toBe(true);
    });
  }, 30000);

  it('shared image: dropping ownership from one document keeps it accessible via the other', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId: docA, jobId: jobA } = await uploadPdf(kbId);
      const { docId: docB } = await uploadPdf(kbId);

      const shared = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png';
      fs.mkdirSync(imagesDir(), { recursive: true });
      fs.writeFileSync(path.join(imagesDir(), shared), Buffer.from('shared-image-bytes'));
      await documentImageRepository.registerImages(docA, [shared]);
      await documentImageRepository.registerImages(docB, [shared]);
      expect(await documentImageRepository.isImageAccessible(shared)).toBe(true);

      // Full re-parse of docA with NO images (replaceImages=true, savedImages=[])
      // drops only docA's row; docB's reference keeps the image authorized.
      const { job_id: jobA2 } = await parseApiService.reparse({ doc_id: docA });
      trackJob(jobA2);
      const spy = spyParseMarkdown(mdNoImage());
      try {
        await runJob(jobA2, createParseProcessor());
      } finally {
        spy.mockRestore();
      }

      expect(await imageNames(docA)).toEqual([]);
      expect(await imageNames(docB)).toEqual([shared]);
      expect(await documentImageRepository.isImageAccessible(shared)).toBe(true);
      // No physical deletion anywhere in this round.
      expect(fs.existsSync(path.join(imagesDir(), shared))).toBe(true);
    });
  }, 30000);

  // ── Real Docling acceptance (real CLI + real filesystem, embedding stubbed) ──

  it.skipIf(!doclingReady)('real PDF with embedded image: Docling extracts ≥1 image → registered + file + accessible', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const pdfBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'real-pdf-image.pdf'));
      const { document_id, job_id } = await parseApiService.uploadFile({
        kb_id: kbId,
        title: 'real-pdf-image.pdf',
        file: { name: 'real-pdf-image.pdf', mime: 'application/pdf', buffer: pdfBytes },
      });
      trackJob(job_id);

      await runJob(job_id, createParseProcessor());

      expect((await parseJobRepository.findById(job_id))!.status).toBe('succeeded');
      expect(await documentParseStatus(document_id)).toBe('completed');

      const names = await imageNames(document_id);
      expect(names.length).toBeGreaterThanOrEqual(1); // the fixture definitively contains an image
      for (const name of names) {
        expect(fs.existsSync(path.join(imagesDir(), name))).toBe(true);
        expect(await documentImageRepository.isImageAccessible(name)).toBe(true);
      }
      const doc = await knowledgeRepository.findDocumentById(document_id);
      expect(doc!.content).toContain('/api/images/');
      expect(doc!.content).toContain('Zephyrquasar Image Fixture');
    });
  }, 180000);

  it.skipIf(!doclingReady)('real DOCX with embedded image: Docling extracts ≥1 image → registered + file + accessible', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const docxBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'real-docx-image.docx'));
      const { document_id, job_id } = await parseApiService.uploadFile({
        kb_id: kbId,
        title: 'real-docx-image.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file: { name: 'real-docx-image.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxBytes },
      });
      trackJob(job_id);

      await runJob(job_id, createParseProcessor());

      expect((await parseJobRepository.findById(job_id))!.status).toBe('succeeded');
      expect(await documentParseStatus(document_id)).toBe('completed');

      const names = await imageNames(document_id);
      expect(names.length).toBeGreaterThanOrEqual(1);
      for (const name of names) {
        expect(fs.existsSync(path.join(imagesDir(), name))).toBe(true);
        expect(await documentImageRepository.isImageAccessible(name)).toBe(true);
      }
      const doc = await knowledgeRepository.findDocumentById(document_id);
      expect(doc!.content).toContain('/api/images/');
      expect(doc!.content).toContain('Zephyrquasar Image Fixture');
    });
  }, 180000);
});
