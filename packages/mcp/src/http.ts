// MCP Streamable HTTP transport. Accepts standard JSON-RPC 2.0 over POST and
// streams a JSON response. Sessions/SSE progress/cancel land in P9; this host
// already speaks the same tool/resource/prompt surface as stdio.
//
// Unlike the stdio transport (a local child process), the HTTP transport is
// network-reachable, so every request is authenticated with a per-caller
// MiqroEra JWT (see `./auth.ts`) and runs with that caller's identity propagated
// to the backend API. It binds to loopback by default; exposing it on a network
// interface is an explicit, operator-controlled decision.
import http from 'node:http';
import { ApiClient, resolveBaseUrl, resolveToken, requestIdentity } from '../../operation-registry/src/http-client.js';
import { ensureOperationsRegistered } from '../../operation-registry/src/operations.js';
import { authenticate } from './auth.js';
import { serverInfo, MCP_PROTOCOL_VERSION, listTools, listResources, listPrompts, readResource, callTool } from './mcp-core.js';

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB — reject oversized (and unauthenticated) bodies early.

function isHttpEnabled(): boolean {
  const v = (process.env.MCP_HTTP_ENABLED ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no' && v !== 'off';
}

function defaultHost(): string {
  // Loopback by default; `MCP_HOST`/`--host` opts in to a network interface.
  return process.env.MCP_HOST || '127.0.0.1';
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendAuthError(res: http.ServerResponse, reason: string, status: 401 | 403): void {
  // Generic reason only — never echo the token or request body.
  sendJson(res, status, {
    jsonrpc: '2.0',
    id: null,
    error: { code: status === 401 ? -32001 : -32002, message: `MCP authentication failed: ${reason}` },
  });
}

async function handleMethod(method: string, params: any, api: ApiClient): Promise<unknown> {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: serverInfo(),
      };
    case 'ping': return {};
    case 'tools/list': return { tools: listTools() };
    case 'tools/call': return callTool(params?.name, params?.arguments ?? {}, api);
    case 'resources/list': return { resources: listResources() };
    case 'resources/read': return readResource(params?.uri);
    case 'prompts/list': return { prompts: listPrompts() };
    default: throw Object.assign(new Error(`Method not found: ${method}`), { rpcCode: -32601 });
  }
}

export interface HttpServerOptions {
  host?: string;
}

/** Start the HTTP MCP server. Resolves with the bound `http.Server` once listening. */
export function runHttpServer(port: number, options: HttpServerOptions = {}): Promise<http.Server> {
  if (!isHttpEnabled()) {
    return Promise.reject(new Error('HTTP MCP is disabled (MCP_HTTP_ENABLED). Use stdio transport or set MCP_HTTP_ENABLED=true.'));
  }

  const host = options.host ?? defaultHost();
  const api = new ApiClient({ baseUrl: resolveBaseUrl(), token: resolveToken() });
  ensureOperationsRegistered(api);

  const server = http.createServer(async (req, res) => {
    // Authenticate before reading the body: unauthenticated callers get nothing.
    const auth = authenticate(req.headers.authorization);
    if (!auth.ok) {
      sendAuthError(res, auth.reason, auth.status);
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { jsonrpc: '2.0', error: { code: -32600, message: 'Only POST supported' } });
      return;
    }

    let size = 0;
    let body = '';
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) {
        sendJson(res, 413, { jsonrpc: '2.0', error: { code: -32600, message: 'Request too large' } });
        return;
      }
      body += chunk;
    }

    let payload: any;
    try { payload = JSON.parse(body); } catch {
      sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } });
      return;
    }

    const id = payload.id ?? null;
    if (payload.method?.startsWith('notifications/')) {
      sendJson(res, 200, { jsonrpc: '2.0' });
      return;
    }

    try {
      const result = await requestIdentity.run(
        { token: auth.token, userId: auth.identity.userId, username: auth.identity.username, role: auth.identity.role },
        () => handleMethod(payload.method, payload.params, api),
      );
      sendJson(res, 200, { jsonrpc: '2.0', id, result });
    } catch (err: any) {
      sendJson(res, 200, { jsonrpc: '2.0', id, error: { code: err?.rpcCode ?? -32603, message: err?.message ?? String(err) } });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const bound = typeof addr === 'object' && addr ? `${addr.address}:${addr.port}` : `${host}:${port}`;
      console.error(`[mcp] HTTP server listening on http://${bound}/mcp (API ${resolveBaseUrl()}, auth ${authEnabled()})`);
      resolve(server);
    });
  });
}

function authEnabled(): string {
  return isHttpEnabled() ? 'required' : 'disabled';
}
