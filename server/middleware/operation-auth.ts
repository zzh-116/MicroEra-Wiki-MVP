// Operation-level authorization middleware for the REST /api/v2/ops boundary.
//
// The CLI, the HTTP MCP, the stdio MCP, and raw REST all reach the backend through
// the same /api/v2/ops routes. Enforcing the role matrix here — once, server-side,
// keyed on the Operation Registry — means every transport shares a single
// authorization boundary. It does NOT depend on the frontend hiding buttons, on
// MCP tools/list, or on any client-supplied permission claim.
//
// Policy is derived from the registry (`risk` + `scopes`) via `requiredRoleFor`,
// so permissions are never guessed from operation names. High-risk/destructive
// operations require admin, content writes require editor, reads allow viewer.
// Any route not present in the registry (or the explicit REST-only allowlist
// below) is default-deny.
import { Request, Response, NextFunction } from 'express';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ensureOperationsRegistered } from '../../packages/operation-registry/src/operations.js';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { requiredRoleFor, roleSatisfies, type Role } from '../../packages/operation-registry/src/authorization.js';
import { config } from '../../backend/config.js';

// Routes that exist on the REST surface but have no registry `http` entry (the
// multipart upload route is modelled by the registry as a single logical op that
// does not map 1:1 onto the wire path). Keys are `${METHOD} ${path}` matched
// against `req.baseUrl + req.path`.
const REST_ONLY: Record<string, Role> = {
  'POST /api/v2/ops/doc/upload-file': 'editor',
};

let index: Map<string, Role> | undefined;

function buildIndex(): Map<string, Role> {
  if (!index) {
    // Populate the registry once (idempotent) so the index reflects every op.
    // The base URL only matters for handlers that never run during enforcement;
    // it mirrors `meta.service.ensure()` and is never used for a network call here.
    ensureOperationsRegistered(new ApiClient({ baseUrl: `http://localhost:${config.port}` }));

    index = new Map<string, Role>(Object.entries(REST_ONLY) as Array<[string, Role]>);
    for (const def of operationRegistry.list()) {
      if (!def.http) continue;
      index.set(`${def.http.method} ${def.http.path}`, requiredRoleFor({ risk: def.risk, scopes: def.mcp.scopes }));
    }
  }
  return index;
}

/** Minimum role required for a REST method+path, or undefined when unknown. */
export function requiredRoleForPath(method: string, path: string): Role | undefined {
  return buildIndex().get(`${method} ${path}`);
}

/**
 * Express middleware enforcing the role matrix. Must run AFTER `requireAuth`
 * (it reads `req.user`). Returns 401 when unauthenticated, 403 when the role is
 * insufficient or the operation is unknown (default-deny).
 */
export function requireOperationRole(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }
  const required = buildIndex().get(`${req.method} ${req.baseUrl}${req.path}`);
  if (!required) {
    res.status(403).json({ error: 'FORBIDDEN', message: `Operation not permitted: ${req.method} ${req.originalUrl}` });
    return;
  }
  if (!roleSatisfies(req.user.role, required)) {
    res.status(403).json({ error: 'FORBIDDEN', message: `Requires role: ${required}` });
    return;
  }
  next();
}
