// Regression tests for P0 security fixes:
//   - requireRole() role-gating (admin-only routes)
//   - validateProductionSecrets() hard-fail on built-in default secrets
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { requireRole } from '../../server/middleware/auth.js';

function mockReq(user: { userId: number; username: string; role: string } | undefined): Request {
  return { user, isInternal: Boolean(user) } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe('requireRole (admin-only authorization)', () => {
  it('returns 401 when there is no authenticated user', () => {
    const res = mockRes();
    const next = mockNext();
    requireRole('admin')(mockReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user role is not allowed', () => {
    const res = mockRes();
    const next = mockNext();
    requireRole('admin')(mockReq({ userId: 2, username: 'editor', role: 'editor' }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'FORBIDDEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the user holds the required role', () => {
    const res = mockRes();
    const next = mockNext();
    requireRole('admin')(mockReq({ userId: 1, username: 'admin', role: 'admin' }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('accepts any of multiple allowed roles', () => {
    const next = mockNext();
    requireRole('admin', 'editor')(mockReq({ userId: 2, username: 'editor', role: 'editor' }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('validateProductionSecrets (default-credential hard fail)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
  });

  it('does nothing outside production', async () => {
    process.env.NODE_ENV = 'test';
    const { validateProductionSecrets } = await import('../../backend/config.js');
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it('throws in production when JWT_SECRET is the built-in default', async () => {
    process.env.NODE_ENV = 'production';
    const { validateProductionSecrets, DEFAULT_JWT_SECRET } = await import('../../backend/config.js');
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    process.env.ADMIN_PASSWORD = 'a-custom-password';
    expect(() => validateProductionSecrets()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when ADMIN_PASSWORD is the built-in default', async () => {
    process.env.NODE_ENV = 'production';
    const { validateProductionSecrets, DEFAULT_ADMIN_PASSWORD } = await import('../../backend/config.js');
    process.env.JWT_SECRET = 'a-custom-secret';
    process.env.ADMIN_PASSWORD = DEFAULT_ADMIN_PASSWORD;
    expect(() => validateProductionSecrets()).toThrow(/ADMIN_PASSWORD/);
  });

  it('does not throw in production when both secrets are overridden', async () => {
    process.env.NODE_ENV = 'production';
    const { validateProductionSecrets } = await import('../../backend/config.js');
    process.env.JWT_SECRET = 'a-custom-secret';
    process.env.ADMIN_PASSWORD = 'a-custom-password';
    expect(() => validateProductionSecrets()).not.toThrow();
  });
});
