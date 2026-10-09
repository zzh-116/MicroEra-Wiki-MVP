import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { authService } from '../../backend/services/auth.service.js';
import { config } from '../../backend/config.js';

// Single source of truth for the signing secret. The built-in default is only
// ever acceptable in a local dev checkout — `validateProductionSecrets()` hard
// fails boot in production when it is still in use.
const JWT_SECRET = config.jwtSecret;

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 86400 };

  const h = base64url(JSON.stringify(header));
  const b = base64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${sig}`;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, b, sig] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf-8')) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      isInternal: boolean;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token expired or invalid' });
    return;
  }
  req.user = payload;
  req.isInternal = true;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  req.isInternal = false;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload) { req.user = payload; req.isInternal = true; }
  }
  next();
}

/**
 * Role-gated authorization. Must run AFTER `requireAuth` (it reads `req.user`).
 * Admin-only operations (index rebuild, log purge, destructive resets) must
 * not be reachable by a viewer/editor simply holding a valid token.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'FORBIDDEN', message: `Requires role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}
