// P1-B — trusted image↔document ownership (方案 A), real DB-backed test.
//
// `document_images` is the sole authority for image access. This suite proves,
// against a real isolated `microera_wiki_test` database, that:
//   - a registered image is accessible only while its document AND parent KB
//     are active (deleted_at IS NULL),
//   - an unregistered name is never accessible,
//   - pasting `/api/images/<name>` into a document body (forged markdown) does
//     NOT grant access — the old `documents.content` substring gate is gone,
//   - registration is idempotent under UNIQUE(document_id, image_name), and
//   - the DB-level unique constraint rejects duplicate (document, image) rows.
//
// Like `parse-job-db.test.ts`, it self-provisions the schema, seeds UNIQUE rows
// (no TRUNCATE), and skips gracefully when Postgres is unreachable.
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

describe.skipIf(!dbAvailable)('P1-B document_images ownership (isolated test DB)', () => {
  let knowledgeRepository: typeof import('../../backend/repositories/knowledge.repository.js')['knowledgeRepository'];
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let documentImageRepository: typeof import('../../backend/repositories/document-image.repository.js')['documentImageRepository'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  const envSnapshot: Record<string, string | undefined> = {};

  let activeKbId = 0;
  let activeDocId = 0;
  let deletedDocKbId = 0;
  let deletedDocId = 0;
  let deletedKbId = 0;
  let forgedDocId = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const activeImg = `img_${suffix}_active.png`;
  const deletedDocImg = `img_${suffix}_deleted_doc.png`;
  const deletedKbImg = `img_${suffix}_deleted_kb.png`;
  const forgedImg = `img_${suffix}_forged.png`;

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

    // 2. Apply migrations to the test DB (serialized via advisory lock).
    const testPool = new pg.Pool({ connectionString: TEST_DB_URL });
    await assertTestDatabase(testPool, TEST_DB_NAME);
    await applyMigrations(TEST_DB_URL, MIGRATIONS_DIR);
    await testPool.end();

    // 3. Re-point the real singletons at the test DB and load them fresh.
    process.env.DATABASE_URL = TEST_DB_URL;
    vi.resetModules();
    ({ knowledgeRepository } = await import('../../backend/repositories/knowledge.repository.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ documentImageRepository } = await import('../../backend/repositories/document-image.repository.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    await assertTestDatabase(pool, TEST_DB_NAME);

    // 4. Seed an active KB/document with a registered image.
    const activeKb = await knowledgeService.createKb({ name: `active-${suffix}`, slug: `active-${suffix}` });
    activeKbId = activeKb.id;
    const active = await knowledgeService.createDocumentWithRevision({ kbId: activeKbId, title: 'Active doc', content: 'content' });
    activeDocId = active.document.id;
    await documentImageRepository.registerImages(activeDocId, [activeImg]);

    // 5. A document we then soft-delete (its image must become inaccessible).
    const deletedDocKb = await knowledgeService.createKb({ name: `del-doc-${suffix}`, slug: `del-doc-${suffix}` });
    deletedDocKbId = deletedDocKb.id;
    const deletedDoc = await knowledgeService.createDocumentWithRevision({ kbId: deletedDocKbId, title: 'Delete me', content: 'content' });
    deletedDocId = deletedDoc.document.id;
    await documentImageRepository.registerImages(deletedDocId, [deletedDocImg]);
    await knowledgeService.deleteDocument(deletedDocId);

    // 6. A KB we then soft-delete (its document's image must become inaccessible).
    const deletedKb = await knowledgeService.createKb({ name: `del-kb-${suffix}`, slug: `del-kb-${suffix}` });
    deletedKbId = deletedKb.id;
    const deletedKbDoc = await knowledgeService.createDocumentWithRevision({ kbId: deletedKbId, title: 'In deleted KB', content: 'content' });
    await documentImageRepository.registerImages(deletedKbDoc.document.id, [deletedKbImg]);
    await knowledgeService.deleteKb(deletedKbId);

    // 7. Forged markdown: an image reference pasted into content, never registered.
    const forged = await knowledgeService.createDocumentWithRevision({ kbId: activeKbId, title: 'Forged', content: 'content' });
    forgedDocId = forged.document.id;
    await knowledgeService.updateDocument(forgedDocId, { content: `![x](/api/images/${forgedImg})` });
  }, 60000);

  afterAll(async () => {
    if (pool && (activeKbId || deletedDocKbId || deletedKbId)) {
      try {
        // Cascade removes docs → document_images rows for all seeded KBs.
        await pool.query(
          'DELETE FROM knowledge_bases WHERE id = ANY($1::int[])',
          [[activeKbId, deletedDocKbId, deletedKbId].filter(Boolean)],
        );
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

  it('serves an image registered to an active document in an active KB', async () => {
    expect(await documentImageRepository.isImageAccessible(activeImg)).toBe(true);
  });

  it('rejects an unregistered image name', async () => {
    expect(await documentImageRepository.isImageAccessible(`img_${suffix}_nope.png`)).toBe(false);
  });

  it('rejects forged markdown: content reference without registration grants nothing', async () => {
    // Prove the forged name IS present in content (the old strpos gate would have
    // matched it) yet ownership is denied.
    const { rows } = await pool.query('SELECT content FROM documents WHERE id = $1', [forgedDocId]);
    expect(rows[0].content).toContain(`/api/images/${forgedImg}`);
    expect(await documentImageRepository.isImageAccessible(forgedImg)).toBe(false);
  });

  it('rejects an image whose document was soft-deleted', async () => {
    expect(await documentImageRepository.isImageAccessible(deletedDocImg)).toBe(false);
  });

  it('rejects an image whose parent KB was soft-deleted', async () => {
    expect(await documentImageRepository.isImageAccessible(deletedKbImg)).toBe(false);
  });

  it('registration is idempotent under UNIQUE(document_id, image_name)', async () => {
    await documentImageRepository.registerImages(activeDocId, [activeImg]);
    await documentImageRepository.registerImages(activeDocId, [activeImg]);
    const rows = await documentImageRepository.listByDocument(activeDocId);
    expect(rows.filter((r) => r.image_name === activeImg)).toHaveLength(1);
  });

  it('the DB unique constraint rejects a duplicate (document, image) row', async () => {
    await expect(
      pool.query('INSERT INTO document_images (document_id, image_name) VALUES ($1, $2)', [activeDocId, activeImg]),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
