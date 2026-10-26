// Batch C (E2) — SSRF URL guard + the hand-rolled Streamable HTTP MCP client.
//
// The guard is exercised with no network I/O (numeric/private literals), and the
// client is driven against a real loopback JSON-RPC 2.0 stub so the wire
// protocol (initialize / tools/list / tools/call) and every error mapping
// (timeout, connection failure, tool-not-found, SSRF block) are covered without
// any external service.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';
import { McpHttpClient } from '../../backend/services/mcp-client.js';
import { validateMcpUrl } from '../../backend/services/ssrf-fetch.js';

describe('mcp-url-guard → validateMcpUrl (SSRF)', () => {
  it('denies loopback by default', async () => {
    const r = await validateMcpUrl('http://127.0.0.1:8080/mcp');
    expect(r.ok).toBe(false);
    expect((r as any).kind).toBe('ssrf_blocked');
  });

  it('allows loopback only for an explicitly trusted host', async () => {
    const r = await validateMcpUrl('http://127.0.0.1:8080/mcp', { trustedHosts: ['127.0.0.1'] });
    expect(r.ok).toBe(true);
  });

  it('blocks the cloud metadata address', async () => {
    const r = await validateMcpUrl('http://169.254.169.254/latest/meta-data');
    expect(r.ok).toBe(false);
    expect((r as any).kind).toBe('ssrf_blocked');
  });

  it('blocks RFC1918 private ranges', async () => {
    for (const host of ['http://192.168.1.1', 'http://10.0.0.1', 'http://172.16.0.1']) {
      const r = await validateMcpUrl(host);
      expect(r.ok).toBe(false);
      expect((r as any).kind).toBe('ssrf_blocked');
    }
  });

  it('rejects non-http(s) schemes', async () => {
    const r = await validateMcpUrl('file:///etc/passwd');
    expect(r.ok).toBe(false);
    expect((r as any).kind).toBe('unsupported_scheme');
  });

  it('rejects embedded credentials', async () => {
    const r = await validateMcpUrl('http://user:pass@127.0.0.1');
    expect(r.ok).toBe(false);
    expect((r as any).kind).toBe('invalid_url');
  });

  it('rejects unparseable URLs', async () => {
    const r = await validateMcpUrl('not a url');
    expect(r.ok).toBe(false);
    expect((r as any).kind).toBe('invalid_url');
  });
});

describe('McpHttpClient — real loopback JSON-RPC', () => {
  let server: Server;
  let url: string;
  const calls: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let payload: any;
        try { payload = JSON.parse(body); } catch { payload = {}; }
        calls.push(payload.method ?? '');
        const id = payload.id ?? null;
        res.writeHead(200, { 'content-type': 'application/json' });
        const respond = (result: any) => res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
        const fail = (code: number, message: string) => res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
        switch (payload.method) {
          case 'initialize':
            return respond({ protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'stub', version: '1.0.0' } });
          case 'tools/list':
            return respond({ tools: [{ name: 'echo', description: 'echo back' }] });
          case 'tools/call':
            if (payload.params?.name === 'echo') {
              return respond({ content: [{ type: 'text', text: String(payload.params?.arguments?.value ?? '') }], isError: false });
            }
            return fail(-32601, 'Tool not found');
          default:
            return fail(-32601, `Method not found: ${payload.method}`);
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => { await new Promise<void>((r) => server?.close(() => r())); });
  afterEach(() => { calls.length = 0; });

  it('initialize performs a real protocol handshake', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    const info = await client.initialize({ url });
    expect(info.protocolVersion).toBe('2025-03-26');
    expect(info.serverInfo.name).toBe('stub');
    expect(calls).toContain('initialize');
  });

  it('listTools enumerates the remote tools', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    const tools = await client.listTools({ url });
    expect(tools.map((t) => t.name)).toContain('echo');
  });

  it('callTool reaches the target and returns the correct result', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    const r = await client.callTool({ url }, 'echo', { value: 'hello' });
    expect(r.isError).toBe(false);
    expect(r.content[0].text).toBe('hello');
    expect(calls).toContain('tools/call');
  });

  it('callTool maps -32601 to tool_not_found', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    await expect(client.callTool({ url }, 'missing', {})).rejects.toMatchObject({ kind: 'tool_not_found' });
  });

  it('refuses a private address before any request leaves the process', async () => {
    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    await expect(client.initialize({ url: 'http://169.254.169.254/latest/meta-data' })).rejects.toMatchObject({ kind: 'ssrf_blocked' });
  });

  it('maps a refused connection to connection_failed', async () => {
    const dead = http.createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', () => r()));
    const deadUrl = `http://127.0.0.1:${(dead.address() as { port: number }).port}`;
    await new Promise<void>((r) => dead.close(() => r()));

    const client = new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] });
    await expect(client.initialize({ url: deadUrl })).rejects.toMatchObject({ kind: 'connection_failed' });
  });

  it('maps a slow server to timeout', async () => {
    const slow = http.createServer(() => { /* never responds */ });
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', () => r()));
    const slowUrl = `http://127.0.0.1:${(slow.address() as { port: number }).port}`;

    const client = new McpHttpClient({ timeoutMs: 50, trustedHosts: ['127.0.0.1'] });
    await expect(client.initialize({ url: slowUrl })).rejects.toMatchObject({ kind: 'timeout' });

    slow.closeAllConnections?.();
    await new Promise<void>((r) => slow.close(() => r()));
  });
});
