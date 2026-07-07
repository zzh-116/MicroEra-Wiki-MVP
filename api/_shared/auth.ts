import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'microera-wiki-mvp-secret-2026';

export interface JwtPayload {
  userId: number;
  username: string;
  iat: number;
  exp: number;
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 86400 }; // 24h expiry

  const headerB64 = base64url(JSON.stringify(header));
  const bodyB64 = base64url(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${bodyB64}`)
    .digest('base64url');

  return `${headerB64}.${bodyB64}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, bodyB64, sigB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');

    if (sigB64 !== expectedSig) return null;

    const payload = JSON.parse(
      Buffer.from(bodyB64, 'base64url').toString('utf-8')
    ) as JwtPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Extract and verify JWT from Authorization header */
export function authenticate(headers: Record<string, string | undefined>): JwtPayload | null {
  const auth = headers['authorization'] || headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}
