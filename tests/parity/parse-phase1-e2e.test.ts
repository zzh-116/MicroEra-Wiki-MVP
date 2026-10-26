// Phase 1 (2b) — end-to-end tests of the pure-text parse worker against the
// isolated test database (`microera_wiki_test`), never the dev DB.
//
// Exercises the real `createPureTextProcessor` through `ParseWorker.runJob`:
//  1. success: pending → succeeded, document completed, chunks + vectors written,
//     and lexical search hits the new content (the retrieval loop closes);
//  2. a stale worker (lease reclaimed) cannot write downstream (LEASE_LOST);
//  3. a cancelled job writes nothing (CANCELLED);
//  4. a parent-KB soft-delete permanently fails without writing (DOCUMENT_GONE);
//  5. an old parse is fenced out by a newer job (SUPERSEDED), then the newer job
//     completes.
//
// Self-provisioning like parse-worker.test.ts: creates the test DB if missing,
// applies the additive migration chain (which includes 0021), seeds UNIQUE rows
// (no TRUNCATE), and targeted-cleans afterwards. The Ollama embedder is spied so
// the suite is deterministic and does not need a running Ollama.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
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

const MARKDOWN = [
  '# Overview',
  'This document introduces the zephyrquasar protocol for knowledge indexing.',
  'It is used only to prove that a freshly parsed document is retrievable.',
  '## Integration',
  'The zephyrquasar protocol integrates with the retrieval pipeline end to end.',
].join('\n');

let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

describe.skipIf(!dbAvailable)('Phase 1 — pure-text worker E2E (isolated test DB)', () => {
  let parseJobService: typeof import('../../backend/services/parse-job.service.js')['parseJobService'];
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let ParseWorker: typeof import('../../backend/services/parse-worker.service.js')['ParseWorker'];
  let createPureTextProcessor: typeof import('../../backend/services/parse-processor.service.js')['createPureTextProcessor'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let parseApiService: typeof import('../../backend/services/parse-api.service.js')['parseApiService'];
  let retrievalService: typeof import('../../backend/services/retrieval.service.js')['retrievalService'];
  let knowledgeRepository: typeof import('../../backend/repositories/knowledge.repository.js')['knowledgeRepository'];
  let knowledgeChunkRepository: typeof import('../../backend/repositories/knowledge-chunk.repository.js')['knowledgeChunkRepository'];
  let ollamaEmbedder: typeof import('../../backend/embedding/ollama.js')['ollamaEmbedder'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  const envSnapshot: Record<string, string | undefined> = {};

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = `worker-p1-${suffix}`;
  const createdKbIds: number[] = [];
  const createdJobIds: string[] = [];

  function trackJob(jobId: string): void {
    createdJobIds.push(jobId);
  }

  async function uploadKb(): Promise<{ kbId: number; docId: number; jobId: string }> {
    const kb = await knowledgeService.createKb({ name: `kb-p1-${suffix}-${createdKbIds.length}` });
    createdKbIds.push(kb.id);
    const { document_id, job_id } = await parseApiService.upload({
      kb_id: kb.id,
      title: `doc-${suffix}-${createdKbIds.length}`,
      content: MARKDOWN,
    });
    trackJob(job_id);
    return { kbId: kb.id, docId: document_id, jobId: job_id };
  }

  async function countVectors(documentId: number): Promise<number> {
    const { rows } = await pool.query<{ c: number }>(
      'SELECT count(*)::int AS c FROM knowledge_vectors WHERE document_id = $1',
      [documentId],
    );
    return rows[0]?.c ?? 0;
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
    ({ createPureTextProcessor } = await import('../../backend/services/parse-processor.service.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ parseApiService } = await import('../../backend/services/parse-api.service.js'));
    ({ retrievalService } = await import('../../backend/services/retrieval.service.js'));
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ knowledgeChunkRepository } = await import('../../backend/repositories/knowledge-chunk.repository.js'));
    ({ ollamaEmbedder } = await import('../../backend/embedding/ollama.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    await assertTestDatabase(pool, TEST_DB_NAME);

    // Deterministic embeddings — no Ollama needed. Each chunk gets a fixed
    // 1024-dim vector, so the vector index is populated exactly once per chunk.
    vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map(() => new Array<number>(1024).fill(0.1)),
      failed: [],
    }));
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
    }
    try {
      await pool.end();
    } catch {
      /* pool already closed */
    }
    if (envSnapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    vi.resetModules();
  });

  it('success: a pure-text job goes pending → succeeded and closes the retrieval loop', async () => {
    const { kbId, docId, jobId } = await uploadKb();
    const claimed = await parseJobRepository.claim(jobId, owner, 60);
    expect(claimed).toBeDefined();

    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createPureTextProcessor() });
    await worker.runJob(claimed!);

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('succeeded');

    const doc = await knowledgeRepository.findDocumentById(docId);
    expect(doc!.parse_status).toBe('completed');
    expect(doc!.content).toBe(MARKDOWN);

    const latest = await knowledgeRepository.latestRevision(docId);
    expect(latest!.content).toBe(MARKDOWN);
    expect(latest!.revision_no).toBeGreaterThanOrEqual(2);

    const chunkCount = await knowledgeChunkRepository.countByDocument(docId);
    expect(chunkCount).toBeGreaterThan(0);
    expect(await countVectors(docId)).toBe(chunkCount);

    const hits = await retrievalService.lexicalSearch({ query: 'zephyrquasar', kb_id: kbId, is_internal: true });
    expect(hits.some((h) => h.document_id === docId)).toBe(true);
  });

  it('a stale worker (lease reclaimed) cannot write downstream', async () => {
    const { docId, jobId } = await uploadKb();
    const claimed = await parseJobRepository.claim(jobId, owner, 60);

    await pool.query(`UPDATE parse_jobs SET lease_expires_at = now() - interval '5 seconds' WHERE id = $1`, [jobId]);
    await reclaimJob(jobId);

    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createPureTextProcessor() });
    await worker.runJob(claimed!); // stale lease_version → commit fence → LEASE_LOST → no-op

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('pending');
    expect(job!.lease_owner).toBeNull();

    expect(await documentParseStatus(docId)).toBe('pending');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1); // only the upload's rev1
  });

  it('a cancelled job writes nothing', async () => {
    const { docId, jobId } = await uploadKb();
    const claimed = await parseJobRepository.claim(jobId, owner, 60);

    await parseJobService.cancel(jobId);

    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createPureTextProcessor() });
    await worker.runJob(claimed!); // commit fence → CANCELLED → no-op

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('cancelled');

    expect(await documentParseStatus(docId)).toBe('pending');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1);
  });

  it('a parent-KB soft-delete permanently fails the job without writing', async () => {
    const { kbId, docId, jobId } = await uploadKb();
    const claimed = await parseJobRepository.claim(jobId, owner, 60);

    await knowledgeService.deleteKb(kbId);

    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createPureTextProcessor() });
    await worker.runJob(claimed!); // findDocumentById → undefined → DOCUMENT_GONE → permanent fail

    const job = await parseJobRepository.findById(jobId);
    expect(job!.status).toBe('failed');
    expect(job!.error_code).toBe('DOCUMENT_GONE');

    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1);
  });

  it('an old parse is fenced out by a newer job (SUPERSEDED), then the new one completes', async () => {
    const { docId, jobId: jobA } = await uploadKb();
    const claimedA = await parseJobRepository.claim(jobA, owner, 60);

    // A newer job supersedes jobA.
    const { job_id: jobB } = await parseApiService.reparse({ doc_id: docId });
    trackJob(jobB);

    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createPureTextProcessor() });
    await worker.runJob(claimedA!); // commit fence → current_parse_job_id != jobA → SUPERSEDED

    const a = await parseJobRepository.findById(jobA);
    expect(a!.status).toBe('failed');
    expect(a!.error_code).toBe('SUPERSEDED');
    expect(await documentParseStatus(docId)).toBe('pending');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countRevisions(docId)).toBe(1);

    // The newer job then completes and publishes.
    const claimedB = await parseJobRepository.claim(jobB, owner, 60);
    await worker.runJob(claimedB!);

    const b = await parseJobRepository.findById(jobB);
    expect(b!.status).toBe('succeeded');
    const doc = await knowledgeRepository.findDocumentById(docId);
    expect(doc!.parse_status).toBe('completed');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBeGreaterThan(0);
    expect(await countVectors(docId)).toBeGreaterThan(0);
  });
});
