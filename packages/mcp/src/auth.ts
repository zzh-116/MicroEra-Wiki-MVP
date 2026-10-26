// HTTP MCP inbound authentication.
//
// The stdio transport runs as a local child process under the operator's own
// account and is never network-exposed, so it keeps the operator-configured
// service token (`MICROERA_TOKEN`). The HTTP transport IS network-reachable and
// therefore authenticates every request with a per-caller MiqroEra JWT — the
// same HS256 token the backend issues at login.
//
// We deliberately do NOT reuse `MICROERA_TOKEN` as a shared identity for HTTP
// callers: that would let any client act as the server's own high-privilege
// principal. Each HTTP request must present its own token; we verify it here
// (signature + expiry), then forward it *verbatim* to the backend so the backend
// re-verifies it and applies its own per-user authorization.
import crypto from 'node:crypto';

// Mirrors `backend/config.ts` `DEFAULT_JWT_SECRET`. The backend signs with
// `config.jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET`, so an HTTP
// MCP must verify against the SAME secret (set `JWT_SECRET` to match in deploy).
const DEFAULT_JWT_SECRET = 'microera-wiki-mvp-secret-2026';

export interface McpIdentity {
  userId: number;
  username: string;
  role: string;
}

export type McpAuthFailureReason = 'missing' | 'invalid' | 'expired' | 'forbidden';

export type McpAuthResult =
  | { ok: true; token: string; identity: McpIdentity }
  | { ok: false; reason: McpAuthFailureReason; status: 401 | 403 };

function jwtSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  exp: number;
}

/** Verify an HS256 JWT signature and return the decoded payload, or null. */
function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, b, sig] = parts;
    const expected = crypto.createHmac('sha256', jwtSecret()).update(`${h}.${b}`).digest('base64url');
    const a = Buffer.from(sig);
    const e = Buffer.from(expected);
    if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf-8')) as JwtPayload;
    if (typeof payload.exp !== 'number' || typeof payload.userId !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authenticate an inbound HTTP request. Returns a generic reason only — never
 * the token or any part of it — so callers can safely log/surface the reason
 * without leaking credentials.
 */
export function authenticate(authorization: string | undefined): McpAuthResult {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing', status: 401 };
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return { ok: false, reason: 'missing', status: 401 };

  const payload = verifyJwt(token);
  if (!payload) return { ok: false, reason: 'invalid', status: 401 };
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired', status: 401 };
  }

  // Optional MCP-edge role gate. Unset by default — the backend still enforces
  // per-route roles. Set `MCP_REQUIRED_ROLE=admin,editor` to also gate here.
  const required = (process.env.MCP_REQUIRED_ROLE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (required.length > 0 && !required.includes(payload.role)) {
    return { ok: false, reason: 'forbidden', status: 403 };
  }

  return {
    ok: true,
    token,
    identity: { userId: payload.userId, username: payload.username, role: payload.role },
  };
}
