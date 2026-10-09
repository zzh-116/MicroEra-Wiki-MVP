// Eval v2 operations — REST surface for eval.* (P3-05). Mirrors knowledge-v2.ts
// and retrieval-v2.ts: each handler resolves a ServiceError onto the wire
// contract so CLI and MCP clients see identical JSON to raw HTTP.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { evalService } from '../../backend/services/eval.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const evalV2Router = Router();

evalV2Router.use(requireAuth);

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

// ── Eval (P3-05) ─────────────────────────────────────────────────────────────
evalV2Router.get('/eval/dataset_list', (req, res) =>
  handle('eval.dataset_list', req, res, () =>
    evalService.listDatasets({ page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

evalV2Router.post('/eval/dataset_create', (req, res) =>
  handle('eval.dataset_create', req, res, () =>
    evalService.createDataset({
      name: req.body?.name,
      kb_id: toInt(req.body?.kb_id),
      description: req.body?.description,
      method: req.body?.method,
      queries: req.body?.queries,
    })));

evalV2Router.post('/eval/run', (req, res) =>
  handle('eval.run', req, res, () =>
    evalService.runEval({
      dataset_id: toInt(req.body?.dataset_id),
      method: req.body?.method,
      top_k: toInt(req.body?.top_k),
      is_internal: req.body?.is_internal,
    })));

evalV2Router.post('/eval/report', (req, res) =>
  handle('eval.report', req, res, () =>
    evalService.report({ run_id: req.body?.run_id })));

evalV2Router.post('/eval/compare', (req, res) =>
  handle('eval.compare', req, res, () =>
    evalService.compare({ run_ids: req.body?.run_ids })));
