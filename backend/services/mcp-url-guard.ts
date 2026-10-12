// MCP URL guard — SSRF protection for agent.mcp_test / agent.mcp_call.
//
// The agent.* MCP operations accept a server URL that the backend will fetch.
// Without a guard, an authenticated-but-low-privilege caller could point the
// backend at cloud metadata (169.254.169.254), the local Postgres, or an
// internal host. This module classifies a URL before any network I/O:
//
//   - scheme must be http/https (no file://, gopher://, etc.),
//   - userinfo credentials are rejected,
//   - the hostname is resolved and every address is classified,
//   - loopback (127.0.0.0/8, ::1) is always allowed (self-hosted MCP + tests),
//   - private/link-local/reserved/ULA/multicast ranges are blocked unless the
//     operator explicitly opts in with MCP_ALLOW_PRIVATE=1.
//
// Only Streamable HTTP is supported; there is no stdio transport, so the URL
// is never turned into a spawned command (no arbitrary command execution).
import { BlockList } from 'node:net';
import { lookup } from 'node:dns/promises';

const blockedV4 = new BlockList();
// 0.0.0.0/8 — "this network"
blockedV4.addSubnet('0.0.0.0', 8, 'ipv4');
// RFC1918 private + CGNAT + link-local + reserved + multicast
blockedV4.addSubnet('10.0.0.0', 8, 'ipv4');
blockedV4.addSubnet('100.64.0.0', 10, 'ipv4');
blockedV4.addSubnet('169.254.0.0', 16, 'ipv4');
blockedV4.addSubnet('172.16.0.0', 12, 'ipv4');
blockedV4.addSubnet('192.0.0.0', 24, 'ipv4');
blockedV4.addSubnet('192.0.2.0', 24, 'ipv4');
blockedV4.addSubnet('192.168.0.0', 16, 'ipv4');
blockedV4.addSubnet('198.18.0.0', 15, 'ipv4');
blockedV4.addSubnet('198.51.100.0', 24, 'ipv4');
blockedV4.addSubnet('203.0.113.0', 24, 'ipv4');
blockedV4.addSubnet('224.0.0.0', 4, 'ipv4');
blockedV4.addSubnet('240.0.0.0', 4, 'ipv4');

const blockedV6 = new BlockList();
blockedV6.addSubnet('::', 128, 'ipv6'); // unspecified
blockedV6.addSubnet('fe80::', 10, 'ipv6'); // link-local
blockedV6.addSubnet('fc00::', 7, 'ipv6'); // unique local
blockedV6.addSubnet('fec0::', 10, 'ipv6'); // site-local (deprecated)
blockedV6.addSubnet('ff00::', 8, 'ipv6'); // multicast

type Classification = 'loopback' | 'blocked' | 'public';

function classifyIp(address: string, family: 4 | 6): Classification {
  if (family === 6) {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — classify the embedded IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
    if (mapped) return classifyIp(mapped[1], 4);
    if (address === '::1') return 'loopback';
    return blockedV6.check(address, 'ipv6') ? 'blocked' : 'public';
  }
  if (address.startsWith('127.')) return 'loopback';
  return blockedV4.check(address, 'ipv4') ? 'blocked' : 'public';
}

export type McpUrlCheck =
  | { ok: true; hostname: string; loopback: boolean }
  | { ok: false; kind: 'unsupported_scheme' | 'invalid_url' | 'ssrf_blocked'; reason: string };

export interface McpUrlGuardOptions {
  /** Allow private/ULA ranges (defaults to MCP_ALLOW_PRIVATE env). */
  allowPrivate?: boolean;
}

export async function checkMcpUrl(rawUrl: string, opts: McpUrlGuardOptions = {}): Promise<McpUrlCheck> {
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

  const allowPrivate = opts.allowPrivate ?? (process.env.MCP_ALLOW_PRIVATE === '1' || process.env.MCP_ALLOW_PRIVATE === 'true');

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    return { ok: false, kind: 'invalid_url', reason: `hostname '${hostname}' could not be resolved` };
  }

  let loopback = false;
  for (const a of addrs) {
    const family: 4 | 6 = a.family === 6 ? 6 : 4;
    const cls = classifyIp(a.address, family);
    if (cls === 'blocked' && !allowPrivate) {
      return { ok: false, kind: 'ssrf_blocked', reason: `host '${hostname}' resolves to a private/reserved address (${a.address}); refusing to connect` };
    }
    if (cls === 'loopback') loopback = true;
  }
  return { ok: true, hostname, loopback };
}
