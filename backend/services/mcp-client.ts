// MCP client (Streamable HTTP) — a minimal JSON-RPC 2.0 client used by
// agent.mcp_test / agent.mcp_call to reach an *external* MCP server.
//
// It speaks the same wire protocol our own server (packages/mcp/src/http.ts)
// exposes: POST {jsonrpc, id, method, params} → {jsonrpc, id, result|error}.
// Only HTTP(S) transport is supported (no stdio/spawn), and every URL passes
// the SSRF guard in mcp-url-guard.ts before any bytes leave the process.
//
// Errors are typed (McpClientError.kind) so the service layer can map them onto
// distinct results/statuses instead of silently swallowing or fabricating a
// reachable/ok outcome.
import { checkMcpUrl } from './mcp-url-guard.js';

export interface McpServerRef {
  name?: string;
  url: string;
  /** Optional bearer token (Authorization header), config-driven. */
  token?: string;
  /** Optional extra headers (host/content-length/authorization are ignored). */
  headers?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities?: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
}

export type McpClientErrorKind =
  | 'unsupported_scheme'
  | 'invalid_url'
  | 'ssrf_blocked'
  | 'connection_failed'
  | 'timeout'
  | 'unauthorized'
  | 'http_error'
  | 'invalid_response'
  | 'tool_not_found'
  | 'remote_error';

export class McpClientError extends Error {
  kind: McpClientErrorKind;
  code?: number;
  constructor(kind: McpClientErrorKind, message: string, code?: number) {
    super(message);
    this.name = 'McpClientError';
    this.kind = kind;
    this.code = code;
  }
}

const MCP_PROTOCOL_VERSION = '2025-03-26';

export interface McpHttpClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  maxResponseBytes?: number;
}

export class McpHttpClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxResponseBytes: number;
  private idCounter = 0;

  constructor(opts: McpHttpClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxResponseBytes = opts.maxResponseBytes ?? 2_000_000;
  }

  private nextId(): number {
    return ++this.idCounter;
  }

  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lk = k.toLowerCase();
      // Never let caller-supplied headers clobber framing/auth.
      if (lk === 'host' || lk === 'content-length' || lk === 'authorization' || lk === 'content-type') continue;
      out[k] = String(v);
    }
    return out;
  }

  private async rpc(ref: McpServerRef, method: string, params: unknown, timeoutMs = this.timeoutMs): Promise<unknown> {
    const check = await checkMcpUrl(ref.url);
    if (!check.ok) throw new McpClientError(check.kind, check.reason);

    let res: Response;
    try {
      res = await this.fetchImpl(ref.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(ref.token ? { authorization: `Bearer ${ref.token}` } : {}),
          ...this.sanitizeHeaders(ref.headers),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId(), method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      const name = err?.name ?? '';
      const msg = err?.cause?.message ?? err?.message ?? String(err);
      if (name === 'AbortError' || name === 'TimeoutError' || /timeout|abort/i.test(msg)) {
        throw new McpClientError('timeout', `MCP ${method} timed out after ${timeoutMs}ms`);
      }
      throw new McpClientError('connection_failed', `could not connect to MCP server ${ref.url}: ${msg}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new McpClientError('unauthorized', `MCP server rejected the request (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new McpClientError('http_error', `MCP server returned HTTP ${res.status}`);
    }

    let text: string;
    try {
      text = await res.text();
    } catch (err: any) {
      throw new McpClientError('invalid_response', `could not read MCP response: ${err?.message ?? String(err)}`);
    }
    if (text.length > this.maxResponseBytes) {
      throw new McpClientError('invalid_response', `MCP response exceeded ${this.maxResponseBytes} bytes`);
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new McpClientError('invalid_response', 'MCP response was not valid JSON');
    }

    if (payload?.error) {
      const code = Number(payload.error.code ?? -32603);
      const msg = payload.error.message ?? 'MCP server returned an error';
      if (code === -32601) throw new McpClientError('tool_not_found', `MCP tool not found: ${msg}`, code);
      throw new McpClientError('remote_error', msg, code);
    }
    if (payload?.result === undefined) {
      throw new McpClientError('invalid_response', `MCP ${method} response had no result`);
    }
    return payload.result;
  }

  async initialize(ref: McpServerRef): Promise<McpInitializeResult> {
    const result = (await this.rpc(ref, 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'microera-agent', version: '0.1.0' },
    })) as any;
    if (!result?.protocolVersion || !result?.serverInfo) {
      throw new McpClientError('invalid_response', 'MCP initialize response missing protocolVersion/serverInfo');
    }
    return { protocolVersion: result.protocolVersion, serverInfo: result.serverInfo, capabilities: result.capabilities };
  }

  async listTools(ref: McpServerRef): Promise<McpTool[]> {
    const result = (await this.rpc(ref, 'tools/list', {})) as any;
    if (!Array.isArray(result?.tools)) {
      throw new McpClientError('invalid_response', 'MCP tools/list response missing a tools array');
    }
    return result.tools;
  }

  async callTool(ref: McpServerRef, name: string, args: unknown): Promise<McpCallResult> {
    const result = (await this.rpc(ref, 'tools/call', { name, arguments: args ?? {} })) as any;
    if (!Array.isArray(result?.content)) {
      throw new McpClientError('invalid_response', 'MCP tools/call response missing a content array');
    }
    return { content: result.content, isError: result.isError === true };
  }
}
