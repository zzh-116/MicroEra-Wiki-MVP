// Minimal HTTP client used by CLI and MCP to call the MiqroEra API. The CLI and
// MCP are thin clients of the Core Service — they never talk to the database
// directly.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { OperationContext } from '../../contracts/src/types.js';

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

/**
 * Per-request caller identity, carried across an async call chain without
 * threading an extra argument through every operation handler.
 *
 * The stdio MCP and the CLI are local, operator-driven processes: they run with
 * no identity in this store and therefore fall back to the operator-configured
 * service token (`MICROERA_TOKEN`). The HTTP MCP is network-reachable, so its
 * request handler runs inside `requestIdentity.run({ token, ... })` with the
 * *caller's* verified token — never the shared service token — so the backend
 * re-verifies and authorizes the actual caller rather than a privileged server
 * principal.
 */
export interface RequestIdentity {
  token?: string;
  userId?: number;
  username?: string;
  role?: string;
}

export const requestIdentity = new AsyncLocalStorage<RequestIdentity>();

export interface ApiError {
  status: number;
  code?: string;
  message: string;
}

export class ApiClient {
  readonly baseUrl: string;
  private token?: string;
  private timeoutMs: number;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 30000;
  }

  setToken(token: string): void {
    this.token = token;
  }

  getToken(): string | undefined {
    return this.token;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    ctx?: OperationContext,
  ): Promise<T> {
    // A caller-scoped identity (HTTP MCP) takes precedence over the process-wide
    // service token, so each request authenticates as its own caller.
    const identity = requestIdentity.getStore();
    const token = identity?.token ?? this.token;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any = undefined;
      try { json = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body */ }

      if (!res.ok) {
        const err: ApiError = {
          status: res.status,
          code: json?.error ?? json?.code,
          message: json?.message ?? text ?? `HTTP ${res.status}`,
        };
        throw err;
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Resolve the API base URL from env, defaulting to the local dev server. */
export function resolveBaseUrl(): string {
  return process.env.MICROERA_HOST || process.env.MICROERA_API_URL || 'http://localhost:3001';
}

/** Resolve a stored token from env. */
export function resolveToken(): string | undefined {
  return process.env.MICROERA_TOKEN || undefined;
}
