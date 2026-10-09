// Job v2 operations — REST surface for the generic job.* verbs (P8 O01).
// Operates over the durable parse_jobs queue; job.list/job.view already exist
// over the legacy /api/pipeline/jobs import tracker.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { jobService } from '../../backend/services/job.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const jobV2Router = Router();

jobV2Router.use(requireAuth);

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

function idFrom(req: Request, key: string): any {
  return req.query?.[key] ?? req.body?.[key];
}

jobV2Router.get('/job/wait', (req, res) =>
  handle('job.wait', req, res, () =>
    jobService.wait({
      job_id: String(idFrom(req, 'job_id') ?? ''),
      timeout_ms: toInt(req.query.timeout_ms),
      interval_ms: toInt(req.query.interval_ms),
    })));

jobV2Router.post('/job/cancel', (req, res) =>
  handle('job.cancel', req, res, () => jobService.cancel(String(req.body?.job_id ?? ''))));

jobV2Router.post('/job/retry', (req, res) =>
  handle('job.retry', req, res, () => jobService.retry(String(req.body?.job_id ?? ''))));

jobV2Router.get('/job/events', (req, res) =>
  handle('job.events', req, res, () => jobService.events(String(idFrom(req, 'job_id') ?? ''))));

jobV2Router.get('/job/artifacts', (req, res) =>
  handle('job.artifacts', req, res, () => jobService.artifacts(String(idFrom(req, 'job_id') ?? ''))));
