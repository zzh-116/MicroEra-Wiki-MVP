// P1-2 — authenticated extracted-image route. Replaces the former unauthenticated
// `express.static` mount, which let a guessed image filename bypass the parent-KB
// soft-delete access control. Covers the name/traversal guard as a pure unit, and
// the auth + association + file-existence behavior through the real Express app
// with only the repository association check stubbed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import { isValidImageName } from '../../server/routes/images.js';
import { createApp } from '../../backend/app.js';
import { signToken } from '../../server/middleware/auth.js';
import { documentImageRepository } from '../../backend/repositories/document-image.repository.js';
import { config } from '../../backend/config.js';

// ---- Pure name/traversal guard ---------------------------------------------
describe('isValidImageName (P1-2 traversal guard)', () => {
  it('accepts parser-generated names', () => {
    expect(isValidImageName('img_123_0.png')).toBe(true);
    expect(isValidImageName('img_123_1.jpg')).toBe(true);
    expect(isValidImageName('a.webp')).toBe(true);
  });

  it('rejects path traversal and separators', () => {
    expect(isValidImageName('../secret.png')).toBe(false);
    expect(isValidImageName('..%2fsecret.png')).toBe(false);
    expect(isValidImageName('..%2Fsecret.png')).toBe(false);
    expect(isValidImageName('img_.._x.png')).toBe(false); // embedded `..`
    expect(isValidImageName('a/b.png')).toBe(false);
    expect(isValidImageName('a\\b.png')).toBe(false);
    expect(isValidImageName('..')).toBe(false);
    expect(isValidImageName('.hidden.png')).toBe(false);
    expect(isValidImageName('-lead.png')).toBe(false);
    expect(isValidImageName('')).toBe(false);
  });
});

// ---- HTTP route behavior ----------------------------------------------------
describe('P1-2 — GET /api/images/:name', () => {
  let server: Server;
  let baseUrl: string;
  let token: string;
  const imageName = `img_${Date.now()}_test.png`;
  let imagePath: string;

  beforeAll(async () => {
    const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    token = signToken({ userId: 1, username: 'admin', role: 'admin' });

    // A real file is needed for the 200 path; write one with a unique name and
    // clean it up in afterAll so the dev data dir is not left dirty.
    const imagesDir = path.join(config.dataDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });
    imagePath = path.join(imagesDir, imageName);
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    try { fs.rmSync(imagePath, { force: true }); } catch { /* already gone */ }
  });
  afterEach(() => vi.restoreAllMocks());

  function get(name: string, auth = true): Promise<Response> {
    return fetch(`${baseUrl}/api/images/${name}`, {
      headers: auth ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('401s an anonymous request (no bearer token)', async () => {
    const res = await get(imageName, false);
    expect(res.status).toBe(401);
  });

  it('serves an image cited by a reachable document (200, image/png)', async () => {
    vi.spyOn(documentImageRepository, 'isImageAccessible').mockResolvedValue(true);
    const res = await get(imageName);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('sends no-store and no conditional-request headers on a protected image (P1-A)', async () => {
    vi.spyOn(documentImageRepository, 'isImageAccessible').mockResolvedValue(true);
    const res = await get(imageName);
    expect(res.status).toBe(200);
    // No browser/proxy caching and no 304 revalidation path: the image is
    // re-authorized on every request.
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('last-modified')).toBeNull();
  });

  it('404s an image not cited by any reachable document (deleted-KB / guessed name)', async () => {
    vi.spyOn(documentImageRepository, 'isImageAccessible').mockResolvedValue(false);
    const res = await get(imageName);
    expect(res.status).toBe(404);
  });

  it('404s a cited image whose file is missing on disk (wrong id)', async () => {
    vi.spyOn(documentImageRepository, 'isImageAccessible').mockResolvedValue(true);
    const res = await get(`img_${Date.now()}_missing.png`);
    expect(res.status).toBe(404);
  });

  it('400s a traversal name before any repository/file access', async () => {
    const spy = vi.spyOn(documentImageRepository, 'isImageAccessible').mockResolvedValue(true);
    const res = await get('..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
