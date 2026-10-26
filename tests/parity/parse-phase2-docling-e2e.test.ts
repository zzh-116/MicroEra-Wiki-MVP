// TB-2 (Phase 2) — Docling worker end-to-end: real PDF/DOCX parsing + retrieval
// index, against the isolated test database (`microera_wiki_test`), never the
// dev DB.
//
// Covers:
//   - happy path (REAL Docling + REAL bge-m3): a real PDF and a real DOCX are
//     uploaded → `createParseProcessor` resolves the DB-trusted `sources.uri`,
//     verifies existence/size/SHA-256, runs Docling → succeeded/completed →
//     real 1024-dim vectors → vectorSearch + hybridSearch hit;
//   - MD/TXT file fast path: a stored .md/.txt is read directly (no Docling) and
//     published; the pure-text `content` fast path still works (no regression);
//   - fault/exception paths: file-missing (permanent), hash-mismatch (permanent),
//     Docling-failure (retryable), cancel, lost-lease, superseded
//     (old-task-overwrite), parent-KB-soft-delete → each fails the job with the
//     correct non-sensitive code and writes nothing; permanent faults never
//     deadletter.
//
// Environment gating: the real-Docling / real-embedding tests are skipped unless
// `docling` CLI and Ollama `bge-m3` are both reachable, so `vitest run` stays
// green on CI without those deps. Fault injection (spying `embedBatch` /
// `parseFile`) is used only for deterministic fault cases, never for the real
// end-to-end verification. DB is asserted with assertTestDatabase + a temp
// DATA_DIR so source files never touch the dev DATA_DIR.
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
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const FIXTURES_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'fixtures');

const execFileAsync = promisify(execFile);

const MARKDOWN = [
  '# Zephyrquasar Indexing Protocol',
  'The zephyrquasar protocol organizes knowledge into a searchable index for fast retrieval.',
  'It is used here only to prove that a freshly parsed document is retrievable by meaning.',
  '',
  '## Ingestion',
  'The zephyrquasar protocol accepts raw documents and turns them into retrievable chunks',
  'with semantic vectors, so retrieval is driven by meaning rather than keywords alone.',
].join('\n');

// ── Environment probes (top-level so skips are decided before the suite runs) ──
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

let ollamaReady = false;
try {
  const res = await fetch(`${OLLAMA_URL}/api/tags`);
  if (res.ok) {
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    ollamaReady = (data.models ?? []).some((m) => (m.name ?? '').startsWith('bge-m3'));
  }
} catch {
  ollamaReady = false;
}

// Strict acceptance mode: DOCLING_STRICT=1 forbids skips — the real PDF/DOCX
// (Docling + bge-m3) tests MUST run. If any dependency is missing, fail the
// suite outright instead of silently skipping, so a skip can never stand in
// for local delivery acceptance.
if (process.env.DOCLING_STRICT === '1') {
  const missing: string[] = [];
  if (!dbAvailable) missing.push('Postgres (microera_wiki_test)');
  if (!doclingReady) missing.push('docling CLI');
  if (!ollamaReady) missing.push('Ollama bge-m3');
  if (missing.length > 0) {
    throw new Error(
      `DOCLING_STRICT=1 forbids skipping, but these dependencies are unavailable: ${missing.join(', ')}`,
    );
  }
}

describe.skipIf(!dbAvailable)('TB-2 — Docling worker real PDF/DOCX + retrieval index', () => {
  let parseJobService: typeof import('../../backend/services/parse-job.service.js')['parseJobService'];
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let ParseWorker: typeof import('../../backend/services/parse-worker.service.js')['ParseWorker'];
  let createParseProcessor: typeof import('../../backend/services/parse-processor.service.js')['createParseProcessor'];
  let createPureTextProcessor: typeof import('../../backend/services/parse-processor.service.js')['createPureTextProcessor'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let parseApiService: typeof import('../../backend/services/parse-api.service.js')['parseApiService'];
  let retrievalService: typeof import('../../backend/services/retrieval.service.js')['retrievalService'];
  let knowledgeRepository: typeof import('../../backend/repositories/knowledge.repository.js')['knowledgeRepository'];
  let knowledgeChunkRepository: typeof import('../../backend/repositories/knowledge-chunk.repository.js')['knowledgeChunkRepository'];
  let ollamaEmbedder: typeof import('../../backend/embedding/ollama.js')['ollamaEmbedder'];
  let doclingParser: typeof import('../../backend/parser/docling.js')['doclingParser'];
  let ParserError: typeof import('../../backend/parser/models.js')['ParserError'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  let config: typeof import('../../backend/config.js')['config'];
  const envSnapshot: Record<string, string | undefined> = {};

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = `worker-tb2-${suffix}`;
  const createdKbIds: number[] = [];
  const createdJobIds: string[] = [];
  let tempDataDir = '';

  function trackJob(jobId: string): void {
    createdJobIds.push(jobId);
  }

  async function makeKb(): Promise<number> {
    const kb = await knowledgeService.createKb({ name: `kb-tb2-${suffix}-${createdKbIds.length}` });
    createdKbIds.push(kb.id);
    return kb.id;
  }

  async function uploadText(kbId: number, content = MARKDOWN): Promise<{ docId: number; jobId: string }> {
    const { document_id, job_id } = await parseApiService.upload({
      kb_id: kbId,
      title: `doc-text-${suffix}-${createdKbIds.length}`,
      content,
    });
    trackJob(job_id);
    return { docId: document_id, jobId: job_id };
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

  /** Absolute path of the on-disk source file for a document (for tamper/delete). */
  async function sourceAbsPath(docId: number): Promise<string> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    const source = doc && doc.source_id != null ? await knowledgeRepository.findSourceById(doc.source_id) : undefined;
    if (!source?.uri) throw new Error(`document ${docId} has no source uri`);
    return path.join(config.dataDir, source.uri);
  }

  /** Deterministic 1024-dim embeddings so non-real tests need no Ollama. */
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

  async function countVectors(documentId: number): Promise<number> {
    const { rows } = await pool.query<{ c: number }>(
      'SELECT count(*)::int AS c FROM knowledge_vectors WHERE document_id = $1',
      [documentId],
    );
    return rows[0]?.c ?? 0;
  }

  async function vectorDims(documentId: number): Promise<number | null> {
    const { rows } = await pool.query<{ d: number }>(
      'SELECT vector_dims(embedding)::int AS d FROM knowledge_vectors WHERE document_id = $1 LIMIT 1',
      [documentId],
    );
    return rows[0]?.d ?? null;
  }

  async function countRevisions(documentId: number): Promise<number> {
    const { rows } = await pool.query<{ c: number }>(
      'SELECT count(*)::int AS c FROM document_revisions WHERE document_id = $1',
      [documentId],
    );
    return rows[0]?.c ?? 0;
  }

  async function documentParseStatus(documentId: number): Promise<string> {
    const { rows } = await pool.query<{ s: string }>(
      'SELECT parse_status AS s FROM documents WHERE id = $1',
      [documentId],
    );
    return rows[0]?.s ?? '';
  }

  /** Simulate the queue reclaiming THIS job's expired lease (version bump + back
   *  to pending), scoped to one job id. Mirrors `ParseJobRepository.reclaimExpired`
   *  but does NOT sweep the whole shared `parse_jobs` table, so a concurrent suite
   *  that just expired its own job can never be reclaimed (or stolen) by us. */
  async function reclaimJob(jobId: string): Promise<void> {
    await pool.query(
      `UPDATE parse_jobs
          SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL,
              stage = NULL, lease_version = lease_version + 1, updated_at = now()
        WHERE id = $1 AND status = 'running'`,
      [jobId],
    );
  }

  beforeAll(async () => {
    envSnapshot.DATABASE_URL = process.env.DATABASE_URL;
    envSnapshot.DATA_DIR = process.env.DATA_DIR;

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docling-e2e-'));
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
    ({ retrievalService } = await import('../../backend/services/retrieval.service.js'));
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ knowledgeChunkRepository } = await import('../../backend/repositories/knowledge-chunk.repository.js'));
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

  // ── Real end-to-end: Docling + bge-m3 (no mocks) ────────────────────────
  it.skipIf(!doclingReady || !ollamaReady)(
    'real PDF: Docling parse → real bge-m3 vectors (1024-dim) → vectorSearch + hybridSearch hit',
    async () => {
      const kbId = await makeKb();
      const pdfBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'real-pdf.pdf'));
      const { docId, jobId } = await uploadFile(kbId, { name: 'real-pdf.pdf', mime: 'application/pdf', buffer: pdfBytes });

      await runJob(jobId, createParseProcessor());

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');

      const chunkCount = await knowledgeChunkRepository.countByDocument(docId);
      expect(chunkCount).toBeGreaterThan(0);
      expect(await countVectors(docId)).toBe(chunkCount);
      expect(await vectorDims(docId)).toBe(1024);

      const doc = await knowledgeRepository.findDocumentById(docId);
      expect(doc!.content).toMatch(/zephyrquasar/i);

      const vec = await retrievalService.vectorSearch({ query: 'zephyrquasar', kb_id: kbId, is_internal: true, top_k: 10 });
      expect(vec.some((h) => h.document_id === docId)).toBe(true);

      const hybrid = await retrievalService.hybridSearch({ query: 'zephyrquasar', kb_id: kbId, is_internal: true, top_k: 10 });
      expect(hybrid.some((h) => h.document_id === docId)).toBe(true);
    },
    180000,
  );

  it.skipIf(!doclingReady || !ollamaReady)(
    'real DOCX: Docling parse → real bge-m3 vectors (1024-dim) → vectorSearch + hybridSearch hit',
    async () => {
      const kbId = await makeKb();
      const docxBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'real-docx.docx'));
      const { docId, jobId } = await uploadFile(kbId, {
        name: 'real-docx.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxBytes,
      });

      await runJob(jobId, createParseProcessor());

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');

      const chunkCount = await knowledgeChunkRepository.countByDocument(docId);
      expect(chunkCount).toBeGreaterThan(0);
      expect(await countVectors(docId)).toBe(chunkCount);
      expect(await vectorDims(docId)).toBe(1024);

      const doc = await knowledgeRepository.findDocumentById(docId);
      expect(doc!.content).toMatch(/zephyrquasar/i);

      const vec = await retrievalService.vectorSearch({ query: 'zephyrquasar', kb_id: kbId, is_internal: true, top_k: 10 });
      expect(vec.some((h) => h.document_id === docId)).toBe(true);

      const hybrid = await retrievalService.hybridSearch({ query: 'zephyrquasar', kb_id: kbId, is_internal: true, top_k: 10 });
      expect(hybrid.some((h) => h.document_id === docId)).toBe(true);
    },
    180000,
  );

  // ── MD/TXT + pure-text fast path (no Docling, no Ollama) ────────────────
  it('MD file fast path: stored .md is read directly and published (no Docling)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const md = Buffer.from('# Zephyrquasar Markdown File\n\nread directly from the source file.\n', 'utf8');
      const { docId, jobId } = await uploadFile(kbId, { name: 'notes.md', mime: 'text/markdown', buffer: md });

      await runJob(jobId, createParseProcessor());

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
      expect((await knowledgeRepository.findDocumentById(docId))!.content).toContain('Zephyrquasar Markdown File');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBeGreaterThan(0);
    });
  }, 30000);

  it('TXT file fast path: stored .txt is read directly and published (no Docling)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const txt = Buffer.from('This plain text source file mentions zephyrquasar and is long enough to form a chunk.\n', 'utf8');
      const { docId, jobId } = await uploadFile(kbId, { name: 'notes.txt', mime: 'text/plain', buffer: txt });

      await runJob(jobId, createParseProcessor());

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
      expect((await knowledgeRepository.findDocumentById(docId))!.content).toContain('zephyrquasar');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBeGreaterThan(0);
    });
  }, 30000);

  it('pure-text content fast path (no source file): still works after the router refactor', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadText(kbId);

      // The pure-text processor is the exact Phase 1 path (doc.content).
      await runJob(jobId, createPureTextProcessor());

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBeGreaterThan(0);
    });
  }, 30000);

  // ── Fault/exception paths ────────────────────────────────────────────────
  it('file missing: SOURCE_FILE_MISSING → permanent fail, nothing published', async () => {
    const kbId = await makeKb();
    const txt = Buffer.from('source file that will be removed\n', 'utf8');
    const { docId, jobId } = await uploadFile(kbId, { name: 'gone.txt', mime: 'text/plain', buffer: txt });

    fs.rmSync(await sourceAbsPath(docId), { force: true });

    await runJob(jobId, createParseProcessor());

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed'); // permanent — a missing file cannot be fixed by retry
    expect(job!.error_code).toBe('SOURCE_FILE_MISSING');

    // Permanent failures never deadletter (no point retrying).
    const dls = await parseJobService.deadletters();
    expect(dls.items.some((d) => d.job_id === jobId)).toBe(false);

    expect(await documentParseStatus(docId)).toBe('pending');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1); // only the upload's rev1
  }, 30000);

  it('hash mismatch: SOURCE_HASH_MISMATCH → permanent fail, nothing published', async () => {
    const kbId = await makeKb();
    const txt = Buffer.from('original source file bytes\n', 'utf8');
    const { docId, jobId } = await uploadFile(kbId, { name: 'tampered.txt', mime: 'text/plain', buffer: txt });

    fs.writeFileSync(await sourceAbsPath(docId), Buffer.from('tampered bytes\n'));

    await runJob(jobId, createParseProcessor());

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed'); // permanent — the bytes on disk will not heal on retry
    expect(job!.error_code).toBe('SOURCE_HASH_MISMATCH');

    const dls = await parseJobService.deadletters();
    expect(dls.items.some((d) => d.job_id === jobId)).toBe(false);

    expect(await documentParseStatus(docId)).toBe('pending');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1);
  }, 30000);

  it('Docling failure (fault-injected): DOCLING_PARSE_FAILED → retryable fail, nothing published', async () => {
    // A real .pdf source (so the router reaches the Docling branch) whose parse
    // is fault-injected to throw a ParserError. The happy path above uses the
    // REAL Docling; this deterministic fault test verifies the failure mapping.
    const kbId = await makeKb();
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1');
    const { docId, jobId } = await uploadFile(kbId, { name: 'failing.pdf', mime: 'application/pdf', buffer: pdfBytes });

    const spy = vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError('boom', 'PARSE_FAILED'));
    try {
      await runJob(jobId, createParseProcessor());
    } finally {
      spy.mockRestore();
    }

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('pending');
    expect(job!.error_code).toBe('DOCLING_PARSE_FAILED');

    expect(await documentParseStatus(docId)).toBe('pending');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1);
  }, 30000);

  it('cancel: a cancelled job writes nothing (CANCELLED no-op)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadText(kbId);
      const claimed = await parseJobRepository.claim(jobId, owner, 60);

      await parseJobService.cancel(jobId);

      const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
      await worker.runJob(claimed!);

      expect((await parseJobRepository.findById(jobId))!.status).toBe('cancelled');
      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);
      expect(await countRevisions(docId)).toBe(1);
    });
  }, 30000);

  it('lost lease: a stale worker cannot write downstream (LEASE_LOST no-op)', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId } = await uploadText(kbId);
      const claimed = await parseJobRepository.claim(jobId, owner, 60);

      await pool.query(`UPDATE parse_jobs SET lease_expires_at = now() - interval '5 seconds' WHERE id = $1`, [jobId]);
      await reclaimJob(jobId);

      const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
      await worker.runJob(claimed!);

      const job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('pending');
      expect(job!.lease_owner).toBeNull();

      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);
      expect(await countRevisions(docId)).toBe(1);
    });
  }, 30000);

  it('old-task-overwrite: an old parse is fenced out (SUPERSEDED), then the new one completes', async () => {
    await withDeterministicEmbed(async () => {
      const kbId = await makeKb();
      const { docId, jobId: jobA } = await uploadText(kbId);
      const claimedA = await parseJobRepository.claim(jobA, owner, 60);

      const { job_id: jobB } = await parseApiService.reparse({ doc_id: docId });
      trackJob(jobB);

      const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
      await worker.runJob(claimedA!);

      const a = await parseJobRepository.findById(jobA);
      expect(a!.status).toBe('failed');
      expect(a!.error_code).toBe('SUPERSEDED');
      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countRevisions(docId)).toBe(1);

      const claimedB = await parseJobRepository.claim(jobB, owner, 60);
      await worker.runJob(claimedB!);

      expect((await parseJobRepository.findById(jobB))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBeGreaterThan(0);
      expect(await countVectors(docId)).toBeGreaterThan(0);
    });
  }, 30000);

  it('parent-KB soft-delete: DOCUMENT_GONE permanent fail, nothing written', async () => {
    const kbId = await makeKb();
    const { docId, jobId } = await uploadText(kbId);
    const claimed = await parseJobRepository.claim(jobId, owner, 60);

    await knowledgeService.deleteKb(kbId);

    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createParseProcessor() });
    await worker.runJob(claimed!);

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed');
    expect(job!.error_code).toBe('DOCUMENT_GONE');

    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1);
  }, 30000);
});
