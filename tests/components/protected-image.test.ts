// P1-A — blob-backed protected-image lifecycle.
//
// AuthImage renders `/api/images/*` by fetching with the bearer token and
// rendering an object URL. The security property under test is that the object
// URL is revoked exactly once and never survives a logout / token change /
// identity change. These tests exercise the real `ProtectedImageLoader` that
// AuthImage uses, against a simulated browser (a real async `fetch` + object-URL
// callbacks); only the browser-only primitives (`URL.createObjectURL`) are
// stubbed, so the lifecycle logic itself is tested for real, not mocked away.
import { describe, it, expect, vi } from 'vitest';
import { isProtectedImage, ProtectedImageLoader, type BlobUrlEnvironment } from '../../src/components/protectedImage.js';

interface Env {
  env: BlobUrlEnvironment;
  created: string[];
  revoked: string[];
}

function fakeEnv(overrides: Partial<BlobUrlEnvironment> = {}): Env {
  const created: string[] = [];
  const revoked: string[] = [];
  let seq = 0;
  const env: BlobUrlEnvironment = {
    fetch: vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })),
    createObjectURL: vi.fn((_blob: Blob) => {
      const url = `blob:fake-${++seq}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
    ...overrides,
  };
  return { env, created, revoked };
}

describe('isProtectedImage', () => {
  it('recognizes only the parser /api/images/ form', () => {
    expect(isProtectedImage('/api/images/foo.png')).toBe(true);
    expect(isProtectedImage('/api/other/foo.png')).toBe(false);
    expect(isProtectedImage('https://example.com/a.png')).toBe(false);
    expect(isProtectedImage('')).toBe(false);
  });
});

describe('ProtectedImageLoader blob lifecycle (P1-A)', () => {
  it('fetches with the bearer token and resolves a fresh object URL', async () => {
    const { env, created } = fakeEnv();
    const loader = new ProtectedImageLoader('/api/images/a.png', 'tok-1', env);
    let resolved: string | null = 'pending';
    await loader.load((u) => { resolved = u; });

    expect(resolved).toBe('blob:fake-1');
    expect(env.fetch).toHaveBeenCalledWith('/api/images/a.png', { headers: { Authorization: 'Bearer tok-1' } });
    expect(created).toEqual(['blob:fake-1']);
    expect(env.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object URL exactly once on dispose (logout / token / identity change)', async () => {
    const { env, revoked } = fakeEnv();
    const loader = new ProtectedImageLoader('/api/images/a.png', 'tok-1', env);
    await loader.load(() => {});

    loader.dispose();
    expect(revoked).toEqual(['blob:fake-1']);

    loader.dispose(); // idempotent — never revoke twice
    expect(revoked).toEqual(['blob:fake-1']);
  });

  it('re-authorization (a new loader for a new auth key) revokes the old URL', async () => {
    const { env, revoked } = fakeEnv();
    const first = new ProtectedImageLoader('/api/images/a.png', 'tok-1', env);
    await first.load(() => {});
    first.dispose(); // the effect cleanup that runs when authKey flips

    expect(revoked).toEqual(['blob:fake-1']);
  });

  it('resolves null and leaks no URL when the fetch is unauthorized (expired token)', async () => {
    const { env } = fakeEnv({
      fetch: vi.fn(async () => ({ ok: false, blob: async () => new Blob() })),
    });
    const loader = new ProtectedImageLoader('/api/images/a.png', 'expired', env);
    let resolved: string | null = 'pending';
    await loader.load((u) => { resolved = u; });

    expect(resolved).toBeNull();
    expect(env.createObjectURL).not.toHaveBeenCalled();
    expect(env.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('ignores a late response after dispose — no create, no resolve, no leak', async () => {
    let resolveFetch!: (v: { ok: boolean; blob: () => Promise<Blob> }) => void;
    const fetch = vi.fn(() => new Promise<{ ok: boolean; blob: () => Promise<Blob> }>((r) => { resolveFetch = r; }));
    const { env } = fakeEnv({ fetch });
    const loader = new ProtectedImageLoader('/api/images/a.png', 'tok', env);
    let resolved: string | null = 'pending';
    const p = loader.load((u) => { resolved = u; });

    loader.dispose(); // disposed before the fetch settles
    resolveFetch({ ok: true, blob: async () => new Blob(['x']) });
    await p;

    expect(env.createObjectURL).not.toHaveBeenCalled();
    expect(env.revokeObjectURL).not.toHaveBeenCalled();
    expect(resolved).toBe('pending');
  });
});
