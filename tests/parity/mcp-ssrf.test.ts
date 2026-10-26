// B-4 — SSRF for agent.mcp_test / agent.mcp_call, isolated.
//
// Two vulnerabilities are closed and proven here:
//   1. DNS-rebinding TOCTOU — the MCP client used to `checkMcpUrl()` (resolve +
//      classify) and then a separate undici `fetch()` that re-resolved. A host
//      could flip public→loopback between the two lookups. The client now goes
//      through `validateMcpUrl` → `requestPinned`: resolve once, classify every
//      address, pin the socket to those validated addresses (no second lookup).
//   2. Loopback was always allowed — `checkMcpUrl` returned `ok` for 127.0.0.0/8
//      and ::1, so a caller could probe local services. `validateMcpUrl` is
//      default-deny (loopback/private/link-local/metadata/reserved/ULA/multicast
//      all refused); only an explicitly trusted endpoint (hostname/IP, optionally
//      "host:port") may be non-public. There is no "open all of localhost" switch.
//
// No database and no external network: classification is DNS-only (with an
// injectable resolver seam), and the real wire protocol is exercised against a
// loopback JSON-RPC 2.0 stub that the client reaches only because the test
// explicitly trusts `127.0.0.1`.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { lookup } from 'node:dns/promises';
import { McpHttpClient, McpClientError } from '../../backend/services/mcp-client.js';
import { validateMcpUrl, __setResolveAll } from '../../backend/services/ssrf-fetch.js';
import { requiredRoleForPath } from '../../server/middleware/operation-auth.js';

const defaultResolver = (h: string) => lookup(h, { all: true });

describe('validateMcpUrl — default-deny classification (DNS-only)', () => {
  afterEach(() => __setResolveAll(defaultResolver));

  it('denies IPv4 loopback', async () => {
    for (const u of ['http://127.0.0.1/', 'http://127.0.0.1:8080/mcp', 'http://2130706433/', 'http://0x7f000001/']) {
      await expect(validateMcpUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('denies IPv6 loopback', async () => {
    await expect(validateMcpUrl('http://[::1]/')).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
  });

  it('denies the cloud metadata address (169.254.169.254)', async () => {
    await expect(validateMcpUrl('http://169.254.169.254/latest/meta-data/')).resolves.toMatchObject({
      ok: false,
      kind: 'ssrf_blocked',
    });
  });

  it('denies RFC1918 / CGNAT private ranges', async () => {
    for (const u of ['http://192.168.1.1/', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://100.64.0.1/']) {
      await expect(validateMcpUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('denies link-local / ULA / unspecified IPv6', async () => {
    for (const u of ['http://[fe80::1]/', 'http://[fc00::1]/', 'http://[::]/']) {
      await expect(validateMcpUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('denies IPv4-mapped IPv6 (::ffff:…)', async () => {
    for (const u of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[::ffff:10.0.0.1]/']) {
      await expect(validateMcpUrl(u)).resolves.toMatchObject({ ok: false, kind: 'ssrf_blocked' });
    }
  });

  it('accepts a legal public address', async () => {
    for (const u of ['http://8.8.8.8/', 'https://93.184.216.34/']) {
      await expect(validateMcpUrl(u)).resolves.toMatchObject({ ok: true });
    }
  });

  it('reports invalid_url for an unresolvable hostname', async () => {
    __setResolveAll(async () => {
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    });
    await expect(validateMcpUrl('http://no-such-host.invalid/')).resolves.toMatchObject({
      ok: false,
      kind: 'invalid_url',
    });
  });
});

describe('validateMcpUrl — explicit trusted endpoints', () => {
  afterEach(() => __setResolveAll(defaultResolver));

  it('allows a trusted IPv4 loopback endpoint', async () => {
    await expect(validateMcpUrl('http://127.0.0.1:8080/mcp', { trustedHosts: ['127.0.0.1'] })).resolves.toMatchObject({ ok: true });
  });

  it('allows a trusted IPv6 loopback endpoint', async () => {
    await expect(validateMcpUrl('http://[::1]:8080/mcp', { trustedHosts: ['[::1]'] })).resolves.toMatchObject({ ok: true });
  });

  it('scopes trust to the named host:port and not other ports', async () => {
    await expect(validateMcpUrl('http://localhost:8080/mcp', { trustedHosts: ['localhost:8080'] })).resolves.toMatchObject({ ok: true });
    await expect(validateMcpUrl('http://localhost:9090/mcp', { trustedHosts: ['localhost:8080'] })).resolves.toMatchObject({
      ok: false,
      kind: 'ssrf_blocked',
    });
  });

  it('does not widen trust to a different host', async () => {
    await expect(validateMcpUrl('http://127.0.0.2/mcp', { trustedHosts: ['127.0.0.1'] })).resolves.toMatchObject({
      ok: false,
      kind: 'ssrf_blocked',
    });
  });
});

describe('McpHttpClient — SSRF + DNS pinning (real loopback transport)', () => {
  let server: http.Server;
  let port = 0;
  let requests = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests += 1;
      const path = req.url ?? '/';
      if (path === '/redirect') {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let payload: any;
        try { payload = JSON.parse(body); } catch { payload = {}; }
        const id = payload.id ?? null;
        res.writeHead(200, { 'content-type': 'application/json' });
        if (payload.method === 'initialize') {
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'stub', version: '1.0.0' } } }));
        }
        if (payload.method === 'tools/list') {
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: [{ name: 'echo' }] } }));
        }
        if (payload.method === 'tools/call') {
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(payload.params?.arguments?.value ?? '') }], isError: false } }));
        }
        return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
  });

  afterEach(() => {
    __setResolveAll(defaultResolver);
    requests = 0;
  });

  it('denies loopback / private / metadata before any request leaves the process', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000 }); // no trusted hosts
    await expect(client.initialize({ url: `http://127.0.0.1:${port}/mcp` })).rejects.toMatchObject({ kind: 'ssrf_blocked' });
    await expect(client.initialize({ url: 'http://169.254.169.254/latest/meta-data/' })).rejects.toMatchObject({ kind: 'ssrf_blocked' });
    await expect(client.initialize({ url: 'http://10.0.0.1/mcp' })).rejects.toMatchObject({ kind: 'ssrf_blocked' });
    expect(requests).toBe(0);
  });

  it('performs a real handshake + tools/call over the pinned transport (trusted endpoint)', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    const info = await client.initialize({ url: `http://127.0.0.1:${port}/mcp` });
    expect(info.protocolVersion).toBe('2025-03-26');

    const tools = await client.listTools({ url: `http://127.0.0.1:${port}/mcp` });
    expect(tools.map((t) => t.name)).toContain('echo');

    const call = await client.callTool({ url: `http://127.0.0.1:${port}/mcp` }, 'echo', { value: 'hi' });
    expect(call.isError).toBe(false);
    expect(call.content[0].text).toBe('hi');
  });

  it('refuses a redirect and never follows it to the metadata target', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    await expect(client.initialize({ url: `http://127.0.0.1:${port}/redirect` })).rejects.toMatchObject({ kind: 'redirect' });
    // Only the initial request was made; the 169.254.169.254 target was never dialed.
    expect(requests).toBe(1);
  });

  it('maps a refused connection to connection_failed (abnormal connection)', async () => {
    const dead = http.createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', () => r()));
    const deadPort = (dead.address() as AddressInfo).port;
    await new Promise<void>((r) => dead.close(() => r()));

    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    await expect(client.initialize({ url: `http://127.0.0.1:${deadPort}/mcp` })).rejects.toMatchObject({ kind: 'connection_failed' });
  });

  it('pins the validated address — DNS rebinding cannot reach loopback', async () => {
    let calls = 0;
    __setResolveAll(async () => {
      calls += 1;
      // First (and only) resolution: public. A second resolution — the rebinding
      // attack — would flip to loopback, where our stub listens.
      if (calls === 1) return [{ address: '8.8.8.8', family: 4 }];
      return [{ address: '127.0.0.1', family: 4 }];
    });

    const client = new McpHttpClient({ timeoutMs: 500 }); // no trusted hosts
    // 8.8.8.8 is unreachable here, so the handshake must fail — but critically it
    // must fail WITHOUT ever dialing the loopback stub.
    await expect(
      client.initialize({ url: `http://rebind.attacker.test:${port}/mcp` }),
    ).rejects.toBeInstanceOf(McpClientError);

    // Pin proof: the resolver was consulted exactly once (during validation), and
    // the loopback server never received the request.
    expect(calls).toBe(1);
    expect(requests).toBe(0);
  });
});

describe('B-1 policy on agent MCP ops (SSRF surface)', () => {
  it('agent.mcp_call is admin-only; agent.mcp_test is read-only viewer', () => {
    // agent.mcp_call mutates state (risk: write, scope: agent:write) → admin.
    expect(requiredRoleForPath('POST', '/api/v2/ops/agent/mcp_call')).toBe('admin');
    // agent.mcp_test is a read-only connectivity probe (risk: read) → viewer.
    // Its SSRF surface is neutralized by validateMcpUrl default-deny above.
    expect(requiredRoleForPath('POST', '/api/v2/ops/agent/mcp_test')).toBe('viewer');
  });
});
