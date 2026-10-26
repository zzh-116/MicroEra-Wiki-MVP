// Deleted-KB isolation (object-level authorization fix) — real DB-backed test.
//
// A document whose parent knowledge base is soft-deleted must be unreachable and
// unmodifiable through the ordinary CRUD surface (doc_list/doc_view/download/
// preview/artifacts/revisions/source_view/images/tables/chunk_list/chunk_view
// and the write paths doc_update/doc_delete/doc_restore/doc_move/doc_batch/
// revision_restore/chunk_update/chunk_delete), even though the document row
// itself still has `deleted_at IS NULL`. This suite proves the repository's
// unified `parentKbActive` predicate actually filters at the SQL layer and that
// the services propagate it as `resource_not_found` without leaking content.
//
// Like `parse-job-db.test.ts`, it runs against an isolated `microera_wiki_test`
// database (never the dev DB), self-provisions the schema, and seeds UNIQUE rows
// (no TRUNCATE) so it cannot race the parse-job suite or the dev DB. It skips
// gracefully when Postgres is unreachable.
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

// Async availability probe at collection time → graceful skip without a DB.
let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const LONG_CONTENT = [
  '# Title',
  '',
  'This is the first paragraph of the document and it is long enough to form a chunk on its own without being discarded by the minimum chunk size threshold.',
  '',
  '## Section One',
  '',
  'Here is another paragraph that contains enough text to exceed the minimum chunk size and therefore survive the chunking filter cleanly.',
  '',
].join('\n');
const IMAGE_MARKDOWN = '![logo](/api/images/img_delete_isolation.png)\n';

describe.skipIf(!dbAvailable)('Deleted-KB isolation (isolated test DB)', () => {
  let knowledgeRepository: typeof import('../../backend/repositories/knowledge.repository.js')['knowledgeRepository'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let knowledgeChunkService: typeof import('../../backend/services/chunk.service.js')['knowledgeChunkService'];
  let elementService: typeof import('../../backend/services/element.service.js')['elementService'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  const envSnapshot: Record<string, string | undefined> = {};

  let activeKbId = 0;
  let activeDocId = 0;
  let activeSourceId = 0;
  let deletedKbId = 0;
  let deletedDocId = 0;
  let deletedSourceId = 0;
  let deletedChunkId = '';

  beforeAll(async () => {
    envSnapshot.DATABASE_URL = process.env.DATABASE_URL;

    // 1. Create the isolated test DB if it does not exist yet.
    const admin = new pg.Pool({ connectionString: ADMIN_URL });
    try {
      const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
      if (rows.length === 0) await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    } finally {
      await admin.end();
    }

    // 2. Apply migrations to the test DB (mirrors parse-job-db.test.ts),
    //    serialized across concurrent suites via a Postgres advisory lock.
    const testPool = new pg.Pool({ connectionString: TEST_DB_URL });
    await assertTestDatabase(testPool, TEST_DB_NAME);
    await applyMigrations(TEST_DB_URL, MIGRATIONS_DIR);
    await testPool.end();

    // 3. Re-point the real singletons at the test DB and load them fresh.
    process.env.DATABASE_URL = TEST_DB_URL;
    vi.resetModules();
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ knowledgeChunkService } = await import('../../backend/services/chunk.service.js'));
    ({ elementService } = await import('../../backend/services/element.service.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    await assertTestDatabase(pool, TEST_DB_NAME);

    // 4. Seed a unique active KB + document, and a unique KB we then soft-delete.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const activeKb = await knowledgeService.createKb({ name: `active-${suffix}`, slug: `active-${suffix}` });
    activeKbId = activeKb.id;
    const active = await knowledgeService.createDocumentWithRevision({ kbId: activeKbId, title: 'Active doc', content: LONG_CONTENT });
    activeDocId = active.document.id;
    activeSourceId = active.source.id;

    const deletedKb = await knowledgeService.createKb({ name: `deleted-${suffix}`, slug: `deleted-${suffix}` });
    deletedKbId = deletedKb.id;
    const deleted = await knowledgeService.createDocumentWithRevision({ kbId: deletedKbId, title: 'Deleted-KB doc', content: LONG_CONTENT });
    deletedDocId = deleted.document.id;
    deletedSourceId = deleted.source.id;
    // Seed real chunks + an image element while the KB is still active.
    await knowledgeChunkService.rechunk(deletedDocId, { strategy: 'markdown' });
    await elementService.extractAndSave(deletedDocId, IMAGE_MARKDOWN);
    const chunkList = await knowledgeChunkService.list(deletedDocId);
    deletedChunkId = chunkList.items[0]?.id ?? '';
    expect(chunkList.items.length).toBeGreaterThan(0);

    // Soft-delete the parent KB (not the document).
    await knowledgeService.deleteKb(deletedKbId);
  }, 60000);

  afterAll(async () => {
    // Hard-delete only the seeded KBs (cascade removes their docs/sources/
    // revisions/chunks/elements) so runs stay deterministic without TRUNCATE.
    if (pool && (activeKbId || deletedKbId)) {
      try {
        await pool.query('DELETE FROM knowledge_bases WHERE id = ANY($1::int[])', [[activeKbId, deletedKbId]]);
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

  // ── Repository-level: the SQL predicate actually filters ────────────────
  it('findDocumentById returns the active-KB document and undefined for the deleted-KB one', async () => {
    expect(await knowledgeRepository.findDocumentById(activeDocId)).toBeDefined();
    expect(await knowledgeRepository.findDocumentById(deletedDocId)).toBeUndefined();
  });

  it('listDocuments excludes documents whose parent KB is deleted', async () => {
    const active = await knowledgeRepository.listDocuments({ kbId: activeKbId });
    expect(active.items.some((d) => d.id === activeDocId)).toBe(true);

    const deleted = await knowledgeRepository.listDocuments({ kbId: deletedKbId });
    expect(deleted.total).toBe(0);
    expect(deleted.items).toHaveLength(0);
  });

  it('findSourceById returns undefined for a source in a deleted KB', async () => {
    expect(await knowledgeRepository.findSourceById(activeSourceId)).toBeDefined();
    expect(await knowledgeRepository.findSourceById(deletedSourceId)).toBeUndefined();
  });

  it('findDocumentByIdIncludingDeleted still blocks a deleted-KB document (no resurrection)', async () => {
    expect(await knowledgeRepository.findDocumentByIdIncludingDeleted(deletedDocId)).toBeUndefined();
  });

  // ── Service-level: reads return resource_not_found, no content leak ─────
  it('viewDocument / download / preview / artifacts are unreachable for a deleted-KB document', async () => {
    await expect(knowledgeService.viewDocument(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.downloadDocument(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.previewDocument(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.listArtifacts(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('viewSource and viewRevision are unreachable for a deleted-KB document', async () => {
    await expect(knowledgeService.viewSource(deletedSourceId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.viewRevision(deletedDocId, 1)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('chunk list/view and element images/tables are unreachable for a deleted-KB document', async () => {
    await expect(knowledgeChunkService.list(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeChunkService.view(deletedDocId, deletedChunkId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(elementService.listImages(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(elementService.listTables(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  // ── Service-level: writes cannot bypass the deleted-KB guard ────────────
  it('updateDocument / deleteDocument / restoreDocument / moveDocument are blocked', async () => {
    await expect(knowledgeService.updateDocument(deletedDocId, { title: 'hijacked' })).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.deleteDocument(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.restoreDocument(deletedDocId)).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeService.moveDocument(deletedDocId, null)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('batchDeleteDocuments reports the deleted-KB document as missing and does NOT soft-delete it', async () => {
    const out = await knowledgeService.batchDeleteDocuments([deletedDocId]);
    expect(out.deleted).toBe(0);
    expect(out.missing).toEqual([deletedDocId]);

    const { rows } = await pool.query('SELECT deleted_at FROM documents WHERE id = $1', [deletedDocId]);
    expect(rows[0].deleted_at).toBeNull(); // the document row was never touched
  });

  it('chunk update/remove are blocked for a deleted-KB document', async () => {
    await expect(knowledgeChunkService.update(deletedDocId, deletedChunkId, 'tampered')).rejects.toMatchObject({ kind: 'resource_not_found' });
    await expect(knowledgeChunkService.remove(deletedDocId, deletedChunkId)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
