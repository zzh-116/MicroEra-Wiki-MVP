// Batch A — real-CLI integration tests. Spawn the actual `cli/src/main.ts`
// process (via `node --import tsx`) against a mock HTTP server, and assert the
// exact request the CLI sends — proving the end-to-end arg→input mapping, not
// just the internal functions. Also proves `mcp serve --transport http`
// actually starts an HTTP MCP server that lists tools (A1).
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { signToken } from '../../server/middleware/auth.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cliEntry = path.join(repoRoot, 'cli', 'src', 'main.ts');

interface Captured {
  method: string;
  path: string;
  body?: unknown;
}

function runCli(args: string[], env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

/** Run a CLI operation against a mock server and return the captured request. */
async function captureRequest(args: string[]): Promise<{ req: Captured; stdout: string }> {
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      captured.push({ method: req.method ?? '', path: req.url ?? '', body: body ? JSON.parse(body) : undefined });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: {} }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    const { stdout } = await runCli(args, { MICROERA_HOST: `http://127.0.0.1:${port}` });
    return { req: captured[0], stdout };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe('CLI real-command arg mapping (via mock server)', () => {
  it('sends positional query for search.vector (D2)', async () => {
    const { req } = await captureRequest(['search', 'vector', 'MOF pore aperture', '--kb-id', '1', '--top-k', '5']);
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/v2/ops/search/vector');
    expect(req.body).toEqual({ query: 'MOF pore aperture', kb_id: 1, top_k: 5 });
  }, 30000);

  it('sends message_id for chat.references (D1)', async () => {
    const { req } = await captureRequest(['chat', 'references', '--message-id', 'msg_1']);
    expect(req.body).toEqual({ message_id: 'msg_1' });
  }, 30000);

  it('sends kb_ids array + method for chat.ask (D3)', async () => {
    const { req } = await captureRequest(['chat', 'ask', 'which papers?', '--kb-ids', '1', '2', '--method', 'hybrid']);
    expect(req.body).toEqual({ question: 'which papers?', kb_ids: [1, 2], method: 'hybrid' });
  }, 30000);

  it('sends rrf_k + kb_id for search.hybrid (D4)', async () => {
    const { req } = await captureRequest(['search', 'hybrid', 'MOF', '--kb-id', '1', '--rrf-k', '60']);
    expect(req.body).toEqual({ query: 'MOF', kb_id: 1, rrf_k: 60 });
  }, 30000);

  it('sends JSON documents array for search.rerank (D5)', async () => {
    const { req } = await captureRequest(['search', 'rerank', '--query', 'MOF', '--documents', '[{"text":"a"}]']);
    expect(req.body).toEqual({ query: 'MOF', documents: [{ text: 'a' }] });
  }, 30000);

  it('sends camelCase projectId for datasource.preview (D6)', async () => {
    const { req } = await captureRequest(['datasource', 'preview', '--datasource-id', '1', '--project-id', 'proj1']);
    expect(req.body).toEqual({ datasource_id: 1, projectId: 'proj1' });
  }, 30000);
});

describe('CLI MCP HTTP transport (A1)', () => {
  const procs: ChildProcess[] = [];
  afterEach(() => {
    for (const p of procs.splice(0)) p.kill();
  });

  async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const p = (srv.address() as { port: number }).port;
        srv.close(() => resolve(p));
      });
    });
  }

  async function listToolsOverHttp(port: number, token: string, timeoutMs = 15000): Promise<Array<{ name: string }>> {
    const deadline = Date.now() + timeoutMs;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        if (res.ok) {
          const j = (await res.json()) as any;
          if (j?.result?.tools) return j.result.tools;
        }
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`MCP HTTP server not ready: ${String(lastErr)}`);
  }

  it('mcp serve --transport http --port N starts an authenticated HTTP server listing tools', async () => {
    const port = await getFreePort();
    const token = signToken({ userId: 1, username: 'admin', role: 'admin' });
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, 'mcp', 'serve', '--transport', 'http', '--port', String(port)], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    procs.push(child);
    const tools = await listToolsOverHttp(port, token);
    expect(tools.length).toBeGreaterThan(150);
    expect(tools.map((t) => t.name)).toContain('search_hybrid');
    expect(tools.map((t) => t.name)).toContain('chat_ask');
  }, 30000);
});
