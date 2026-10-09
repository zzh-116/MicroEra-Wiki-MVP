// Model v2 operations — REST surface for the model.* verbs (P8 M01/M03).
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { modelService } from '../../backend/services/model.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const modelV2Router = Router();

modelV2Router.use(requireAuth);

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

function uid(req: Request): number {
  return req.user!.userId;
}

function idFrom(req: Request, key: string): any {
  return req.query?.[key] ?? req.body?.[key];
}

// ── M01: list / view / create / update / delete / test / set_default ─────────
modelV2Router.get('/model/list', (req, res) =>
  handle('model.list', req, res, () =>
    modelService.list({ kind: req.query.kind as string | undefined, page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

modelV2Router.get('/model/view', (req, res) =>
  handle('model.view', req, res, () => modelService.view(Number(idFrom(req, 'model_id')))));

modelV2Router.post('/model/create', (req, res) =>
  handle('model.create', req, res, () =>
    modelService.create({
      name: req.body?.name,
      kind: req.body?.kind,
      provider: req.body?.provider,
      model_name: req.body?.model_name,
      base_url: req.body?.base_url,
      config: req.body?.config,
      is_default: req.body?.is_default,
      created_by: uid(req),
    })));

modelV2Router.patch('/model/update', (req, res) =>
  handle('model.update', req, res, () =>
    modelService.update(Number(idFrom(req, 'model_id')), {
      name: req.body?.name,
      provider: req.body?.provider,
      model_name: req.body?.model_name,
      base_url: req.body?.base_url,
      config: req.body?.config,
      status: req.body?.status,
    })));

modelV2Router.delete('/model/delete', (req, res) =>
  handle('model.delete', req, res, () => modelService.remove(Number(idFrom(req, 'model_id')))));

modelV2Router.post('/model/test', (req, res) =>
  handle('model.test', req, res, () => modelService.test(Number(req.body?.model_id))));

modelV2Router.post('/model/set_default', (req, res) =>
  handle('model.set_default', req, res, () => modelService.setDefault(Number(req.body?.model_id))));

// ── M03: rerank_list / rerank_test ────────────────────────────────────────────
modelV2Router.get('/model/rerank_list', (_req, res) =>
  handle('model.rerank_list', _req, res, () => modelService.rerankList()));

modelV2Router.post('/model/rerank_test', (req, res) =>
  handle('model.rerank_test', req, res, () =>
    modelService.rerankTest({
      query: req.body?.query,
      documents: req.body?.documents,
      model_id: toInt(req.body?.model_id),
      top_k: toInt(req.body?.top_k),
    })));
