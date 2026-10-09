// MCP stdio transport — JSON-RPC 2.0 over stdin/stdout. stdout carries ONLY
// JSON-RPC frames; all logging/diagnostics go to stderr so agent clients never
// see stray bytes on stdout.
import readline from 'node:readline';
import { ApiClient, resolveBaseUrl, resolveToken } from '../../operation-registry/src/http-client.js';
import { ensureOperationsRegistered } from '../../operation-registry/src/operations.js';
import { serverInfo, MCP_PROTOCOL_VERSION, listTools, listResources, listPrompts, readResource, callTool } from './mcp-core.js';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: any;
}

function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function rpcResult(id: number | string | null, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function rpcError(id: number | string | null, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

export async function runStdioServer(api: ApiClient): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let initialized = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let req: RpcRequest;
    try { req = JSON.parse(line); } catch {
      console.error('[mcp] invalid JSON-RPC line (ignored)');
      continue;
    }
    const { id = null, method, params } = req;

    switch (method) {
      case 'initialize': {
        const result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: serverInfo(),
        };
        rpcResult(id, result);
        initialized = true;
        break;
      }
      case 'notifications/initialized':
        // No response for notifications.
        break;
      case 'ping':
        rpcResult(id, {});
        break;
      case 'tools/list':
        rpcResult(id, { tools: listTools() });
        break;
      case 'tools/call': {
        if (!initialized) { rpcError(id, -32002, 'Not initialized'); break; }
        const name = params?.name;
        const args = params?.arguments ?? {};
        const result = await callTool(name, args, api);
        rpcResult(id, result);
        break;
      }
      case 'resources/list':
        rpcResult(id, { resources: listResources() });
        break;
      case 'resources/read': {
        const uri = params?.uri;
        rpcResult(id, readResource(uri));
        break;
      }
      case 'prompts/list':
        rpcResult(id, { prompts: listPrompts() });
        break;
      default:
        rpcError(id, -32601, `Method not found: ${method}`);
    }
  }
}

export function startStdioServer(): Promise<void> {
  const api = new ApiClient({ baseUrl: resolveBaseUrl(), token: resolveToken() });
  ensureOperationsRegistered(api);
  console.error(`[mcp] stdio server starting — API ${resolveBaseUrl()} (token ${api.getToken() ? 'set' : 'not set'})`);
  return runStdioServer(api);
}
