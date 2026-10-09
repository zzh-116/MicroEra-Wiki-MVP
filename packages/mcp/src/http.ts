// MCP Streamable HTTP transport (skeleton). Accepts standard JSON-RPC 2.0 over
// POST and streams a JSON response. Sessions/SSE progress/cancel land in P9;
// this host already speaks the same tool/resource/prompt surface as stdio.
import http from 'node:http';
import { ApiClient, resolveBaseUrl, resolveToken } from '../../operation-registry/src/http-client.js';
import { ensureOperationsRegistered } from '../../operation-registry/src/operations.js';
import { serverInfo, MCP_PROTOCOL_VERSION, listTools, listResources, listPrompts, readResource, callTool } from './mcp-core.js';

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

export function runHttpServer(port: number): Promise<void> {
  const api = new ApiClient({ baseUrl: resolveBaseUrl(), token: resolveToken() });
  ensureOperationsRegistered(api);
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', 'mcp-session-id': '' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Only POST supported' } }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;

    let payload: any;
    try { payload = JSON.parse(body); } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    const id = payload.id ?? null;
    res.writeHead(200, { 'content-type': 'application/json' });

    if (payload.method?.startsWith('notifications/')) {
      res.end(JSON.stringify({ jsonrpc: '2.0' }));
      return;
    }

    try {
      const result = await handleMethod(payload.method, payload.params, api);
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    } catch (err: any) {
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: err?.rpcCode ?? -32603, message: err?.message ?? String(err) } }));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.error(`[mcp] HTTP server listening on http://localhost:${port}/mcp (API ${resolveBaseUrl()})`);
      resolve();
    });
  });
}
