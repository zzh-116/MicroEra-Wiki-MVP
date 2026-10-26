// Phase 0 (2b) — real DB-backed tests of the parse-job fencing + worker
// skeleton against the isolated test database (`microera_wiki_test`), never the
// dev DB. Covers: claim CAS single-claim (multi-worker contention), lease-expiry
// reclaim (crash recovery), old-worker fencing (stale lease_version writes are
// no-ops), cancel releasing the lease, retry resetting attempt, and the worker
// framework (runJob success/failure + graceful start/stop).
//
// Self-provisioning: creates the test DB if missing, applies the additive
// migration chain via the shared advisory-locked helper, and seeds UNIQUE rows
// (no TRUNCATE) so it cannot race `parse-job-db.test.ts` destructively. Jobs are
// targeted by explicit claim/guardedUpdate rather than the shared `lease()` list,
// so the suite never picks up another suite's pending jobs. It skips gracefully
// when Postgres is unreachable.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from '../helpers/assert-test-db.js';
import { applyMigrations } from '../helpers/apply-migrations.js';

const TEST_DB_NAME = 'microera_wiki_test';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5433/postgres';
const TEST_DB_URL = `postgresql://postgres:postgres@localhost:5433/${TEST_DB_NAME}`;
const MIGRATIONS_DIR = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
  'backend',
  'db',
  'migrations',
);

// Async availability probe at collection time → graceful skip without a DB.
let dbAvailable = false;
try {
  const probe = new pg.Pool({ connectionString: ADMIN_URL });
  await probe.query('SELECT 1');
  await probe.end();
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

describe.skipIf(!dbAvailable)('Phase 0 — parse-job fencing + worker skeleton (isolated test DB)', () => {
  let parseJobService: typeof import('../../backend/services/parse-job.service.js')['parseJobService'];
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let jobService: typeof import('../../backend/services/job.service.js')['jobService'];
  let ParseWorker: typeof import('../../backend/services/parse-worker.service.js')['ParseWorker'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  let db: typeof import('../../backend/db/connection.js')['db'];
  const envSnapshot: Record<string, string | undefined> = {};

  const createdJobIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = `worker-pw-${suffix}`;

  async function track(jobId: string): Promise<string> {
    createdJobIds.push(jobId);
    return jobId;
  }

  async function enqueue(extra: { max_attempts?: number } = {}): Promise<string> {
    const job = await parseJobService.enqueue({
      type: 'parse',
      max_attempts: extra.max_attempts ?? 3,
      payload: { test: suffix },
    });
    return track(job.job_id);
  }

  /** Simulate the queue reclaiming THIS job's expired lease (version bump + back
   *  to pending), scoped to one job id. Mirrors `ParseJobRepository.reclaimExpired`
   *  but does NOT sweep the whole shared `parse_jobs` table, so a concurrent suite
   *  that just expired its own job can never be reclaimed (or stolen) by us. */
  async function reclaimJob(jobId: string): Promise<void> {
    await pool.query(
      `UPDATE parse_jobs
          SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL,
              stage = NULL, lease_version = lease_version + 1, updated_at = now()
        WHERE id = $1 AND status = 'running'`,
      [jobId],
    );
  }

  beforeAll(async () => {
    envSnapshot.DATABASE_URL = process.env.DATABASE_URL;

    // 1. Create the isolated test DB if it does not exist yet.
    const admin = new pg.Pool({ connectionString: ADMIN_URL });
    try {
      const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
      if (rows.length === 0) await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    } finally {
      await admin.end();
    }

    // 2. Apply migrations to the test DB (serialized via advisory lock).
    const testPool = new pg.Pool({ connectionString: TEST_DB_URL });
    await assertTestDatabase(testPool, TEST_DB_NAME);
    await applyMigrations(TEST_DB_URL, MIGRATIONS_DIR);
    await testPool.end();

    // 3. Re-point the real singletons at the test DB and load them fresh.
    process.env.DATABASE_URL = TEST_DB_URL;
    vi.resetModules();
    ({ parseJobService } = await import('../../backend/services/parse-job.service.js'));
    ({ parseJobRepository } = await import('../../backend/repositories/parse-job.repository.js'));
    ({ jobService } = await import('../../backend/services/job.service.js'));
    ({ ParseWorker } = await import('../../backend/services/parse-worker.service.js'));
    ({ pool, db } = await import('../../backend/db/connection.js'));
    await assertTestDatabase(pool, TEST_DB_NAME);
  }, 60000);

  afterAll(async () => {
    if (pool && createdJobIds.length > 0) {
      try {
        await pool.query('DELETE FROM parse_deadletters WHERE job_id = ANY($1::text[])', [createdJobIds]);
        await pool.query('DELETE FROM parse_jobs WHERE id = ANY($1::text[])', [createdJobIds]);
      } catch {
        /* best-effort cleanup */
      }
    }
    try {
      await pool.end();
    } catch {
      /* pool already closed */
    }
    if (envSnapshot.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
    vi.resetModules();
  });

  // ── Fencing + queue primitives ────────────────────────────────────────
  it('claim is a compare-and-set: only one worker wins a pending job', async () => {
    const jobId = await enqueue();
    const first = await parseJobRepository.claim(jobId, 'w1', 60);
    const second = await parseJobRepository.claim(jobId, 'w2', 60);

    expect(first).toBeDefined();
    expect(first!.status).toBe('running');
    expect(first!.lease_owner).toBe('w1');
    expect(first!.lease_version).toBe(1);
    expect(second).toBeUndefined(); // CAS lost the race
  });

  it('reclaimExpired returns a crashed job to pending and bumps lease_version', async () => {
    const jobId = await enqueue();
    await parseJobRepository.claim(jobId, 'w1', 60);

    // Simulate the worker dying without heartbeat: expire the lease.
    await pool.query(`UPDATE parse_jobs SET lease_expires_at = now() - interval '5 seconds' WHERE id = $1`, [jobId]);

    // Run the REAL `reclaimExpired` sweep inside a transaction that is always
    // rolled back. The method's global `UPDATE parse_jobs WHERE status='running'
    // AND lease_expires_at < now` would otherwise sweep the whole shared table
    // and could reclaim a concurrent suite's just-expired job. Rolling back means
    // no other suite's data is ever committed — the assertions below read the
    // in-transaction `.returning()` rows, which are discarded on rollback. This
    // keeps the dedicated global-semantics test while never touching shared data.
    let reclaimed: Awaited<ReturnType<typeof parseJobRepository.reclaimExpired>> = [];
    const ROLLBACK = new Error('__rollback__');
    try {
      await db.transaction(async (tx) => {
        reclaimed = await parseJobRepository.reclaimExpired(new Date(), tx as never);
        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }

    const mine = reclaimed.find((j) => j.id === jobId);
    expect(mine).toBeDefined();
    expect(mine!.status).toBe('pending');
    expect(mine!.lease_owner).toBeNull();
    expect(mine!.lease_version).toBe(2); // bumped → old worker fenced out

    // Prove the isolation: the sweep was rolled back, so the committed row is
    // unchanged (still running at version 1) — the global scan never persisted.
    const committed = await parseJobRepository.findById(jobId);
    expect(committed!.status).toBe('running');
    expect(committed!.lease_version).toBe(1);
  });

  it('an old worker (stale lease_version) cannot write after reclaim', async () => {
    const jobId = await enqueue();
    const claimed = await parseJobRepository.claim(jobId, 'w1', 60);
    const staleVersion = claimed!.lease_version; // 1

    await pool.query(`UPDATE parse_jobs SET lease_expires_at = now() - interval '5 seconds' WHERE id = $1`, [jobId]);
    await reclaimJob(jobId);

    // The dead worker still holds version 1; its guarded write must no-op.
    const result = await parseJobRepository.guardedUpdate(jobId, 'w1', staleVersion, {
      status: 'succeeded',
      progress: 100,
      stage: 'done',
      finishedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(result).toBeUndefined();

    const after = await parseJobRepository.findById(jobId);
    expect(after!.status).toBe('pending');

    // A new worker can now pick it up and finish.
    const reClaimed = await parseJobRepository.claim(jobId, 'w2', 60);
    expect(reClaimed!.lease_version).toBe(3);
    const done = await parseJobService.complete(jobId, 'w2');
    expect(done.status).toBe('succeeded');
  });

  it('an old worker recovering after reclaim cannot complete/fail via the service', async () => {
    const jobId = await enqueue();
    await parseJobRepository.claim(jobId, 'w1', 60);

    await pool.query(`UPDATE parse_jobs SET lease_expires_at = now() - interval '5 seconds' WHERE id = $1`, [jobId]);
    await reclaimJob(jobId);

    // The dead worker wakes up and tries to finalise via the service layer: its
    // owner token no longer matches (job is back to pending under no owner), so
    // both complete and fail must throw conflict and leave the job pending.
    await expect(parseJobService.complete(jobId, 'w1')).rejects.toMatchObject({ kind: 'conflict' });
    await expect(parseJobService.fail(jobId, 'w1', 'late failure', 'E')).rejects.toMatchObject({ kind: 'conflict' });

    const after = await parseJobRepository.findById(jobId);
    expect(after!.status).toBe('pending');
    expect(after!.lease_owner).toBeNull();
  });

  it('cancel no-ops (returns undefined) on an already-terminal job', async () => {
    const jobId = await enqueue();
    await parseJobRepository.claim(jobId, 'w1', 60);
    await parseJobService.complete(jobId, 'w1'); // → succeeded

    const result = await parseJobRepository.cancel(jobId);
    expect(result).toBeUndefined(); // terminal state is never overwritten

    const after = await parseJobRepository.findById(jobId);
    expect(after!.status).toBe('succeeded');
  });

  it('parseJobService.cancel cancels a running job and releases its lease', async () => {
    const jobId = await enqueue();
    await parseJobRepository.claim(jobId, owner, 60);

    const cancelled = await parseJobService.cancel(jobId);
    expect(cancelled.status).toBe('cancelled');

    const after = await parseJobRepository.findById(jobId);
    expect(after!.lease_owner).toBeNull();
    expect(after!.lease_expires_at).toBeNull();

    // The (now-cancelled) worker's guarded write must no-op.
    const result = await parseJobRepository.guardedUpdate(jobId, owner, 1, { status: 'succeeded' });
    expect(result).toBeUndefined();
  });

  it('jobService.cancel also releases the lease (D4 fix)', async () => {
    const jobId = await enqueue();
    await parseJobRepository.claim(jobId, owner, 60);

    const status = await jobService.cancel(jobId);
    expect(status.status).toBe('cancelled');

    const after = await parseJobRepository.findById(jobId);
    expect(after!.lease_owner).toBeNull();
  });

  it('retry resets attempt back to 0 (D3 fix)', async () => {
    const jobId = await enqueue({ max_attempts: 1 });
    await parseJobRepository.claim(jobId, owner, 60);
    const failed = await parseJobService.fail(jobId, owner, 'boom', 'PARSE_ERR');
    expect(failed.deadlettered).toBe(true);

    const before = await parseJobRepository.findById(jobId);
    expect(before!.attempt).toBe(1);

    const retried = await parseJobService.retry(jobId);
    expect(retried.status).toBe('pending');

    const after = await parseJobRepository.findById(jobId);
    expect(after!.attempt).toBe(0);
  });

  // ── Worker framework (runJob + graceful start/stop) ───────────────────
  it('worker runJob completes a leased job via an injected no-op processor', async () => {
    const jobId = await enqueue();
    const claimed = await parseJobRepository.claim(jobId, owner, 60);
    const processed: string[] = [];

    const worker = new ParseWorker({
      owner,
      heartbeatMs: 60000,
      processor: async (job) => {
        processed.push(job.id);
        expect(job.status).toBe('running');
      },
    });

    await worker.runJob(claimed!);

    expect(processed).toEqual([jobId]);
    const after = await parseJobRepository.findById(jobId);
    expect(after!.status).toBe('succeeded');
  });

  it('worker runJob fails and deadletters a job whose processor throws', async () => {
    const jobId = await enqueue({ max_attempts: 1 });
    const claimed = await parseJobRepository.claim(jobId, owner, 60);

    const worker = new ParseWorker({
      owner,
      heartbeatMs: 60000,
      processor: async () => {
        throw new Error('parser not wired');
      },
    });

    await worker.runJob(claimed!);

    const after = await parseJobRepository.findById(jobId);
    expect(after!.status).toBe('failed');
    const dls = await parseJobService.deadletters();
    expect(dls.items.some((d) => d.job_id === jobId)).toBe(true);
  });

  it('worker start/stop is graceful and touches no jobs (concurrency 0)', async () => {
    const worker = new ParseWorker({
      owner,
      concurrency: 0,
      reclaim: false,
      processor: async () => {
        throw new Error('must not be called');
      },
    });

    await worker.start();
    expect(worker.state().running).toBe(true);
    await worker.stop();
    expect(worker.state().running).toBe(false);
  });
});
