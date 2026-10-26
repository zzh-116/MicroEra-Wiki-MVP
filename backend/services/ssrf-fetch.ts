// SSRF-safe URL fetch — used by doc.import_url to fetch remote text without
// letting a caller reach the loopback interface, RFC1918/private ranges,
// link-local (incl. cloud metadata 169.254.169.254), reserved, ULA or
// multicast addresses.
//
// Why this exists instead of reusing global `fetch` (undici):
//   undici resolves DNS itself and offers no way to pin the connection to an
//   address we have already validated. Between "we resolved + checked the IP"
//   and "undici connects" the DNS answer can change (DNS rebinding), so a
//   validated public host could be swapped for 127.0.0.1 on the second lookup.
//
// This module closes that gap by:
//   1. resolving the hostname ourselves and classifying EVERY address, and
//   2. connecting with http/https.request + a custom `lookup` that returns only
//      those pre-validated public addresses — the socket is pinned to the
//      validated IP while Host/SNI stay as the hostname. No second DNS lookup
//      is performed at connect time, so a post-check resolution change is moot.
//
// Redirects are denied by default: http.request never follows a 3xx, and we
// refuse one explicitly rather than re-validating the next hop (there is no
// supported redirect flow for import_url). A timeout and a response-size cap
// bound resource use, and error messages never carry the URL or response body.
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { classifyIp, type Classification } from './mcp-url-guard.js';

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MiB

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type SsrfCheck =
  | { ok: true; hostname: string; addrs: ResolvedAddress[] }
  | { ok: false; kind: 'unsupported_scheme' | 'invalid_url' | 'ssrf_blocked' | 'dns_error'; reason: string };

export type SafeFetchErrorKind =
  | 'unsupported_scheme'
  | 'invalid_url'
  | 'ssrf_blocked'
  | 'dns_error'
  | 'redirect'
  | 'http_error'
  | 'timeout'
  | 'too_large'
  | 'network';

export class SafeFetchError extends Error {
  kind: SafeFetchErrorKind;
  constructor(kind: SafeFetchErrorKind, message: string) {
    super(message);
    this.name = 'SafeFetchError';
    this.kind = kind;
  }
}

export interface SafeFetchOptions {
  /** Overall request budget (connect + response). Default 20s. */
  timeoutMs?: number;
  /** Maximum response body bytes accepted. Default 2 MiB. */
  maxBytes?: number;
}

export type ResolveAll = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolveAll: ResolveAll = (hostname) => lookup(hostname, { all: true });

// Injectable resolver seam (tests only): lets a test simulate DNS answers —
// e.g. a rebinding host that flips from public to loopback — without a real
// resolver. The production path (importUrl → safeFetchText) never overrides
// this, and the classification in validatePublicUrl still blocks whatever the
// resolver returns, so the seam cannot weaken the guard.
let resolveAll: ResolveAll = defaultResolveAll;
export function __setResolveAll(fn: ResolveAll): void {
  resolveAll = fn;
}

/**
 * Validate a URL and its resolved addresses, requiring every address to be a
 * public IP (loopback is BLOCKED here; loopback/private for Agent MCP are only
 * allowed via an explicit trusted endpoint in validateMcpUrl). Does not perform
 * any network I/O beyond DNS.
 */
export async function validatePublicUrl(rawUrl: string): Promise<SsrfCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, kind: 'invalid_url', reason: 'URL could not be parsed' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, kind: 'unsupported_scheme', reason: 'only http/https URLs are allowed' };
  }
  if (url.username || url.password) {
    return { ok: false, kind: 'invalid_url', reason: 'URL must not embed credentials' };
  }
  const hostname = url.hostname;
  if (!hostname) {
    return { ok: false, kind: 'invalid_url', reason: 'URL has no hostname' };
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await resolveAll(hostname);
  } catch {
    return { ok: false, kind: 'dns_error', reason: 'URL hostname could not be resolved' };
  }
  if (resolved.length === 0) {
    return { ok: false, kind: 'dns_error', reason: 'URL hostname resolved to no addresses' };
  }

  const addrs: ResolvedAddress[] = resolved.map((a) => ({ address: a.address, family: (a.family === 6 ? 6 : 4) as 4 | 6 }));
  for (const a of addrs) {
    const cls: Classification = classifyIp(a.address, a.family);
    if (cls !== 'public') {
      return { ok: false, kind: 'ssrf_blocked', reason: 'URL resolves to a non-public address and is blocked' };
    }
  }
  return { ok: true, hostname, addrs };
}

// ── Agent MCP SSRF guard ──────────────────────────────────────────────────────
//
// `validateMcpUrl` is the stricter replacement for the former `checkMcpUrl`
// (which allowed 127.0.0.0/8 loopback unconditionally). It applies the SAME
// default-deny classification as `validatePublicUrl` — loopback, private,
// link-local (incl. cloud metadata), reserved, ULA and multicast are all
// refused — with one explicit escape hatch: an operator may name an exact
// trusted endpoint (hostname or IP, optionally "host:port"). There is no switch
// that opens all of localhost.

export type McpUrlCheck =
  | { ok: true; hostname: string; addrs: ResolvedAddress[] }
  | { ok: false; kind: 'unsupported_scheme' | 'invalid_url' | 'ssrf_blocked'; reason: string };

export interface McpUrlGuardOptions {
  /** Exact trusted endpoints allowed to be non-public. Empty by default. */
  trustedHosts?: Iterable<string>;
}

function parseTrustedEntry(raw: string): { host: string; port?: string } | null {
  const t = raw.trim();
  if (!t) return null;
  // Bracketed IPv6: "[::1]" or "[::1]:8080".
  const bracket = /^\[([0-9A-Fa-f:.]+)\](?::(\d+))?$/.exec(t);
  if (bracket) return { host: `[${bracket[1]}]`, port: bracket[2] };
  // Hostname or IPv4, optionally ":port" (a bare hostname/IP has no colon).
  const m = /^([^:]+?)(?::(\d+))?$/.exec(t);
  if (!m) return null;
  return { host: m[1], port: m[2] };
}

function isTrustedHost(url: URL, entries: Iterable<string> | undefined): boolean {
  if (!entries) return false;
  const urlPort = url.port || (url.protocol === 'https:' ? '443' : '80');
  for (const raw of entries) {
    const e = parseTrustedEntry(raw);
    if (!e) continue;
    if (e.host.toLowerCase() !== url.hostname.toLowerCase()) continue;
    if (e.port !== undefined && e.port !== urlPort) continue;
    return true;
  }
  return false;
}

/**
 * Validate a URL for the Agent MCP client. Default-deny non-public addresses
 * unless the endpoint is an explicitly trusted host. Resolves the hostname once
 * and returns the resolved `addrs` so the caller can pin the connection to them
 * (no second DNS lookup → no DNS-rebinding TOCTOU).
 */
export async function validateMcpUrl(rawUrl: string, opts: McpUrlGuardOptions = {}): Promise<McpUrlCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, kind: 'invalid_url', reason: 'URL could not be parsed' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, kind: 'unsupported_scheme', reason: `scheme '${url.protocol}' is not allowed (only http/https)` };
  }
  if (url.username || url.password) {
    return { ok: false, kind: 'invalid_url', reason: 'URL must not embed credentials' };
  }
  const hostname = url.hostname;
  if (!hostname) {
    return { ok: false, kind: 'invalid_url', reason: 'URL has no hostname' };
  }

  const trusted = isTrustedHost(url, opts.trustedHosts);

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await resolveAll(hostname);
  } catch {
    return { ok: false, kind: 'invalid_url', reason: `hostname '${hostname}' could not be resolved` };
  }
  if (resolved.length === 0) {
    return { ok: false, kind: 'invalid_url', reason: `hostname '${hostname}' resolved to no addresses` };
  }

  const addrs: ResolvedAddress[] = resolved.map((a) => ({ address: a.address, family: (a.family === 6 ? 6 : 4) as 4 | 6 }));

  // A trusted endpoint may be non-public (that is the point of the allow-list);
  // everything else must be a public address.
  if (!trusted) {
    for (const a of addrs) {
      if (classifyIp(a.address, a.family) !== 'public') {
        return { ok: false, kind: 'ssrf_blocked', reason: `host '${hostname}' resolves to a non-public address (${a.address}); refusing to connect` };
      }
    }
  }

  return { ok: true, hostname, addrs };
}

/**
 * Build a `lookup` callback that ignores DNS entirely and returns only the
 * already-validated addresses, pinning the socket to the validated IP.
 */
function pinnedLookup(addrs: ResolvedAddress[]) {
  return (
    _hostname: string,
    options: { family?: number; all?: boolean; hints?: number },
    callback: (err: NodeJS.ErrnoException | null, ...rest: unknown[]) => void,
  ): void => {
    let candidates = addrs;
    if (options?.family === 4 || options?.family === 6) {
      const byFamily = addrs.filter((a) => a.family === options.family);
      if (byFamily.length > 0) candidates = byFamily;
    }
    if (options?.all) {
      callback(null, candidates.map((a) => ({ address: a.address, family: a.family })));
      return;
    }
    const first = candidates[0];
    callback(null, first.address, first.family);
  };
}

/**
 * Perform a pinned request against pre-validated `addrs`. This trusts its caller
 * to have validated the addresses first — it is exported so tests can exercise
 * the HTTP mechanics (method/body/redirect/timeout/size) against a local server
 * without re-validating a loopback target. Production code goes through
 * `safeFetchText` (doc.import_url) or `McpHttpClient.rpc` (agent MCP), both of
 * which validate before calling this.
 *
 * The socket is pinned to the validated addresses via `pinnedLookup` (no second
 * DNS lookup), while Host/SNI stay as the hostname. Redirects are NOT followed:
 * `http.request` never follows a 3xx, and the returned status lets the caller
 * reject it explicitly. A timeout and a response-size cap bound resource use.
 */
export interface PinnedRequestOptions extends SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

export interface PinnedResponse {
  status: number;
  text: string;
}

export async function requestPinned(
  rawUrl: string,
  addrs: ResolvedAddress[],
  opts: PinnedRequestOptions = {},
): Promise<PinnedResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const url = new URL(rawUrl);
  const mod = url.protocol === 'https:' ? https : http;
  const signal = AbortSignal.timeout(timeoutMs);

  // Strip framing headers the caller must never control. Host is derived from
  // the URL (the pinned authority); content-length is computed by Node.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'content-length') continue;
    headers[k] = String(v);
  }

  const req = mod.request(url, {
    method: opts.method ?? 'GET',
    // A fresh socket per request — never reuse a pooled connection to another
    // (possibly different) destination.
    agent: false,
    signal,
    lookup: pinnedLookup(addrs),
    headers,
  });

  let res: http.IncomingMessage;
  try {
    res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      req.once('response', resolve);
      req.once('error', reject);
      if (opts.body !== undefined) req.write(opts.body);
      req.end();
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { kind?: string };
    if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR' || signal.aborted) {
      throw new SafeFetchError('timeout', 'request timed out');
    }
    throw new SafeFetchError('network', 'request failed');
  }

  const status = res.statusCode ?? 0;

  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of res) {
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > maxBytes) {
        res.destroy();
        throw new SafeFetchError('too_large', 'response exceeded the size limit');
      }
      chunks.push(buf);
    }
    return { status, text: Buffer.concat(chunks).toString('utf8') };
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    const e = err as NodeJS.ErrnoException & { kind?: string };
    if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR' || signal.aborted) {
      throw new SafeFetchError('timeout', 'request timed out');
    }
    throw new SafeFetchError('network', 'request failed');
  }
}

/**
 * Fetch a validated public URL's body as UTF-8 via a pinned GET. Redirects and
 * non-2xx responses are rejected. Used by doc.import_url via `safeFetchText`.
 */
export async function requestPinnedText(
  rawUrl: string,
  addrs: ResolvedAddress[],
  opts: SafeFetchOptions = {},
): Promise<string> {
  const res = await requestPinned(rawUrl, addrs, {
    ...opts,
    method: 'GET',
    headers: {
      accept: 'text/html, text/plain, text/markdown, application/json; charset=utf-8',
      'user-agent': 'miqroera-wiki-import/1.0',
    },
  });
  if (res.status >= 300 && res.status < 400) {
    throw new SafeFetchError('redirect', 'redirects are not allowed');
  }
  if (res.status < 200 || res.status >= 300) {
    throw new SafeFetchError('http_error', `import request returned HTTP ${res.status}`);
  }
  return res.text;
}

/** Fetch a public URL's body as UTF-8 text, subject to the SSRF guard. */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}): Promise<string> {
  const check = await validatePublicUrl(rawUrl);
  if (!check.ok) throw new SafeFetchError(check.kind, check.reason);
  return requestPinnedText(rawUrl, check.addrs, opts);
}
