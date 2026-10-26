// B-4 — SSRF guard for doc.import_url (ssrf-fetch.ts), isolated.
//
// No database here: validatePublicUrl is a pure classification (DNS-only), and
// requestPinnedText is exercised against a local loopback server by passing
// pre-validated addresses directly (it trusts its caller, exactly as documented
// — production always goes through safeFetchText, which validates first).
//
// Coverage demanded by the acceptance list: intranet, cloud metadata, IPv6,
// IPv4-mapped IPv6, mixed encodings, DNS rebinding, redirect, timeout, size
// limit, and a legal public URL.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { lookup } from 'node:dns/promises';
import {
  validatePublicUrl,
  requestPinnedText,
  safeFetchText,
  SafeFetchError,
  __setResolveAll,
} from '../../backend/services/ssrf-fetch.js';

const defaultResolver = (h: string) => lookup(h, { all: true });

let server: http.Server;
let port = 0;
let requestCount = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requestCount += 1;
    const path = req.url ?? '/';
    if (path === '/ok') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello world');
    } else if (path === '/redirect') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    } else if (path === '/large') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(1024 * 1024));
    } else if (path === '/slow') {
      // Never respond — the client must abort on its own timeout.
    } else if (path === '/error') {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('boom');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  // Close lingering /slow sockets so server.close() can settle.
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  __setResolveAll(defaultResolver);
  requestCount = 0;
});

const loopbackAddr = [{ address: '127.0.0.1', family: 4 as const }];

describe('validatePublicUrl — classification (DNS-only)', () => {
  it('rejects non-http schemes', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://10.0.0.1/']) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: false, kind: 'unsupported_scheme' });
    }
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(validatePublicUrl('http://user:pass@8.8.8.8/')).resolves.toMatchObject({
      ok: false,
      kind: 'invalid_url',
    });
  });

  it('rejects unparseable URLs', async () => {
    await expect(validatePublicUrl('not a url')).resolves.toMatchObject({ ok: false, kind: 'invalid_url' });
  });

  it('blocks intranet / RFC1918 / CGNAT ranges', async () => {
    for (const u of [
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://100.64.0.1/',
    ]) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('blocks cloud metadata (169.254.169.254 link-local)', async () => {
    await expect(validatePublicUrl('http://169.254.169.254/latest/meta-data/')).resolves.toMatchObject({
      ok: false,
      kind: 'ssrf_blocked',
    });
  });

  it('blocks IPv6 loopback, link-local and ULA', async () => {
    for (const u of ['http://[::1]/', 'http://[fe80::1]/', 'http://[fc00::1]/']) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('blocks IPv4-mapped IPv6 (::ffff:…)', async () => {
    for (const u of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[::ffff:10.0.0.1]/']) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('blocks IPv4-embedded IPv6 in hex/compatible spellings', async () => {
    for (const u of [
      'http://[::7f00:1]/', // 127.0.0.1, compatible hex form
      'http://[::127.0.0.1]/', // 127.0.0.1, compatible dotted form
      'http://[::ffff:7f00:1]/', // 127.0.0.1, mapped hex form
      'http://[::a00:1]/', // 10.0.0.1, compatible hex form
    ]) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('blocks mixed-encoding IP forms (hex / decimal / trailing dot)', async () => {
    for (const u of ['http://0x7f000001/', 'http://2130706433/', 'http://127.0.0.1./']) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('blocks a hostname that resolves to any loopback address (localhost)', async () => {
    await expect(validatePublicUrl('http://localhost/')).resolves.toMatchObject({
      ok: false,
      kind: 'ssrf_blocked',
    });
  });

  it('reports dns_error when the hostname cannot be resolved', async () => {
    __setResolveAll(async () => {
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    });
    await expect(validatePublicUrl('http://no-such-host.invalid/')).resolves.toMatchObject({
      ok: false,
      kind: 'dns_error',
    });
  });

  it('accepts a legal public address', async () => {
    for (const u of ['http://8.8.8.8/', 'https://93.184.216.34/']) {
      await expect(validatePublicUrl(u)).resolves.toMatchObject({ ok: true });
    }
  });
});

describe('requestPinnedText — HTTP mechanics (trusted loopback target)', () => {
  it('fetches a 200 body', async () => {
    const text = await requestPinnedText(`http://127.0.0.1:${port}/ok`, loopbackAddr);
    expect(text).toBe('hello world');
  });

  it('denies redirects by default (does not follow Location)', async () => {
    await expect(requestPinnedText(`http://127.0.0.1:${port}/redirect`, loopbackAddr)).rejects.toMatchObject({
      kind: 'redirect',
    });
    // The redirected target (cloud metadata) must never be contacted.
    expect(requestCount).toBe(1);
  });

  it('surfaces non-2xx as http_error', async () => {
    await expect(requestPinnedText(`http://127.0.0.1:${port}/error`, loopbackAddr)).rejects.toMatchObject({
      kind: 'http_error',
    });
  });

  it('aborts on timeout', async () => {
    await expect(
      requestPinnedText(`http://127.0.0.1:${port}/slow`, loopbackAddr, { timeoutMs: 400 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('enforces the response-size limit', async () => {
    await expect(
      requestPinnedText(`http://127.0.0.1:${port}/large`, loopbackAddr, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ kind: 'too_large' });
  });
});

describe('safeFetchText — DNS pinning (rebinding defence)', () => {
  it('connects only to the validated address and never re-resolves', async () => {
    let calls = 0;
    __setResolveAll(async (hostname) => {
      calls += 1;
      // First resolution: public. A second resolution (the rebinding attack)
      // would flip to loopback — which is where our local server listens.
      if (calls === 1) return [{ address: '8.8.8.8', family: 4 }];
      return [{ address: '127.0.0.1', family: 4 }];
    });

    // The hostname maps to 8.8.8.8 (unreachable here), so the fetch must fail —
    // but critically it must fail WITHOUT ever dialing 127.0.0.1.
    await expect(
      safeFetchText(`http://rebind.attacker.test:${port}/ok`, { timeoutMs: 500 }),
    ).rejects.toBeInstanceOf(SafeFetchError);

    // Pin proof: the resolver was consulted exactly once (during validation),
    // and the loopback server never received the request.
    expect(calls).toBe(1);
    expect(requestCount).toBe(0);
  });
});
