// Retrieval v2 operations — REST surface for the search.* / eval.* verbs.
// Mirrors knowledge-v2.ts: each handler resolves a ServiceError onto the wire
// contract (ok/fail) so CLI and MCP clients see identical JSON to raw HTTP.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const retrievalV2Router = Router();

retrievalV2Router.use(requireAuth);

function toInt(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const ERROR_STATUS: Record<ServiceError['kind'], number> = {
  resource_not_found: 404,
  validation_failed: 400,
  conflict: 409,
  internal: 500,
};

async function handle(
  op: string,
  req: Request,
  res: Response,
  fn: () => Promise<unknown>,
): Promise<void> {
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

// ── Search (P3) ─────────────────────────────────────────────────────────────
retrievalV2Router.post('/search/vector', (req, res) =>
  handle('search.vector', req, res, async () => {
    const items = await retrievalService.vectorSearch({
      query: req.body?.query,
      kb_id: toInt(req.body?.kb_id),
      folder_id: toInt(req.body?.folder_id),
      top_k: toInt(req.body?.top_k),
      is_internal: req.body?.is_internal,
    });
    return { query: req.body?.query ?? '', items, total: items.length };
  }));
