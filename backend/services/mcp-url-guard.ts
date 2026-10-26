// MCP URL guard — the shared IP-range classification tables used by every SSRF
// guard in the backend.
//
// This module no longer performs the policy decision (loopback allowed vs
// blocked, private allowed vs blocked). The two consumers apply their own policy
// on top of `classifyIp`:
//
//   - `ssrf-fetch.ts` `validatePublicUrl` (doc.import_url) — loopback, private,
//     link-local (incl. cloud metadata), reserved, ULA and multicast are ALL
//     blocked; every address must be public.
//   - `ssrf-fetch.ts` `validateMcpUrl` (agent.mcp_test / agent.mcp_call) — the
//     same default-deny, except that an explicitly trusted endpoint (hostname or
//     IP, optionally "host:port") may be non-public. There is no "open all of
//     localhost" switch; loopback is refused by default.
//
// `classifyIp` is pure: it never performs DNS or any network I/O, so it is safe
// to reuse before a socket is opened.
import { BlockList } from 'node:net';

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
// IPv4-compatible IPv6 (::a.b.c.d, deprecated) — block the whole ::/96 range so
// both dotted and hex spellings of an embedded IPv4 are caught (::1 is handled
// as loopback before this check).
blockedV6.addSubnet('::', 96, 'ipv6');
// IPv4-mapped IPv6 in hex form (::ffff:xxxx:xxxx). The dotted ::ffff:a.b.c.d
// form is extracted and re-classified by classifyIp; this catches the hex
// spelling that otherwise falls through as "public".
blockedV6.addSubnet('::ffff:0:0', 96, 'ipv6');

export type Classification = 'loopback' | 'blocked' | 'public';

/**
 * Classify a single resolved address. Shared by the doc.import_url guard
 * (validatePublicUrl) and the Agent MCP guard (validateMcpUrl); both apply a
 * default-deny policy on top of this classification.
 */
export function classifyIp(address: string, family: 4 | 6): Classification {
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
