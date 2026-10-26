// P1-B — real HTTP matrix for /api/images against trusted ownership (方案 A).
//
// This spins up the REAL Express app on an isolated test DB (`microera_wiki_test`)
// AND an isolated DATA_DIR (temp dir), then exercises the actual route end to
// end — no repository stubbing. It proves, over real HTTP:
//   anonymous → 401, registered+active → 200, soft-deleted document → 404,
//   soft-deleted KB → 404, unregistered name → 404, forged-markdown reference →
//   404 (a name pasted into `documents.content` but never registered), and
//   traversal name → 400.
//
// Self-provisioning + unique rows (no TRUNCATE), graceful skip without Postgres.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
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

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'microera-images-http-'));

// Isolate both the DB and the images directory BEFORE the app modules load.
process.env.DATA_DIR = tmpDataDir;
process.env.DATABASE_URL = TEST_DB_URL;

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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe.skipIf(!dbAvailable)('P1-B /api/images real HTTP matrix (isolated test DB)', () => {
  let knowledgeService: typeof import('../../backend/services/knowledge.service.js')['knowledgeService'];
  let documentImageRepository: typeof import('../../backend/repositories/document-image.repository.js')['documentImageRepository'];
  let createApp: typeof import('../../backend/app.js')['createApp'];
  let signToken: typeof import('../../server/middleware/auth.js')['signToken'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  const envSnapshot: Record<string, string | undefined> = {};

  let server: Server;
  let baseUrl: string;
  let token: string;

  let activeKbId = 0;
  let deletedDocKbId = 0;
  let deletedKbId = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const activeImg = `img_${suffix}_http.png`;
  const deletedDocImg = `img_${suffix}_http_del_doc.png`;
  const deletedKbImg = `img_${suffix}_http_del_kb.png`;
  const unregisteredImg = `img_${suffix}_http_unreg.png`;
  const forgedImg = `img_${suffix}_http_forged.png`;

  function writeImage(name: string): void {
    const dir = path.join(tmpDataDir, 'images');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), PNG);
  }

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

    // 3. Load the real app + services fresh against the isolated DB/DATA_DIR.
    vi.resetModules();
    ({ createApp } = await import('../../backend/app.js'));
    ({ signToken } = await import('../../server/middleware/auth.js'));
    ({ knowledgeService } = await import('../../backend/services/knowledge.service.js'));
    ({ documentImageRepository } = await import('../../backend/repositories/document-image.repository.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
    await assertTestDatabase(pool, TEST_DB_NAME);

    // 4. Seed: active doc + registered image (200 path).
    const activeKb = await knowledgeService.createKb({ name: `http-active-${suffix}`, slug: `http-active-${suffix}` });
    activeKbId = activeKb.id;
    const active = await knowledgeService.createDocumentWithRevision({ kbId: activeKbId, title: 'Active', content: 'content' });
    await documentImageRepository.registerImages(active.document.id, [activeImg]);
    writeImage(activeImg);

    // 5. Soft-deleted document.
    const delDocKb = await knowledgeService.createKb({ name: `http-del-doc-${suffix}`, slug: `http-del-doc-${suffix}` });
    deletedDocKbId = delDocKb.id;
    const delDoc = await knowledgeService.createDocumentWithRevision({ kbId: deletedDocKbId, title: 'Del doc', content: 'content' });
    await documentImageRepository.registerImages(delDoc.document.id, [deletedDocImg]);
    writeImage(deletedDocImg);
    await knowledgeService.deleteDocument(delDoc.document.id);

    // 6. Soft-deleted KB.
    const delKb = await knowledgeService.createKb({ name: `http-del-kb-${suffix}`, slug: `http-del-kb-${suffix}` });
    deletedKbId = delKb.id;
    const delKbDoc = await knowledgeService.createDocumentWithRevision({ kbId: deletedKbId, title: 'Del kb doc', content: 'content' });
    await documentImageRepository.registerImages(delKbDoc.document.id, [deletedKbImg]);
    writeImage(deletedKbImg);
    await knowledgeService.deleteKb(deletedKbId);

    // 7. Unregistered file (exists on disk, no ownership row).
    writeImage(unregisteredImg);

    // 8. Forged markdown (file exists + content references it, never registered).
    writeImage(forgedImg);
    const forged = await knowledgeService.createDocumentWithRevision({ kbId: activeKbId, title: 'Forged', content: 'content' });
    await knowledgeService.updateDocument(forged.document.id, { content: `![x](/api/images/${forgedImg})` });

    // 9. Start the real app.
    const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    token = signToken({ userId: 1, username: 'admin', role: 'admin' });
  }, 60000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (pool && (activeKbId || deletedDocKbId || deletedKbId)) {
      try {
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
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    if (envSnapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    vi.resetModules();
  });

  function get(name: string, auth = true): Promise<Response> {
    return fetch(`${baseUrl}/api/images/${name}`, {
      headers: auth ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('401s an anonymous request', async () => {
    const res = await get(activeImg, false);
    expect(res.status).toBe(401);
  });

  it('serves a registered image of an active document (200, image/png)', async () => {
    const res = await get(activeImg);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('404s an image whose document was soft-deleted', async () => {
    expect((await get(deletedDocImg)).status).toBe(404);
  });

  it('404s an image whose parent KB was soft-deleted', async () => {
    expect((await get(deletedKbImg)).status).toBe(404);
  });

  it('404s an unregistered image even though the file exists on disk', async () => {
    expect((await get(unregisteredImg)).status).toBe(404);
  });

  it('404s forged markdown: content reference grants no access', async () => {
    expect((await get(forgedImg)).status).toBe(404);
  });

  it('400s a traversal name before any DB/file access', async () => {
    expect((await get('..%2F..%2Fetc%2Fpasswd')).status).toBe(400);
  });
});
