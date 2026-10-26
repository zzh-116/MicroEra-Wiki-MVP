// Parse job repository (P2-04) — durable queue storage: parse_jobs with worker
// lease + checkpoint, and parse_deadletters for jobs that exhaust their retries.
import { BaseRepository, DbClient } from './base.js';
import { parseJobs, parseDeadletters } from '../db/schema.js';
import { eq, asc, and, count, sql, lt, isNotNull, inArray } from 'drizzle-orm';

export type ParseJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ParseJobRow {
  id: string;
  type: string;
  document_id: number | null;
  kb_id: number | null;
  status: ParseJobStatus;
  attempt: number;
  max_attempts: number;
  stage: string | null;
  progress: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  lease_version: number;
  checkpoint: Record<string, unknown>;
  error: string | null;
  error_code: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface DeadletterRow {
  id: string;
  job_id: string;
  document_id: number | null;
  error: string | null;
  error_code: string | null;
  attempts: number;
  payload: Record<string, unknown>;
  created_at: string;
  replayed_at: string | null;
}

export interface CreateJobInput {
  id: string;
  type?: string;
  document_id?: number | null;
  kb_id?: number | null;
  max_attempts?: number;
  payload?: Record<string, unknown>;
}

export interface JobUpdate {
  status?: ParseJobStatus;
  attempt?: number;
  stage?: string | null;
  progress?: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  checkpoint?: Record<string, unknown>;
  error?: string | null;
  errorCode?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

function jobToRow(r: typeof parseJobs.$inferSelect): ParseJobRow {
  return {
    id: r.id,
    type: r.type,
    document_id: r.documentId,
    kb_id: r.kbId,
    status: r.status,
    attempt: r.attempt,
    max_attempts: r.maxAttempts,
    stage: r.stage,
    progress: r.progress,
    lease_owner: r.leaseOwner,
    lease_expires_at: r.leaseExpiresAt ? r.leaseExpiresAt.toISOString() : null,
    lease_version: r.leaseVersion,
    checkpoint: (r.checkpoint ?? {}) as Record<string, unknown>,
    error: r.error,
    error_code: r.errorCode,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    started_at: r.startedAt ? r.startedAt.toISOString() : null,
    finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
  };
}

function deadToRow(r: typeof parseDeadletters.$inferSelect): DeadletterRow {
  return {
    id: r.id,
    job_id: r.jobId,
    document_id: r.documentId,
    error: r.error,
    error_code: r.errorCode,
    attempts: r.attempts,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    created_at: r.createdAt.toISOString(),
    replayed_at: r.replayedAt ? r.replayedAt.toISOString() : null,
  };
}

export class ParseJobRepository extends BaseRepository {
  async createJob(input: CreateJobInput, tx?: DbClient): Promise<ParseJobRow> {
    const client = tx ?? this.db;
    const [row] = await client
      .insert(parseJobs)
      .values({
        id: input.id,
        type: input.type ?? 'parse',
        documentId: input.document_id ?? null,
        kbId: input.kb_id ?? null,
        maxAttempts: input.max_attempts ?? 3,
        payload: input.payload ?? {},
      })
      .returning();
    return jobToRow(row);
  }

  async findById(jobId: string, tx?: DbClient): Promise<ParseJobRow | undefined> {
    const client = tx ?? this.db;
    const rows = await client.select().from(parseJobs).where(eq(parseJobs.id, jobId)).limit(1);
    return rows[0] ? jobToRow(rows[0]) : undefined;
  }

  async update(jobId: string, fields: JobUpdate, tx?: DbClient): Promise<ParseJobRow | undefined> {
    const client = tx ?? this.db;
    const [row] = await client
      .update(parseJobs)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(parseJobs.id, jobId))
      .returning();
    return row ? jobToRow(row) : undefined;
  }

  /** Atomically claim a pending job for a worker (compare-and-set on status). */
  async claim(jobId: string, owner: string, leaseSeconds: number, tx?: DbClient): Promise<ParseJobRow | undefined> {
    const client = tx ?? this.db;
    const expires = new Date(Date.now() + leaseSeconds * 1000);
    const [row] = await client
      .update(parseJobs)
      .set({
        status: 'running',
        leaseOwner: owner,
        leaseExpiresAt: expires,
        startedAt: new Date(),
        leaseVersion: sql`${parseJobs.leaseVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(parseJobs.id, jobId), eq(parseJobs.status, 'pending')))
      .returning();
    return row ? jobToRow(row) : undefined;
  }

  /**
   * Fencing write: update a job only while it is still running under the same
   * owner AND lease_version. A worker whose lease was reclaimed (version bumped)
   * or cancelled (status changed) matches 0 rows, so its write is a no-op and
   * the caller detects lost ownership. This closes the read-then-update TOCTOU.
   */
  async guardedUpdate(
    jobId: string,
    owner: string,
    leaseVersion: number,
    fields: JobUpdate,
    tx?: DbClient,
  ): Promise<ParseJobRow | undefined> {
    const client = tx ?? this.db;
    const [row] = await client
      .update(parseJobs)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(
        eq(parseJobs.id, jobId),
        eq(parseJobs.leaseOwner, owner),
        eq(parseJobs.leaseVersion, leaseVersion),
        eq(parseJobs.status, 'running'),
      ))
      .returning();
    return row ? jobToRow(row) : undefined;
  }

  /** Release a job's lease so another worker can pick it up after expiry. */
  async releaseLease(jobId: string, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client
      .update(parseJobs)
      .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
      .where(eq(parseJobs.id, jobId));
  }

  /**
   * Cancel a job only while it is still pending/running. The status guard closes
   * the read-then-write race where a worker concurrently completes the job: a
   * terminal (succeeded/failed) row no longer matches, so `undefined` is
   * returned and the caller never overwrites a terminal state with 'cancelled'.
   */
  async cancel(jobId: string, tx?: DbClient): Promise<ParseJobRow | undefined> {
    const client = tx ?? this.db;
    const [row] = await client
      .update(parseJobs)
      .set({
        status: 'cancelled',
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(parseJobs.id, jobId),
        inArray(parseJobs.status, ['pending', 'running']),
      ))
      .returning();
    return row ? jobToRow(row) : undefined;
  }

  /**
   * Reclaim running jobs whose lease has expired (crashed worker). Each
   * reclaimed job returns to pending and its lease_version is bumped, which
   * invalidates any in-flight write the dead worker still holds.
   */
  async reclaimExpired(now: Date, tx?: DbClient): Promise<ParseJobRow[]> {
    const client = tx ?? this.db;
    const rows = await client
      .update(parseJobs)
      .set({
        status: 'pending',
        leaseOwner: null,
        leaseExpiresAt: null,
        stage: null,
        leaseVersion: sql`${parseJobs.leaseVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(parseJobs.status, 'running'),
        isNotNull(parseJobs.leaseExpiresAt),
        lt(parseJobs.leaseExpiresAt, now),
      ))
      .returning();
    return rows.map(jobToRow);
  }

  async listPending(limit = 10, tx?: DbClient): Promise<ParseJobRow[]> {
    const client = tx ?? this.db;
    const rows = await client
      .select()
      .from(parseJobs)
      .where(eq(parseJobs.status, 'pending'))
      .orderBy(asc(parseJobs.createdAt))
      .limit(limit);
    return rows.map(jobToRow);
  }

  async listByDocument(documentId: number, tx?: DbClient): Promise<ParseJobRow[]> {
    const client = tx ?? this.db;
    const rows = await client
      .select()
      .from(parseJobs)
      .where(eq(parseJobs.documentId, documentId))
      .orderBy(asc(parseJobs.createdAt));
    return rows.map(jobToRow);
  }

  // ── Deadletters ────────────────────────────────────────────────────────
  async deadletter(input: {
    id: string;
    job_id: string;
    document_id?: number | null;
    error?: string | null;
    error_code?: string | null;
    attempts?: number;
    payload?: Record<string, unknown>;
  }, tx?: DbClient): Promise<DeadletterRow> {
    const client = tx ?? this.db;
    const [row] = await client
      .insert(parseDeadletters)
      .values({
        id: input.id,
        jobId: input.job_id,
        documentId: input.document_id ?? null,
        error: input.error ?? null,
        errorCode: input.error_code ?? null,
        attempts: input.attempts ?? 0,
        payload: input.payload ?? {},
      })
      .returning();
    return deadToRow(row);
  }

  async findDeadletter(id: string, tx?: DbClient): Promise<DeadletterRow | undefined> {
    const client = tx ?? this.db;
    const rows = await client.select().from(parseDeadletters).where(eq(parseDeadletters.id, id)).limit(1);
    return rows[0] ? deadToRow(rows[0]) : undefined;
  }

  async listDeadletters(tx?: DbClient): Promise<DeadletterRow[]> {
    const client = tx ?? this.db;
    const rows = await client.select().from(parseDeadletters).orderBy(asc(parseDeadletters.createdAt));
    return rows.map(deadToRow);
  }

  async countDeadletters(tx?: DbClient): Promise<number> {
    const client = tx ?? this.db;
    const [{ value }] = await client.select({ value: count() }).from(parseDeadletters);
    return Number(value);
  }

  async markReplayed(id: string, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.update(parseDeadletters).set({ replayedAt: new Date() }).where(eq(parseDeadletters.id, id));
  }
}

export const parseJobRepository = new ParseJobRepository();
