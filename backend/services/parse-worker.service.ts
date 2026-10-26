// Parse job worker (2b Phase 0) — the durable-queue consumer skeleton.
//
// Phase 0 ships the base lifecycle only: poll → reclaim expired leases → lease
// → heartbeat → run an injectable processor → complete/fail, plus graceful
// stop. It is deliberately decoupled from the KB document domain and from
// Docling: the processor is injected by the caller, and the default (see
// `server/worker.ts`) throws so no job is ever falsely marked succeeded before
// a real parser is wired in Phase 1.
//
// Fencing: every worker write goes through `parseJobService`'s guarded updates
// (lease_owner + lease_version + status='running'), so a worker whose lease was
// reclaimed or cancelled cannot overwrite job state after losing ownership.
import { parseJobService } from './parse-job.service.js';
import { ParseCommitError } from '../repositories/parse-commit.repository.js';
import { ParseProcessorError } from './parse-processor.service.js';
import type { ParseJobRow } from '../repositories/parse-job.repository.js';

export type ParseProcessor = (job: ParseJobRow) => Promise<void>;

export interface ParseWorkerOptions {
  /** Unique worker identity used as lease_owner. */
  owner: string;
  /** Max jobs leased per poll (also bounds in-flight concurrency per batch). */
  concurrency?: number;
  /** Idle sleep between polls, in milliseconds. */
  pollMs?: number;
  /** Lease duration in seconds. */
  leaseSeconds?: number;
  /** Heartbeat interval while a job is processing, in milliseconds. */
  heartbeatMs?: number;
  /** Run `reclaimExpired` before each poll (recover crashed workers). */
  reclaim?: boolean;
  /** Injected job handler. Phase 0 provides no real parser. */
  processor: ParseProcessor;
}

export class ParseWorker {
  private readonly owner: string;
  private readonly concurrency: number;
  private readonly pollMs: number;
  private readonly leaseSeconds: number;
  private readonly heartbeatMs: number;
  private readonly reclaim: boolean;
  private readonly processor: ParseProcessor;

  private running = false;
  private loopPromise: Promise<void> | null = null;
  private startedAt: Date | null = null;

  constructor(options: ParseWorkerOptions) {
    this.owner = options.owner;
    this.concurrency = options.concurrency ?? 2;
    this.pollMs = options.pollMs ?? 2000;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.heartbeatMs = options.heartbeatMs ?? 15000;
    this.reclaim = options.reclaim ?? true;
    this.processor = options.processor;
  }

  /** Begin the poll loop. Idempotent. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = new Date();
    this.loopPromise = this.loop();
  }

  /** Stop leasing and wait for the in-flight batch to settle. */
  async stop(): Promise<void> {
    this.running = false;
    await this.loopPromise;
  }

  state(): { running: boolean; startedAt: Date | null } {
    return { running: this.running, startedAt: this.startedAt };
  }

  /** One poll pass: reclaim, lease a batch, process it. Exposed for tests. */
  async runOnce(): Promise<void> {
    await this.pollOnce();
  }

  /** Process a single already-leased job to completion or failure. Exposed for
   *  tests so they can target one job without contending on the shared queue. */
  async runJob(job: ParseJobRow): Promise<void> {
    const hb = setInterval(() => {
      parseJobService.heartbeat(job.id, this.owner, this.leaseSeconds).catch(() => {
        // Lost the lease (reclaimed/cancelled): the guarded complete/fail below
        // will also no-op, so nothing more to do here.
      });
    }, this.heartbeatMs);
    try {
      try {
        await this.processor(job);
      } catch (err) {
        if (err instanceof ParseCommitError) {
          // Fenced out by the commit: lease reclaimed (another worker owns it
          // now) or the job was cancelled — do nothing, neither fail nor
          // complete. A superseded/deleted-document attempt is terminal and
          // must not be retried or dead-lettered.
          if (err.code === 'LEASE_LOST' || err.code === 'CANCELLED') return;
          await parseJobService
            .failPermanently(job.id, this.owner, err.message, err.code)
            .catch((failErr) => console.error(`[worker ${this.owner}] failPermanently job ${job.id}:`, failErr));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        // A `ParseProcessorError` whose cause is permanent (missing/corrupt/
        // encrypted source file, unsupported format, empty Docling output) is
        // terminal: re-running cannot change the bytes on disk, so retrying
        // would only burn attempts. Route it to `failPermanently` (no retry, no
        // deadletter) instead of the retryable `fail` path.
        if (err instanceof ParseProcessorError && !err.retryable) {
          await parseJobService
            .failPermanently(job.id, this.owner, message, err.code)
            .catch((failErr) => console.error(`[worker ${this.owner}] failPermanently job ${job.id}:`, failErr));
          return;
        }
        // Processor validation failures (e.g. strict embedding) carry a
        // specific, non-sensitive code; everything else stays generic. Both are
        // retryable via the normal `fail` path (deadletter after max_attempts).
        const code = err instanceof ParseProcessorError ? err.code : 'PARSE_WORKER_ERROR';
        await parseJobService
          .fail(job.id, this.owner, message, code)
          .catch((failErr) => console.error(`[worker ${this.owner}] fail job ${job.id}:`, failErr));
        return;
      }
      await parseJobService.complete(job.id, this.owner);
    } finally {
      clearInterval(hb);
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      await this.pollOnce();
      if (!this.running) break;
      await sleep(this.pollMs);
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      if (this.reclaim) await parseJobService.reclaimExpired();
      const jobs = await parseJobService.lease(this.owner, this.concurrency, this.leaseSeconds);
      if (jobs.length > 0) await Promise.all(jobs.map((job) => this.runJob(job)));
    } catch (err) {
      console.error(`[worker ${this.owner}] poll error:`, err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
