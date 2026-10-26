// HTTP MCP inbound authentication + listen-address security.
//
// Spins up the real `runHttpServer` (the exact host the `mcp serve --transport
// http` entry uses) against a mock backend, and verifies: anonymous/invalid/
// expired tokens are rejected, a valid caller's own token is forwarded to the
// backend (never the shared MICROERA_TOKEN), concurrent callers stay isolated,
// the optional role gate returns 403, the server binds loopback by default, the
// HTTP transport can be explicitly disabled, and stdio remains auth-free.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runHttpServer } from '../../packages/mcp/src/http.js';
import { authenticate } from '../../packages/mcp/src/auth.js';
import { signToken, verifyToken } from '../../server/middleware/auth.js';
import { config } from '../../backend/config.js';

const TEST_SECRET = 'mcp-http-auth-test-secret';
const SERVER_ADMIN_TOKEN = 'server-admin-token-should-not-leak';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cliEntry = path.join(repoRoot, 'cli', 'src', 'main.ts');

interface Captured {
  method: string;
  url: string;
  authorization: string | undefined;
}

function signJwt(secret: string, payload: Record<string, unknown>, expOffsetSec: number): string {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expOffsetSec };
  const b = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${sig}`;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

async function post(port: number, body: unknown, authorization?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe('HTTP MCP inbound authentication', () => {
  const captured: Captured[] = [];
  let mockServer: http.Server;
  let mockUrl: string;
  let mcpServer: http.Server;
  let mcpPort: number;

  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of ['MICROERA_API_URL', 'MICROERA_HOST', 'MICROERA_TOKEN', 'JWT_SECRET', 'MCP_HOST', 'MCP_HTTP_ENABLED', 'MCP_REQUIRED_ROLE']) {
      savedEnv[k] = process.env[k];
    }
    // Deterministic secrets + base URL. MICROERA_TOKEN is deliberately set to a
    // server-side value so we can prove HTTP callers never inherit it.
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.MICROERA_TOKEN = SERVER_ADMIN_TOKEN;
    delete process.env.MICROERA_HOST;
    delete process.env.MCP_HOST;
    delete process.env.MCP_HTTP_ENABLED;
    delete process.env.MCP_REQUIRED_ROLE;

    // Mock backend: echoes back what it received (never a real DB).
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        captured.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { echoedAuthorization: req.headers.authorization ?? null, url: req.url ?? '' } }));
      });
    });
    await new Promise<void>((r) => mockServer.listen(0, '127.0.0.1', () => r()));
    mockUrl = `http://127.0.0.1:${(mockServer.address() as { port: number }).port}`;
    process.env.MICROERA_API_URL = mockUrl;

    mcpServer = await runHttpServer(await getFreePort(), { host: '127.0.0.1' });
    mcpPort = (mcpServer.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => mcpServer.close(() => r()));
    await new Promise<void>((r) => mockServer.close(() => r()));
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => captured.splice(0, captured.length));

  it('rejects anonymous requests with 401 before touching the backend', async () => {
    const { status, json } = await post(mcpPort, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(401);
    expect(json.error.message).toMatch(/missing/);
    expect(captured).toHaveLength(0);
  });

  it('rejects an invalid token with 401 and never echoes it', async () => {
    const bogus = `Bearer ${signJwt('wrong-secret', { userId: 1, username: 'a', role: 'admin' }, 3600)}`;
    const { status, json } = await post(mcpPort, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, bogus);
    expect(status).toBe(401);
    expect(json.error.message).toMatch(/invalid/);
    expect(JSON.stringify(json)).not.toContain(bogus.split(' ')[1]);
    expect(captured).toHaveLength(0);
  });

  it('rejects an expired token with 401', async () => {
    const expired = `Bearer ${signJwt(TEST_SECRET, { userId: 1, username: 'a', role: 'admin' }, -60)}`;
    const { status, json } = await post(mcpPort, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, expired);
    expect(status).toBe(401);
    expect(json.error.message).toMatch(/expired/);
    expect(captured).toHaveLength(0);
  });

  it('forwards a valid caller token to the backend, not MICROERA_TOKEN', async () => {
    const caller = signJwt(TEST_SECRET, { userId: 42, username: 'alice', role: 'viewer' }, 3600);
    const { status, json } = await post(mcpPort, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kb_list', arguments: {} } }, `Bearer ${caller}`);
    expect(status).toBe(200);
    expect(json?.result?.content?.[0]?.text).toContain('"ok":true');
    expect(captured).toHaveLength(1);
    expect(captured[0].authorization).toBe(`Bearer ${caller}`);
    expect(captured[0].authorization).not.toBe(`Bearer ${SERVER_ADMIN_TOKEN}`);
    expect(captured[0].url).toBe('/api/v2/ops/kb/list');
  });

  it('keeps concurrent callers isolated (no token bleed)', async () => {
    const tokenA = signJwt(TEST_SECRET, { userId: 1, username: 'a', role: 'viewer' }, 3600);
    const tokenB = signJwt(TEST_SECRET, { userId: 2, username: 'b', role: 'viewer' }, 3600);
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kb_list', arguments: {} } };
    await Promise.all([
      post(mcpPort, body, `Bearer ${tokenA}`),
      post(mcpPort, body, `Bearer ${tokenB}`),
      post(mcpPort, body, `Bearer ${tokenA}`),
      post(mcpPort, body, `Bearer ${tokenB}`),
    ]);
    expect(captured).toHaveLength(4);
    const auths = captured.map((c) => c.authorization).sort();
    expect(auths).toEqual([`Bearer ${tokenA}`, `Bearer ${tokenA}`, `Bearer ${tokenB}`, `Bearer ${tokenB}`]);
  });

  it('rejects an insufficient role with 403 when MCP_REQUIRED_ROLE is set', async () => {
    process.env.MCP_REQUIRED_ROLE = 'admin';
    try {
      const viewer = signJwt(TEST_SECRET, { userId: 3, username: 'v', role: 'viewer' }, 3600);
      const admin = signJwt(TEST_SECRET, { userId: 4, username: 'root', role: 'admin' }, 3600);
      const deny = await post(mcpPort, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, `Bearer ${viewer}`);
      expect(deny.status).toBe(403);
      expect(deny.json.error.message).toMatch(/forbidden/);
      const allow = await post(mcpPort, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, `Bearer ${admin}`);
      expect(allow.status).toBe(200);
      expect(allow.json.result.tools.length).toBeGreaterThan(0);
    } finally {
      delete process.env.MCP_REQUIRED_ROLE;
    }
  });

  it('binds 127.0.0.1 by default (loopback, not 0.0.0.0)', async () => {
    const srv = await runHttpServer(await getFreePort());
    try {
      const addr = srv.address() as { address: string };
      expect(addr.address).toBe('127.0.0.1');
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it('can be explicitly disabled via MCP_HTTP_ENABLED=false', async () => {
    process.env.MCP_HTTP_ENABLED = 'false';
    try {
      await expect(runHttpServer(await getFreePort())).rejects.toThrow(/disabled/);
    } finally {
      delete process.env.MCP_HTTP_ENABLED;
    }
  });

  it('accepts tokens signed by the backend signer (parity with server auth)', async () => {
    // `config.jwtSecret` is a module-load snapshot; align the dynamic reader
    // with it so this proves the verify implementation, not an env race.
    const prev = process.env.JWT_SECRET;
    process.env.JWT_SECRET = config.jwtSecret;
    try {
      const backendToken = signToken({ userId: 7, username: 'parity', role: 'admin' });
      expect(verifyToken(backendToken)).not.toBeNull();
      const res = authenticate(`Bearer ${backendToken}`);
      expect(res.ok).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prev;
    }
  });
});

describe('stdio MCP stays auth-free (regression)', () => {
  it('serves tools/list over stdio without any token', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, 'mcp', 'serve', '--transport', 'stdio'], {
      cwd: repoRoot,
      env: { ...process.env, MICROERA_TOKEN: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
      // Wait for the single JSON-RPC frame.
      const line: string = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`stdio timeout; got: ${stdout}`)), 10000);
        const poll = () => {
          const nl = stdout.indexOf('\n');
          if (nl >= 0) { clearTimeout(t); resolve(stdout.slice(0, nl)); }
          else setTimeout(poll, 20);
        };
        poll();
      });
      const msg = JSON.parse(line);
      expect(msg.result.tools.length).toBeGreaterThan(150);
      expect(msg.result.tools.map((t: any) => t.name)).toContain('search_hybrid');
    } finally {
      child.kill();
    }
  }, 20000);
});
