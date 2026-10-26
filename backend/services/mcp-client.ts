// MCP client (Streamable HTTP) — a minimal JSON-RPC 2.0 client used by
// agent.mcp_test / agent.mcp_call to reach an *external* MCP server.
//
// It speaks the same wire protocol our own server (packages/mcp/src/http.ts)
// exposes: POST {jsonrpc, id, method, params} → {jsonrpc, id, result|error}.
// Only HTTP(S) transport is supported (no stdio/spawn), and every URL is
// validated + connected through the SSRF-safe pinned transport in
// ssrf-fetch.ts (`validateMcpUrl` → `requestPinned`): the hostname is resolved
// once, every address is classified (loopback/private/link-local/metadata/
// reserved/ULA/multicast are default-denied), and the socket is pinned to the
// validated addresses with Host/SNI held at the hostname. No second DNS lookup
// happens at connect time, so a DNS-rebinding swap between check and connect is
// moot. Redirects are never followed.
//
// Loopback/private endpoints are only reachable when the operator names an
// exact trusted endpoint (MCP_TRUSTED_HOSTS or the `trustedHosts` option);
// there is no "open all of localhost" switch.
//
// Errors are typed (McpClientError.kind) so the service layer can map them onto
// distinct results/statuses instead of silently swallowing or fabricating a
// reachable/ok outcome.
import { validateMcpUrl, requestPinned, SafeFetchError } from './ssrf-fetch.js';

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
  | 'redirect'
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

/** Parse the MCP_TRUSTED_HOSTS env (comma-separated exact hostnames/IPs). */
function envTrustedHosts(): string[] | undefined {
  const raw = process.env.MCP_TRUSTED_HOSTS?.trim();
  if (!raw) return undefined;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export interface McpHttpClientOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  /**
   * Exact trusted endpoints (hostname or IP, optionally "host:port") that may be
   * non-public. Defaults to MCP_TRUSTED_HOSTS; empty means loopback/private are
   * all refused.
   */
  trustedHosts?: Iterable<string>;
}

export class McpHttpClient {
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly trustedHosts?: Iterable<string>;
  private idCounter = 0;

  constructor(opts: McpHttpClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.maxResponseBytes = opts.maxResponseBytes ?? 2_000_000;
    this.trustedHosts = opts.trustedHosts ?? envTrustedHosts();
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
    const check = await validateMcpUrl(ref.url, { trustedHosts: this.trustedHosts });
    if (!check.ok) throw new McpClientError(check.kind, check.reason);

    let res: { status: number; text: string };
    try {
      res = await requestPinned(ref.url, check.addrs, {
        method: 'POST',
        timeoutMs,
        maxBytes: this.maxResponseBytes,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(ref.token ? { authorization: `Bearer ${ref.token}` } : {}),
          ...this.sanitizeHeaders(ref.headers),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId(), method, params }),
      });
    } catch (err: any) {
      if (err instanceof SafeFetchError) {
        if (err.kind === 'timeout') throw new McpClientError('timeout', `MCP ${method} timed out after ${timeoutMs}ms`);
        if (err.kind === 'too_large') throw new McpClientError('invalid_response', `MCP response exceeded ${this.maxResponseBytes} bytes`);
        throw new McpClientError('connection_failed', `could not connect to MCP server ${ref.url}: ${err.message}`);
      }
      throw new McpClientError('connection_failed', `could not connect to MCP server ${ref.url}: ${err?.message ?? String(err)}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new McpClientError('unauthorized', `MCP server rejected the request (HTTP ${res.status})`);
    }
    // Redirects are never followed — the pinned transport does not chase 3xx.
    if (res.status >= 300 && res.status < 400) {
      throw new McpClientError('redirect', `MCP server returned a redirect (HTTP ${res.status}); refusing to follow it`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new McpClientError('http_error', `MCP server returned HTTP ${res.status}`);
    }

    const text = res.text;

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
      clientInfo: { name: 'miqroera-agent', version: '0.1.0' },
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
