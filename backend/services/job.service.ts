// Job service (P8 O01) — the generic job.* operation layer over the durable
// parse_jobs queue (P2-04). job.wait polls to a terminal state or timeout;
// job.cancel/job.retry transition a job (retry accepts failed OR cancelled);
// job.events derives a real lifecycle timeline from the job row; job.artifacts
// returns the document a parse job produced (if any). All are read-only or
// single-field transitions — no worker is required.
import { parseJobService } from './parse-job.service.js';
import { parseJobRepository } from '../repositories/parse-job.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { ServiceError } from './knowledge.service.js';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class JobService {
  /** job.wait — poll a job until it reaches a terminal state or times out. */
  async wait(input: { job_id: string; timeout_ms?: number; interval_ms?: number }) {
    const jobId = (input.job_id ?? '').trim();
    if (!jobId) throw new ServiceError('validation_failed', 'job_id is required');
    const timeout = clamp(input.timeout_ms ?? 10000, 100, 120000);
    const interval = clamp(input.interval_ms ?? 250, 50, 5000);
    const deadline = Date.now() + timeout;
    const started = Date.now();
    let status = await parseJobService.status(jobId);
    while (!TERMINAL.has(status.status) && Date.now() < deadline) {
      await sleep(interval);
      status = await parseJobService.status(jobId);
    }
    return {
      job_id: status.job_id,
      status: status.status,
      stage: status.stage,
      progress: status.progress,
      finished: TERMINAL.has(status.status),
      timed_out: !TERMINAL.has(status.status),
      elapsed_ms: Date.now() - started,
    };
  }

  /** job.cancel — cancel a pending/running job. */
  async cancel(jobId: string) {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      throw new ServiceError('conflict', `job ${jobId} is ${job.status}; only pending/running jobs can be cancelled`);
    }
    const updated = await parseJobRepository.cancel(jobId);
    if (!updated) throw new ServiceError('conflict', `job ${jobId} reached a terminal state concurrently; cancel is a no-op`);
    return parseJobService.status(jobId);
  }

  /** job.retry — requeue a failed or cancelled job back to pending. */
  async retry(jobId: string) {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status === 'pending' || job.status === 'running') {
      throw new ServiceError('conflict', `job ${jobId} is already ${job.status}`);
    }
    if (job.status === 'succeeded') {
      throw new ServiceError('conflict', `job ${jobId} succeeded; nothing to retry`);
    }
    await parseJobRepository.update(jobId, { status: 'pending', attempt: 0, error: null, errorCode: null, stage: null, progress: 0 });
    return parseJobService.status(jobId);
  }

  /** job.events — a lifecycle timeline derived from the job row. */
  async events(jobId: string) {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    const items: Array<{ type: string; message: string; at: string }> = [];
    items.push({ type: 'enqueued', message: `job ${jobId} enqueued`, at: job.created_at });
    if (job.started_at) items.push({ type: 'started', message: `job started (attempt ${job.attempt})`, at: job.started_at });
    if (job.finished_at) {
      items.push({ type: job.status, message: job.error ? `job ${job.status}: ${job.error}` : `job ${job.status}`, at: job.finished_at });
    } else if (job.error) {
      items.push({ type: 'error', message: job.error, at: job.updated_at });
    }
    return { job_id: jobId, items, total: items.length };
  }

  /** job.artifacts — real outputs of a job (the produced document). */
  async artifacts(jobId: string) {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    const items: Array<Record<string, unknown>> = [];
    if (job.document_id != null) {
      const doc = await knowledgeRepository.findDocumentById(job.document_id);
      if (doc) {
        items.push({
          id: `doc-${doc.id}`,
          name: doc.title,
          kind: 'document',
          uri: `/api/v2/ops/doc/view?doc_id=${doc.id}`,
          metadata: { document_id: doc.id, kb_id: doc.kb_id, parse_status: doc.parse_status },
        });
      }
    }
    return { job_id: jobId, items, total: items.length };
  }
}

export const jobService = new JobService();
