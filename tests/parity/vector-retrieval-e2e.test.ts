// Tier A (Phase 2) — real BGE-M3 vector-retrieval + strict-embedding tests
// against the isolated test database (`microera_wiki_test`), never the dev DB.
//
// The happy path uses the REAL Ollama embedder (`bge-m3`, 1024-dim) — no
// `vi.spyOn(embedBatch)` — proving the end-to-end vector loop:
//   real upload → parse_jobs worker → real embedding → pgvector(1024) →
//   vectorSearch + hybridSearch hit.
//
// The strict-embedding tests use spies to force a specific failure signature
// (the "no mock embedding" rule applies to the real-embedding verification,
// not to fault injection). They assert that a partial/total embedding failure,
// a dimension mismatch, or an empty vector makes the parse FAIL RETRYABLE
// (job → pending, error_code set, document stays pending, nothing published),
// while an empty document is published empty and a failed job can be retried
// to success.
//
// Self-provisioning like parse-phase1-e2e.test.ts: creates the test DB if
// missing, applies the additive migration chain (pgvector + 0019/0020/0021),
// seeds UNIQUE rows, targeted-cleans. The real-Ollama test is gated with
// `it.skipIf(!ollamaReady)` so `vitest run` stays green on CI without Ollama.
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
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// A distinctive topic with THREE markdown sections → deterministic 3 chunks
// (markdown chunking splits per heading).
const MARKDOWN = [
  '# Zephyrquasar Indexing Protocol',
  'The zephyrquasar protocol organizes knowledge into a searchable index for fast retrieval.',
  'It is used here only to prove that a freshly parsed document is retrievable by meaning.',
  '',
  '## Ingestion',
  'The zephyrquasar protocol accepts raw documents and turns them into retrievable chunks',
  'with semantic vectors, so retrieval is driven by meaning rather than keywords alone.',
  '',
  '## Retrieval Integration',
  'The zephyrquasar protocol connects document ingestion to the retrieval pipeline end to',
  'end, so a freshly parsed document is immediately findable through vector search.',
].join('\n');

const KEYWORD_QUERY = 'zephyrquasar';
// Paraphrase query with no exact keyword — exercises semantic (non-lexical) matching.
const SEMANTIC_QUERY =
  'how does the system turn documents into a searchable catalog and connect ingestion to search end to end';

let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

// Real-model readiness: Ollama reachable AND bge-m3 present.
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

describe.skipIf(!dbAvailable)('Tier A — real BGE-M3 vector retrieval + strict embedding E2E', () => {
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let ParseWorker: typeof import('../../backend/services/parse-worker.service.js')['ParseWorker'];
  let createPureTextProcessor: typeof import('../../backend/services/parse-processor.service.js')['createPureTextProcessor'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let parseApiService: typeof import('../../backend/services/parse-api.service.js')['parseApiService'];
  let retrievalService: typeof import('../../backend/services/retrieval.service.js')['retrievalService'];
  let knowledgeChunkRepository: typeof import('../../backend/repositories/knowledge-chunk.repository.js')['knowledgeChunkRepository'];
  let ollamaEmbedder: typeof import('../../backend/embedding/ollama.js')['ollamaEmbedder'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  const envSnapshot: Record<string, string | undefined> = {};

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = `worker-ta-${suffix}`;
  const createdKbIds: number[] = [];
  const createdJobIds: string[] = [];

  function trackJob(jobId: string): void {
    createdJobIds.push(jobId);
  }

  async function uploadKb(content = MARKDOWN): Promise<{ kbId: number; docId: number; jobId: string }> {
    const kb = await knowledgeService.createKb({ name: `kb-ta-${suffix}-${createdKbIds.length}` });
    createdKbIds.push(kb.id);
    const { document_id, job_id } = await parseApiService.upload({
      kb_id: kb.id,
      title: `doc-ta-${suffix}-${createdKbIds.length}`,
      content,
    });
    trackJob(job_id);
    return { kbId: kb.id, docId: document_id, jobId: job_id };
  }

  async function runWorker(jobId: string): Promise<void> {
    const claimed = await parseJobRepository.claim(jobId, owner, 60);
    expect(claimed).toBeDefined();
    const worker = new ParseWorker({ owner, heartbeatMs: 60000, processor: createPureTextProcessor() });
    await worker.runJob(claimed!);
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
    ({ parseJobRepository } = await import('../../backend/repositories/parse-job.repository.js'));
    ({ ParseWorker } = await import('../../backend/services/parse-worker.service.js'));
    ({ createPureTextProcessor } = await import('../../backend/services/parse-processor.service.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ parseApiService } = await import('../../backend/services/parse-api.service.js'));
    ({ retrievalService } = await import('../../backend/services/retrieval.service.js'));
    ({ knowledgeChunkRepository } = await import('../../backend/repositories/knowledge-chunk.repository.js'));
    ({ ollamaEmbedder } = await import('../../backend/embedding/ollama.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    await assertTestDatabase(pool, TEST_DB_NAME);
    // NOTE: no `vi.spyOn(embedBatch)` here — the happy path runs the REAL embedder.
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

  it.skipIf(!ollamaReady)(
    'happy path: real bge-m3 embedding → 1024-dim vectors in pgvector → vectorSearch + hybridSearch hit',
    async () => {
      const { kbId, docId, jobId } = await uploadKb();
      await runWorker(jobId);

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');

      const chunkCount = await knowledgeChunkRepository.countByDocument(docId);
      expect(chunkCount).toBeGreaterThan(0);
      expect(await countVectors(docId)).toBe(chunkCount);
      expect(await vectorDims(docId)).toBe(1024);

      const vec = await retrievalService.vectorSearch({ query: KEYWORD_QUERY, kb_id: kbId, is_internal: true, top_k: 10 });
      expect(vec.some((h) => h.document_id === docId)).toBe(true);
      expect(vec.every((h) => typeof h.score === 'number' && h.score > 0)).toBe(true);

      const sem = await retrievalService.vectorSearch({ query: SEMANTIC_QUERY, kb_id: kbId, is_internal: true, top_k: 10 });
      expect(sem.some((h) => h.document_id === docId)).toBe(true);

      const hybrid = await retrievalService.hybridSearch({ query: KEYWORD_QUERY, kb_id: kbId, is_internal: true, top_k: 10 });
      expect(hybrid.some((h) => h.document_id === docId)).toBe(true);
      expect(hybrid.every((h) => typeof h.score === 'number')).toBe(true);
    },
    120000,
  );

  it('all-success (mocked 1024-dim): every chunk embedded → published', async () => {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map(() => new Array<number>(1024).fill(0.25)),
      failed: [],
    }));
    try {
      const { docId, jobId } = await uploadKb();
      await runWorker(jobId);

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
      const chunkCount = await knowledgeChunkRepository.countByDocument(docId);
      expect(chunkCount).toBeGreaterThan(0);
      expect(await countVectors(docId)).toBe(chunkCount);
      expect(await vectorDims(docId)).toBe(1024);
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('partial failure (mocked): EMBEDDING_FAILED → job fails retryable, nothing published', async () => {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map((_, i) => (i === 0 ? new Array<number>(1024).fill(0.25) : [])),
      failed: texts.slice(1).map((_, i) => ({ index: i + 1, error: 'chunk failed' })),
    }));
    try {
      const { docId, jobId } = await uploadKb();
      await runWorker(jobId);

      const job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('pending'); // retryable
      expect(job!.attempt).toBe(1);
      expect(job!.error_code).toBe('EMBEDDING_FAILED');

      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);
      expect(await countRevisions(docId)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('total failure / Ollama unreachable (mocked): EMBEDDING_FAILED → job fails retryable, nothing published', async () => {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map(() => []),
      failed: texts.map((_, index) => ({ index, error: 'ollama unreachable' })),
    }));
    try {
      const { docId, jobId } = await uploadKb();
      await runWorker(jobId);

      const job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('pending');
      expect(job!.error_code).toBe('EMBEDDING_FAILED');

      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);
      expect(await countRevisions(docId)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('dimension mismatch (mocked): EMBEDDING_DIMENSION_MISMATCH → job fails retryable, nothing published', async () => {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map(() => new Array<number>(5).fill(0.1)),
      failed: [],
    }));
    try {
      const { docId, jobId } = await uploadKb();
      await runWorker(jobId);

      const job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('pending');
      expect(job!.error_code).toBe('EMBEDDING_DIMENSION_MISMATCH');

      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);
      expect(await countRevisions(docId)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('empty vector (mocked): EMBEDDING_EMPTY_VECTOR → job fails retryable, nothing published', async () => {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch').mockImplementation(async (texts: string[]) => ({
      vectors: texts.map((_, i) => (i === 1 ? [] : new Array<number>(1024).fill(0.25))),
      failed: [],
    }));
    try {
      const { docId, jobId } = await uploadKb();
      await runWorker(jobId);

      const job = await parseJobRepository.findById(jobId);
      expect(job!.status).toBe('pending');
      expect(job!.error_code).toBe('EMBEDDING_EMPTY_VECTOR');

      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('empty text: no chunks → published empty (NOT an embedding fault)', async () => {
    const { docId, jobId } = await uploadKb('');
    await runWorker(jobId);

    expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
    expect(await documentParseStatus(docId)).toBe('completed');
    expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
    expect(await countVectors(docId)).toBe(0);
  }, 30000);

  it('recovery retry: a failed embedding is retried (same job) to success', async () => {
    const spy = vi.spyOn(ollamaEmbedder, 'embedBatch');
    try {
      const { docId, jobId } = await uploadKb();

      // Attempt 1: total failure → retryable fail, nothing published.
      spy.mockImplementation(async (texts: string[]) => ({
        vectors: texts.map(() => []),
        failed: texts.map((_, index) => ({ index, error: 'ollama down' })),
      }));
      await runWorker(jobId);

      const afterFail = await parseJobRepository.findById(jobId);
      expect(afterFail!.status).toBe('pending');
      expect(afterFail!.error_code).toBe('EMBEDDING_FAILED');
      expect(await documentParseStatus(docId)).toBe('pending');
      expect(await knowledgeChunkRepository.countByDocument(docId)).toBe(0);
      expect(await countVectors(docId)).toBe(0);

      // Attempt 2: Ollama recovers → same job succeeds and publishes fully.
      spy.mockImplementation(async (texts: string[]) => ({
        vectors: texts.map(() => new Array<number>(1024).fill(0.3)),
        failed: [],
      }));
      await runWorker(jobId);

      expect((await parseJobRepository.findById(jobId))!.status).toBe('succeeded');
      expect(await documentParseStatus(docId)).toBe('completed');
      const chunkCount = await knowledgeChunkRepository.countByDocument(docId);
      expect(chunkCount).toBeGreaterThan(0);
      expect(await countVectors(docId)).toBe(chunkCount);
    } finally {
      spy.mockRestore();
    }
  }, 60000);
});
