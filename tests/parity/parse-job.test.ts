// P2-04 — Durable queue: parse_jobs with worker lease + checkpoint, and
// parse_deadletters for retry exhaustion. Covers the worker primitives
// (enqueue/lease/heartbeat/checkpoint/complete/fail) and the job.* operations
// (parse_status/parse_retry/parse_cancel/deadletters/replay_deadletter).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
  releaseLease: vi.fn(),
  listPending: vi.fn(),
  listByDocument: vi.fn(),
  deadletter: vi.fn(),
  findDeadletter: vi.fn(),
  listDeadletters: vi.fn(),
  countDeadletters: vi.fn(),
  markReplayed: vi.fn(),
}));

vi.mock('../../backend/repositories/parse-job.repository.js', () => ({
  parseJobRepository: {
    createJob: mocks.createJob,
    findById: mocks.findById,
    update: mocks.update,
    claim: mocks.claim,
    releaseLease: mocks.releaseLease,
    listPending: mocks.listPending,
    listByDocument: mocks.listByDocument,
    deadletter: mocks.deadletter,
    findDeadletter: mocks.findDeadletter,
    listDeadletters: mocks.listDeadletters,
    countDeadletters: mocks.countDeadletters,
    markReplayed: mocks.markReplayed,
  },
}));
// knowledge.service re-exports ServiceError but also imports the knowledge repo;
// mock it so the service import stays free of the DB connection.
vi.mock('../../backend/repositories/knowledge.repository.js', () => ({
  knowledgeRepository: {},
}));

const { parseJobService } = await import('../../backend/services/parse-job.service.js');

function job(over: Record<string, unknown> = {}) {
  return {
    id: 'parse_x',
    type: 'parse',
    document_id: 7,
    kb_id: 1,
    status: 'pending',
    attempt: 0,
    max_attempts: 3,
    stage: null,
    progress: 0,
    lease_owner: null,
    lease_expires_at: null,
    checkpoint: {},
    error: null,
    error_code: null,
    payload: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    started_at: null,
    finished_at: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P2-04 durable queue — worker primitives', () => {
  it('enqueue creates a pending job', async () => {
    mocks.createJob.mockResolvedValue(job());
    const result = await parseJobService.enqueue({ document_id: 7 });
    expect(result.job_id).toBe('parse_x');
    expect(result.status).toBe('pending');
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({ document_id: 7 }));
  });

  it('lease claims pending jobs for a worker', async () => {
    mocks.listPending.mockResolvedValue([job({ id: 'a' }), job({ id: 'b' })]);
    mocks.claim.mockResolvedValueOnce(job({ id: 'a', status: 'running', lease_owner: 'w1' }));
    mocks.claim.mockResolvedValueOnce(undefined); // lost a race
    const leased = await parseJobService.lease('w1', 5);
    expect(leased).toHaveLength(1);
    expect(leased[0].id).toBe('a');
    expect(mocks.claim).toHaveBeenCalledTimes(2);
  });

  it('heartbeat renews a lease held by the owner', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', lease_owner: 'w1' }));
    mocks.update.mockResolvedValue(job({ status: 'running', lease_owner: 'w1' }));
    const result = await parseJobService.heartbeat('parse_x', 'w1');
    expect(result.status).toBe('running');
    expect(mocks.update).toHaveBeenCalledWith('parse_x', expect.objectContaining({ leaseExpiresAt: expect.any(Date) }));
  });

  it('heartbeat rejects a job not leased by the owner', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', lease_owner: 'w2' }));
    await expect(parseJobService.heartbeat('parse_x', 'w1')).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('checkpoint persists resumable state', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', lease_owner: 'w1' }));
    mocks.update.mockResolvedValue(job({ status: 'running', lease_owner: 'w1', checkpoint: { parsed: 12 } }));
    const result = await parseJobService.checkpoint('parse_x', 'w1', { parsed: 12 });
    expect(result).toEqual(expect.objectContaining({ job_id: 'parse_x', status: 'running' }));
    expect(mocks.update).toHaveBeenCalledWith('parse_x', { checkpoint: { parsed: 12 } });
  });

  it('complete marks a job succeeded', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', lease_owner: 'w1' }));
    mocks.update.mockResolvedValue(job({ status: 'succeeded', progress: 100, stage: 'done' }));
    const result = await parseJobService.complete('parse_x', 'w1');
    expect(result.status).toBe('succeeded');
    expect(result.progress).toBe(100);
  });

  it('fail below max_attempts requeues (no deadletter)', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', lease_owner: 'w1', attempt: 0 }));
    mocks.update.mockResolvedValue(job({ status: 'pending', attempt: 1, error: 'boom' }));
    const result = await parseJobService.fail('parse_x', 'w1', 'boom', 'E');
    expect(result.deadlettered).toBe(false);
    expect(result.attempt).toBe(1);
    expect(mocks.deadletter).not.toHaveBeenCalled();
    expect(mocks.releaseLease).toHaveBeenCalledWith('parse_x');
  });

  it('fail at max_attempts moves the job to the deadletter table', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', lease_owner: 'w1', attempt: 2 }));
    mocks.update.mockResolvedValue(job({ status: 'failed', attempt: 3, error: 'boom' }));
    mocks.deadletter.mockResolvedValue({ id: 'dl_1', job_id: 'parse_x' });
    const result = await parseJobService.fail('parse_x', 'w1', 'boom', 'E');
    expect(result.deadlettered).toBe(true);
    expect(result.attempt).toBe(3);
    expect(mocks.deadletter).toHaveBeenCalledWith(expect.objectContaining({ job_id: 'parse_x', error: 'boom', attempts: 3 }));
  });
});

describe('P2-04 durable queue — job.* operations', () => {
  it('parse_status returns a job status view', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'running', stage: 'chunk', progress: 40 }));
    const result = await parseJobService.status('parse_x');
    expect(result.job_id).toBe('parse_x');
    expect(result.stage).toBe('chunk');
    expect(result.progress).toBe(40);
  });

  it('parse_status throws resource_not_found for an unknown job', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(parseJobService.status('nope')).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('parse_retry requeues a failed job and clears the error', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'failed', attempt: 3, error: 'boom' }));
    mocks.update.mockResolvedValue(job({ status: 'pending', attempt: 3, error: null }));
    const result = await parseJobService.retry('parse_x');
    expect(result.status).toBe('pending');
    expect(mocks.update).toHaveBeenCalledWith('parse_x', expect.objectContaining({ status: 'pending', error: null }));
  });

  it('parse_retry rejects a succeeded job', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'succeeded' }));
    await expect(parseJobService.retry('parse_x')).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('parse_cancel cancels a pending job', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'pending' }));
    mocks.update.mockResolvedValue(job({ status: 'cancelled' }));
    const result = await parseJobService.cancel('parse_x');
    expect(result.status).toBe('cancelled');
  });

  it('parse_cancel rejects a succeeded job', async () => {
    mocks.findById.mockResolvedValue(job({ status: 'succeeded' }));
    await expect(parseJobService.cancel('parse_x')).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('deadletters lists dead-lettered jobs with a total', async () => {
    mocks.listDeadletters.mockResolvedValue([{ id: 'dl_1', job_id: 'parse_x', document_id: 7, error: 'boom', error_code: 'E', attempts: 3, payload: {}, created_at: 'x', replayed_at: null }]);
    const result = await parseJobService.deadletters();
    expect(result.total).toBe(1);
    expect(result.items[0].job_id).toBe('parse_x');
  });

  it('replay_deadletter resets the original job and marks it replayed', async () => {
    mocks.findDeadletter.mockResolvedValue({ id: 'dl_1', job_id: 'parse_x', document_id: 7, error: 'boom', error_code: 'E', attempts: 3, payload: {}, created_at: 'x', replayed_at: null });
    mocks.findById.mockResolvedValueOnce(job({ id: 'parse_x', status: 'failed' }));
    mocks.findById.mockResolvedValue(job({ id: 'parse_x', status: 'pending' }));
    mocks.update.mockResolvedValue(job({ id: 'parse_x', status: 'pending' }));
    const result = await parseJobService.replayDeadletter('dl_1');
    expect(result.status).toBe('pending');
    expect(mocks.markReplayed).toHaveBeenCalledWith('dl_1');
  });

  it('replay_deadletter rejects an already-replayed deadletter', async () => {
    mocks.findDeadletter.mockResolvedValue({ id: 'dl_1', job_id: 'parse_x', replayed_at: 'x' });
    await expect(parseJobService.replayDeadletter('dl_1')).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('replay_deadletter throws resource_not_found for an unknown deadletter', async () => {
    mocks.findDeadletter.mockResolvedValue(undefined);
    await expect(parseJobService.replayDeadletter('nope')).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
