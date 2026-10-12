// Batch C (F9) — PUT /api/entries/:id must not report DB errors as 404.
//
// The route previously wrapped `entryRepository.update` in a blanket catch and
// returned 404 for *every* failure, masking DB/validation errors as "not found".
// It now distinguishes a missing row (update → undefined → 404) from a thrown
// error (→ 500). Driven through the real Express app + real auth middleware with
// only the repository stubbed.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../../backend/app.js';
import { signToken } from '../../server/middleware/auth.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';

let server: Server;
let baseUrl: string;
let token: string;

beforeAll(async () => {
  const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  token = signToken({ userId: 1, username: 'admin', role: 'admin' });
});

afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });
afterEach(() => vi.restoreAllMocks());

function entry(id = 1, overrides: Record<string, unknown> = {}): any {
  return {
    id, title: 'Doc', file_name: undefined, entry_type: 'tech', summary: 's',
    content: 'c', visibility: 'public', category_id: null, created_at: '', updated_at: '',
    tags: [], ...overrides,
  };
}

function put(id: number, body: unknown, auth = true): Promise<Response> {
  return fetch(`${baseUrl}/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe('F9 — PUT /api/entries/:id error mapping', () => {
  it('returns 404 ENTRY_NOT_FOUND when the entry does not exist', async () => {
    vi.spyOn(entryRepository, 'update').mockResolvedValue(undefined as any);
    const res = await put(999, { title: 'x' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('ENTRY_NOT_FOUND');
  });

  it('returns 200 with the updated entry when it exists', async () => {
    vi.spyOn(entryRepository, 'update').mockResolvedValue(entry(1, { title: 'Updated' }));
    const res = await put(1, { title: 'Updated' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe('Updated');
  });

  it('returns 500 UPDATE_FAILED (not 404) when the DB errors', async () => {
    vi.spyOn(entryRepository, 'update').mockRejectedValue(new Error('db exploded'));
    const res = await put(1, { title: 'x' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('UPDATE_FAILED');
  });

  it('returns 401 without a token', async () => {
    const res = await put(1, { title: 'x' }, false);
    expect(res.status).toBe(401);
  });
});
