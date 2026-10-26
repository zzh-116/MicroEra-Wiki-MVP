// Operation-level authorization policy — the single source of truth that maps an
// operation's registry signals (`risk` + `scopes`) to the minimum role allowed to
// invoke it over the shared REST /api/v2/ops boundary.
//
// The Operation Registry already records, per operation, whether it is read-only,
// a write, or destructive, and which namespace scope it touches. We derive role
// requirements from those signals rather than guessing from operation names, so
// the policy stays correct as operations are added or re-scoped.
//
// This policy is enforced server-side (see `server/middleware/operation-auth.ts`);
// nothing here trusts the frontend, MCP tools/list, or any client-supplied claim.

export type Role = 'viewer' | 'editor' | 'admin';

/** Rank ordering for `roleSatisfies`: a higher rank satisfies a lower requirement. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

/**
 * Namespaces whose writes reconfigure the platform rather than edit wiki content:
 * LLM providers, external data sources, installable skills, and runnable agents.
 * These are admin-only, distinct from content writes (kb/doc/job/chat/wiki/eval)
 * which an editor may perform.
 */
export const ADMIN_WRITE_SCOPES: ReadonlySet<string> = new Set([
  'agent:write',
  'skill:write',
  'datasource:write',
  'model:write',
]);

export interface OperationSignals {
  risk: 'read' | 'write' | 'destructive';
  scopes: string[];
}

/**
 * Minimum role required to invoke an operation. Order matters: destructive beats
 * an admin-config scope, which beats a plain content write.
 */
export function requiredRoleFor(op: OperationSignals): Role {
  if (op.risk === 'destructive') return 'admin';
  if (op.scopes.some((s) => ADMIN_WRITE_SCOPES.has(s))) return 'admin';
  if (op.risk === 'write' || op.scopes.some((s) => s.endsWith(':write'))) return 'editor';
  return 'viewer';
}

/**
 * True when `role` is a known role at least as privileged as `required`. An
 * unknown role (or none) is denied — a token signed with an unrecognized role
 * must never be treated as privileged.
 */
export function roleSatisfies(role: string | undefined, required: Role): boolean {
  const rank = role ? ROLE_RANK[role as Role] : undefined;
  if (rank === undefined) return false;
  return rank >= ROLE_RANK[required];
}
