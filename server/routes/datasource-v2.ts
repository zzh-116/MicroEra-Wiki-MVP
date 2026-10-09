// Datasource v2 operations — REST surface for the datasource.* verbs (P7).
// Mirrors the other v2 routers: handlers resolve a ServiceError onto the wire
// contract so CLI/MCP clients see identical JSON.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { datasourceService } from '../../backend/services/datasource.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const datasourceV2Router = Router();

datasourceV2Router.use(requireAuth);

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

function uid(req: Request): number {
  return req.user!.userId;
}

function idFrom(req: Request, key: string): any {
  return req.query?.[key] ?? req.body?.[key];
}

// ── D01: types / list / create / view / connect / preview ────────────────────
datasourceV2Router.get('/datasource/types', (_req, res) =>
  handle('datasource.types', _req, res, () => datasourceService.types()));

datasourceV2Router.get('/datasource/list', (req, res) =>
  handle('datasource.list', req, res, () =>
    datasourceService.list({ page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

datasourceV2Router.post('/datasource/create', (req, res) =>
  handle('datasource.create', req, res, () =>
    datasourceService.create({
      name: req.body?.name,
      connector: req.body?.connector,
      config: req.body?.config,
      schedule: req.body?.schedule,
      created_by: uid(req),
    })));

datasourceV2Router.get('/datasource/view', (req, res) =>
  handle('datasource.view', req, res, () => datasourceService.view(Number(idFrom(req, 'datasource_id')))));

datasourceV2Router.post('/datasource/connect', (req, res) =>
  handle('datasource.connect', req, res, () => datasourceService.connect(Number(req.body?.datasource_id))));

datasourceV2Router.post('/datasource/preview', (req, res) =>
  handle('datasource.preview', req, res, () =>
    datasourceService.preview({
      datasource_id: Number(req.body?.datasource_id),
      projectId: req.body?.projectId,
      keyword: req.body?.keyword,
    })));

// ── D02: sync / changes / cursor / logs ───────────────────────────────────────
datasourceV2Router.post('/datasource/sync', (req, res) =>
  handle('datasource.sync', req, res, () =>
    datasourceService.sync({
      datasource_id: Number(req.body?.datasource_id),
      since: req.body?.since,
      dryRun: req.body?.dryRun,
      projectId: req.body?.projectId,
      keyword: req.body?.keyword,
    })));

datasourceV2Router.get('/datasource/changes', (req, res) =>
  handle('datasource.changes', req, res, () =>
    datasourceService.changes({
      datasource_id: Number(idFrom(req, 'datasource_id')),
      since: idFrom(req, 'since'),
    })));

datasourceV2Router.get('/datasource/cursor', (req, res) =>
  handle('datasource.cursor', req, res, () => datasourceService.cursor(Number(idFrom(req, 'datasource_id')))));

datasourceV2Router.get('/datasource/logs', (req, res) =>
  handle('datasource.logs', req, res, () =>
    datasourceService.logs({
      datasource_id: Number(idFrom(req, 'datasource_id')),
      page: toInt(req.query.page),
      page_size: toInt(req.query.page_size),
    })));

// ── D04: schedule / pause / resume / delete ───────────────────────────────────
datasourceV2Router.post('/datasource/schedule', (req, res) =>
  handle('datasource.schedule', req, res, () =>
    datasourceService.schedule(Number(req.body?.datasource_id), req.body?.schedule)));

datasourceV2Router.post('/datasource/pause', (req, res) =>
  handle('datasource.pause', req, res, () => datasourceService.pause(Number(req.body?.datasource_id))));

datasourceV2Router.post('/datasource/resume', (req, res) =>
  handle('datasource.resume', req, res, () => datasourceService.resume(Number(req.body?.datasource_id))));

datasourceV2Router.delete('/datasource/delete', (req, res) =>
  handle('datasource.delete', req, res, () => datasourceService.remove(Number(idFrom(req, 'datasource_id')))));
