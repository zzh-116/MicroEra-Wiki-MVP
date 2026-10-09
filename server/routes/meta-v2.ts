// Meta v2 operations — REST surface for the api.*/mcp.*/cli.* introspection
// verbs (P9 X01–X03). These read the Operation Registry and the MCP host
// builders; they are all read-only (the two POST verbs are discovery, not
// state changes).
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { metaService } from '../../backend/services/meta.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const metaV2Router = Router();

metaV2Router.use(requireAuth);

const ERROR_STATUS: Record<ServiceError['kind'], number> = {
  resource_not_found: 404,
  validation_failed: 400,
  conflict: 409,
  internal: 500,
};

async function handle(op: string, req: Request, res: Response, fn: () => Promise<unknown>): Promise<void> {
  const trace = newTraceId();
  try {
    const data = await fn();
    res.json(ok(op, data, trace));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      const status = ERROR_STATUS[err.kind];
      res.status(status).json(fail(op, err.kind as ErrorKindKey, err.message, trace));
      return;
    }
    res.status(500).json(fail(op, 'internal', err?.message ?? 'internal error', trace));
  }
}

// ── X01: api.* ─────────────────────────────────────────────────────────────
metaV2Router.get('/api/operations', (req, res) =>
  handle('api.operations', req, res, () => metaService.operations()));

metaV2Router.get('/api/schema', (req, res) =>
  handle('api.schema', req, res, () =>
    metaService.schema(typeof req.query.operation_id === 'string' ? req.query.operation_id : undefined)));

metaV2Router.get('/api/version', (req, res) =>
  handle('api.version', req, res, () => metaService.version()));

// ── X02: mcp.* ─────────────────────────────────────────────────────────────
metaV2Router.get('/mcp/tools', (req, res) =>
  handle('mcp.tools', req, res, () => metaService.tools()));

metaV2Router.post('/mcp/resources', (req, res) =>
  handle('mcp.resources', req, res, () => metaService.resources()));

metaV2Router.post('/mcp/prompts', (req, res) =>
  handle('mcp.prompts', req, res, () => metaService.prompts()));

metaV2Router.get('/mcp/health', (req, res) =>
  handle('mcp.health', req, res, () => metaService.health()));

// ── X03: cli.* ─────────────────────────────────────────────────────────────
metaV2Router.post('/cli/commands', (req, res) =>
  handle('cli.commands', req, res, () => metaService.commands()));

metaV2Router.get('/cli/version', (req, res) =>
  handle('cli.version', req, res, () => metaService.cliVersion()));

metaV2Router.post('/cli/doctor', (req, res) =>
  handle('cli.doctor', req, res, () => metaService.doctor()));

metaV2Router.get('/cli/schema', (req, res) =>
  handle('cli.schema', req, res, () => metaService.schema()));
