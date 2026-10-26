// Parse job service (P2-04) — durable queue over parse_jobs / parse_deadletters.
// Provides worker primitives (enqueue/lease/heartbeat/checkpoint/complete/fail)
// plus the job.* operations: parse_status, parse_retry, parse_cancel,
// deadletters, replay_deadletter. A job that exhausts its retries is moved to
// the deadletter table rather than dropped.
import { randomUUID } from 'node:crypto';
import { parseJobRepository, type ParseJobRow, type DeadletterRow } from '../repositories/parse-job.repository.js';
import { ServiceError } from './knowledge.service.js';

export type ParseJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface EnqueueInput {
  type?: string;
  document_id?: number | null;
  kb_id?: number | null;
  max_attempts?: number;
  payload?: Record<string, unknown>;
}

export interface JobStatusView {
  job_id: string;
  status: ParseJobStatus;
  type: string;
  document_id: number | null;
  attempt: number;
  max_attempts: number;
  stage: string | null;
  progress: number;
  error: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function toStatusView(job: ParseJobRow): JobStatusView {
  return {
    job_id: job.id,
    status: job.status,
    type: job.type,
    document_id: job.document_id,
    attempt: job.attempt,
    max_attempts: job.max_attempts,
    stage: job.stage,
    progress: job.progress,
    error: job.error,
    error_code: job.error_code,
    created_at: job.created_at,
    updated_at: job.updated_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
  };
}

const DEFAULT_LEASE_SECONDS = 60;

export class ParseJobService {
  /** Create a pending job (the parse pipeline enqueues here). */
  async enqueue(input: EnqueueInput): Promise<JobStatusView> {
    const job = await parseJobRepository.createJob({
      id: `parse_${randomUUID()}`,
      type: input.type,
      document_id: input.document_id,
      kb_id: input.kb_id,
      max_attempts: input.max_attempts,
      payload: input.payload,
    });
    return toStatusView(job);
  }

  /** job.parse_status — query a job's status, stage, and progress. */
  async status(jobId: string): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    return toStatusView(job);
  }

  /** job.parse_retry — requeue a failed job (attempt is not incremented here). */
  async retry(jobId: string): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status === 'succeeded' || job.status === 'cancelled' || job.status === 'running' || job.status === 'pending') {
      throw new ServiceError('conflict', `job ${jobId} is ${job.status}; only failed jobs can be retried`);
    }
    const updated = await parseJobRepository.update(jobId, {
      status: 'pending',
      attempt: 0,
      error: null,
      errorCode: null,
      stage: null,
      progress: 0,
    });
    return toStatusView(updated!);
  }

  /** job.parse_cancel — cancel a pending or running job. */
  async cancel(jobId: string): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status === 'succeeded' || job.status === 'cancelled' || job.status === 'failed') {
      throw new ServiceError('conflict', `job ${jobId} is ${job.status}; only pending/running jobs can be cancelled`);
    }
    const updated = await parseJobRepository.cancel(jobId);
    if (!updated) throw new ServiceError('conflict', `job ${jobId} reached a terminal state concurrently; cancel is a no-op`);
    return toStatusView(updated);
  }

  // ── Worker primitives ──────────────────────────────────────────────────
  /** Lease up to `limit` pending jobs for a worker. */
  async lease(owner: string, limit = 5, leaseSeconds = DEFAULT_LEASE_SECONDS): Promise<ParseJobRow[]> {
    const pending = await parseJobRepository.listPending(limit);
    const leased: ParseJobRow[] = [];
    for (const job of pending) {
      const claimed = await parseJobRepository.claim(job.id, owner, leaseSeconds);
      if (claimed) leased.push(claimed);
    }
    return leased;
  }

  /** Renew a lease (heartbeat) — no-op if the job no longer belongs to owner. */
  async heartbeat(jobId: string, owner: string, leaseSeconds = DEFAULT_LEASE_SECONDS): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status !== 'running' || job.lease_owner !== owner) {
      throw new ServiceError('conflict', `job ${jobId} is not leased by ${owner}`);
    }
    const updated = await parseJobRepository.guardedUpdate(jobId, owner, job.lease_version, {
      leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000),
    });
    if (!updated) throw new ServiceError('conflict', `job ${jobId} lease was lost by ${owner}`);
    return toStatusView(updated);
  }

  /** Persist a resumable checkpoint on a running job. */
  async checkpoint(jobId: string, owner: string, checkpoint: Record<string, unknown>): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status !== 'running' || job.lease_owner !== owner) {
      throw new ServiceError('conflict', `job ${jobId} is not leased by ${owner}`);
    }
    const updated = await parseJobRepository.guardedUpdate(jobId, owner, job.lease_version, { checkpoint });
    if (!updated) throw new ServiceError('conflict', `job ${jobId} lease was lost by ${owner}`);
    return toStatusView(updated);
  }

  /** Mark a job succeeded. */
  async complete(jobId: string, owner: string): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status !== 'running' || job.lease_owner !== owner) {
      throw new ServiceError('conflict', `job ${jobId} is not leased by ${owner}`);
    }
    const updated = await parseJobRepository.guardedUpdate(jobId, owner, job.lease_version, {
      status: 'succeeded',
      progress: 100,
      stage: 'done',
      finishedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    if (!updated) throw new ServiceError('conflict', `job ${jobId} lease was lost by ${owner}`);
    return toStatusView(updated);
  }

  /** Mark a job failed; requeue below max_attempts, deadletter when exhausted. */
  async fail(jobId: string, owner: string, error: string, errorCode?: string): Promise<{ job_id: string; status: ParseJobStatus; attempt: number; deadlettered: boolean }> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status !== 'running' || job.lease_owner !== owner) {
      throw new ServiceError('conflict', `job ${jobId} is not leased by ${owner}`);
    }
    const attempt = job.attempt + 1;
    if (attempt >= job.max_attempts) {
      await parseJobRepository.deadletter({
        id: `dl_${randomUUID()}`,
        job_id: jobId,
        document_id: job.document_id,
        error,
        error_code: errorCode ?? null,
        attempts: attempt,
        payload: job.payload,
      });
      const updated = await parseJobRepository.guardedUpdate(jobId, owner, job.lease_version, {
        status: 'failed',
        attempt,
        error,
        errorCode: errorCode ?? null,
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      if (!updated) throw new ServiceError('conflict', `job ${jobId} lease was lost by ${owner}`);
      return { job_id: jobId, status: updated.status, attempt, deadlettered: true };
    }
    const updated = await parseJobRepository.guardedUpdate(jobId, owner, job.lease_version, {
      status: 'pending',
      attempt,
      error,
      errorCode: errorCode ?? null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    if (!updated) throw new ServiceError('conflict', `job ${jobId} lease was lost by ${owner}`);
    return { job_id: jobId, status: updated.status, attempt, deadlettered: false };
  }

  /** Mark a job permanently failed — terminal without retry or deadletter.
   *  Used for superseded/deleted-document attempts that must not be retried. */
  async failPermanently(jobId: string, owner: string, error: string, errorCode: string): Promise<JobStatusView> {
    const job = await parseJobRepository.findById(jobId);
    if (!job) throw new ServiceError('resource_not_found', `job ${jobId} not found`);
    if (job.status !== 'running' || job.lease_owner !== owner) {
      throw new ServiceError('conflict', `job ${jobId} is not leased by ${owner}`);
    }
    const updated = await parseJobRepository.guardedUpdate(jobId, owner, job.lease_version, {
      status: 'failed',
      error,
      errorCode,
      finishedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    if (!updated) throw new ServiceError('conflict', `job ${jobId} lease was lost by ${owner}`);
    return toStatusView(updated);
  }

  /** Reclaim running jobs whose lease expired (crashed worker), fencing out
   *  the dead worker's in-flight writes by bumping each lease_version. */
  async reclaimExpired(): Promise<ParseJobRow[]> {
    return parseJobRepository.reclaimExpired(new Date());
  }

  // ── Deadletters ────────────────────────────────────────────────────────
  /** job.deadletters — list dead-lettered jobs. */
  async deadletters(): Promise<{ items: DeadletterRow[]; total: number }> {
    const items = await parseJobRepository.listDeadletters();
    return { items, total: items.length };
  }

  /** job.replay_deadletter — requeue a deadlettered job (destructive reset). */
  async replayDeadletter(id: string): Promise<JobStatusView> {
    const dl = await parseJobRepository.findDeadletter(id);
    if (!dl) throw new ServiceError('resource_not_found', `deadletter ${id} not found`);
    if (dl.replayed_at) throw new ServiceError('conflict', `deadletter ${id} was already replayed`);

    // Reset the original job back to pending; if the job row is gone, recreate
    // a fresh one from the deadletter payload so the work is never lost.
    const existing = await parseJobRepository.findById(dl.job_id);
    let jobId = dl.job_id;
    if (existing) {
      await parseJobRepository.update(jobId, {
        status: 'pending',
        attempt: 0,
        error: null,
        errorCode: null,
        stage: null,
        progress: 0,
      });
    } else {
      const created = await parseJobRepository.createJob({
        id: `parse_${randomUUID()}`,
        document_id: dl.document_id,
        payload: dl.payload,
      });
      jobId = created.id;
    }
    await parseJobRepository.markReplayed(id);

    const job = (await parseJobRepository.findById(jobId))!;
    return toStatusView(job);
  }
}

export const parseJobService = new ParseJobService();
