// Batch B (F5) — real DB-backed test of the parse-job worker lifecycle.
//
// The parse-job queue (enqueue/lease/heartbeat/checkpoint/complete/fail/deadletter)
// was previously covered only by mocked unit tests (`tests/parity/parse-job.test.ts`).
// This suite runs the REAL `ParseJobService` against a dedicated, isolated test
// database (`microera_wiki_test`), never the dev DB. It is fully self-provisioning:
//   - creates the test DB if missing (via the `postgres` maintenance DB),
//   - applies the additive migration chain (mirrors `runMigrations()` in app.ts),
//   - seeds UNIQUE rows and targeted-cleans them (NO TRUNCATE) so it cannot
//     wipe another suite's in-flight jobs, and claims jobs by explicit id rather
//     than the global `lease()` list, so it never picks up another suite's
//     pending jobs (the same isolation pattern as `parse-worker.test.ts`),
//   - re-points the real singletons at the test DB via `DATABASE_URL` + a fresh
//     module graph, then runs the lifecycle end-to-end.
// If Postgres is unreachable the whole suite skips (no hard failure on a fresh
// checkout without a database).
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

describe.skipIf(!dbAvailable)('F5 — parse-job worker lifecycle (isolated test DB)', () => {
  let parseJobService: typeof import('../../backend/services/parse-job.service.js')['parseJobService'];
  let parseJobRepository: typeof import('../../backend/repositories/parse-job.repository.js')['parseJobRepository'];
  let pool: typeof import('../../backend/db/connection.js')['pool'];
  const envSnapshot: Record<string, string | undefined> = {};
  const createdJobIds: string[] = [];

  function track(jobId: string): void {
    createdJobIds.push(jobId);
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

    // 2. Apply migrations to the test DB (additive; mirrors app.ts runMigrations),
    //    serialized across concurrent suites via a Postgres advisory lock.
    const testPool = new pg.Pool({ connectionString: TEST_DB_URL });
    await assertTestDatabase(testPool, TEST_DB_NAME);
    await applyMigrations(TEST_DB_URL, MIGRATIONS_DIR);
    await testPool.end();

    // 3. Re-point the real singletons at the test DB and load them fresh.
    process.env.DATABASE_URL = TEST_DB_URL;
    vi.resetModules();
    ({ parseJobService } = await import('../../backend/services/parse-job.service.js'));
    ({ parseJobRepository } = await import('../../backend/repositories/parse-job.repository.js'));
    ({ pool } = await import('../../backend/db/connection.js'));
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

  it('enqueue → claim → heartbeat → checkpoint → complete transitions to succeeded', async () => {
    const enq = await parseJobService.enqueue({ type: 'parse' });
    track(enq.job_id);
    expect(enq.status).toBe('pending');
    expect(enq.job_id).toMatch(/^parse_/);

    // Precise claim by id (not the global `lease()` list) so a concurrent suite's
    // pending jobs can never crowd this one out or be stolen by this worker.
    const mine = await parseJobRepository.claim(enq.job_id, 'worker-a', 60);
    expect(mine).toBeDefined();
    expect(mine!.status).toBe('running');
    expect(mine!.lease_owner).toBe('worker-a');

    const hb = await parseJobService.heartbeat(enq.job_id, 'worker-a', 60);
    expect(hb.status).toBe('running');

    const cp = await parseJobService.checkpoint(enq.job_id, 'worker-a', { stage: 'chunked', done: 40 });
    expect(cp.status).toBe('running');

    const done = await parseJobService.complete(enq.job_id, 'worker-a');
    expect(done.status).toBe('succeeded');
    expect(done.progress).toBe(100);

    const final = await parseJobService.status(enq.job_id);
    expect(final.status).toBe('succeeded');
    expect(final.finished_at).not.toBeNull();
  });

  it('fail requeues below max_attempts, then deadletters when exhausted', async () => {
    const enq = await parseJobService.enqueue({ type: 'parse', max_attempts: 2 });
    track(enq.job_id);

    // Attempt 1 (attempt 0→1 < 2) → requeue back to pending, no deadletter.
    await parseJobRepository.claim(enq.job_id, 'worker-b', 60);
    const f1 = await parseJobService.fail(enq.job_id, 'worker-b', 'boom', 'PARSE_ERR');
    expect(f1.status).toBe('pending');
    expect(f1.attempt).toBe(1);
    expect(f1.deadlettered).toBe(false);

    // Attempt 2 (attempt 1→2 >= 2) → deadlettered.
    await parseJobRepository.claim(enq.job_id, 'worker-b', 60);
    const f2 = await parseJobService.fail(enq.job_id, 'worker-b', 'boom again', 'PARSE_ERR');
    expect(f2.deadlettered).toBe(true);

    const dls = await parseJobService.deadletters();
    expect(dls.items.some((d) => d.job_id === enq.job_id)).toBe(true);
  });

  it('replay_deadletter requeues the original job back to pending', async () => {
    const enq = await parseJobService.enqueue({ type: 'parse', max_attempts: 1 });
    track(enq.job_id);
    await parseJobRepository.claim(enq.job_id, 'worker-c', 60);
    await parseJobService.fail(enq.job_id, 'worker-c', 'fatal', 'FATAL');

    const dls = await parseJobService.deadletters();
    const dl = dls.items.find((d) => d.job_id === enq.job_id);
    expect(dl).toBeDefined();

    const replayed = await parseJobService.replayDeadletter(dl!.id);
    expect(replayed.status).toBe('pending');
    expect(replayed.job_id).toBe(enq.job_id);
  });
});
