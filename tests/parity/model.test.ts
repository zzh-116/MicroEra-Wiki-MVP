// P8 — model registry (M01/M03) + generic job dashboard (O01).
// Unit tests over the model service and job service with repositories and
// providers mocked for determinism.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { modelService } from '../../backend/services/model.service.js';
import { modelRepository } from '../../backend/repositories/model.repository.js';
import { jobService } from '../../backend/services/job.service.js';
import { parseJobService } from '../../backend/services/parse-job.service.js';
import { parseJobRepository } from '../../backend/repositories/parse-job.repository.js';
import { knowledgeRepository } from '../../backend/repositories/knowledge.repository.js';

function model(over: Record<string, unknown> = {}): any {
  return {
    id: 1,
    name: 'Local LLM',
    kind: 'llm',
    provider: 'ollama',
    model_name: 'qwen2.5:7b',
    base_url: null,
    config: {},
    is_default: false,
    status: 'active',
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...over,
  };
}

function job(over: Record<string, unknown> = {}): any {
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

function statusView(over: Record<string, unknown> = {}): any {
  return {
    job_id: 'parse_x',
    status: 'pending',
    type: 'parse',
    document_id: 7,
    attempt: 0,
    max_attempts: 3,
    stage: null,
    progress: 0,
    error: null,
    error_code: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    started_at: null,
    finished_at: null,
    ...over,
  };
}

describe('P8 model registry — M01 (list/view/create/update/delete/test/set_default)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('list returns items and total', async () => {
    vi.spyOn(modelRepository, 'listModels').mockResolvedValue({ items: [model()], total: 1 });
    const r: any = await modelService.list({});
    expect(r.total).toBe(1);
    expect(r.items[0].name).toBe('Local LLM');
  });

  it('view returns the stored model', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model());
    const m: any = await modelService.view(1);
    expect(m.id).toBe(1);
    expect(m.name).toBe('Local LLM');
    expect(m.kind).toBe('llm');
  });

  it('view throws resource_not_found when missing', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(undefined);
    await expect(modelService.view(99)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('create rejects an empty name', async () => {
    await expect(modelService.create({ kind: 'llm', model_name: 'm' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('create rejects an unknown kind', async () => {
    await expect(modelService.create({ name: 'x', kind: 'nope', model_name: 'm' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('create rejects an empty model_name', async () => {
    await expect(modelService.create({ name: 'x', kind: 'llm', model_name: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('create persists a model and returns the stored row', async () => {
    const create = vi.spyOn(modelRepository, 'createModel').mockResolvedValue(model());
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model());
    const m: any = await modelService.create({ name: 'Local LLM', kind: 'llm', model_name: 'qwen2.5:7b' });
    expect(m.name).toBe('Local LLM');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'llm', modelName: 'qwen2.5:7b' }));
  });

  it('update delegates to the repository', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model());
    const upd = vi.spyOn(modelRepository, 'updateModel').mockResolvedValue(model({ name: 'Renamed' }));
    const m: any = await modelService.update(1, { name: 'Renamed' });
    expect(m.name).toBe('Renamed');
    expect(upd).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Renamed' }));
  });

  it('remove soft-deletes the model', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model());
    const del = vi.spyOn(modelRepository, 'softDeleteModel').mockResolvedValue(true);
    const r: any = await modelService.remove(1);
    expect(r.deleted).toBe(true);
    expect(del).toHaveBeenCalledWith(1);
  });

  it('set_default returns the defaulted model', async () => {
    vi.spyOn(modelRepository, 'setDefault').mockResolvedValue(model({ is_default: true }));
    const m: any = await modelService.setDefault(1);
    expect(m.is_default).toBe(true);
  });

  it('set_default throws resource_not_found when missing', async () => {
    vi.spyOn(modelRepository, 'setDefault').mockResolvedValue(undefined);
    await expect(modelService.setDefault(99)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('test reports reachability for an llm model without throwing', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'llm' }));
    // No reachable LLM in unit tests — the probe fails gracefully.
    const r: any = await modelService.test(1);
    expect(r.model_id).toBe(1);
    expect(typeof r.reachable).toBe('boolean');
    expect(typeof r.latency_ms).toBe('number');
  });
});

describe('P8 model registry — M03 (rerank_list/rerank_test)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('rerank_list returns providers and registered rerank models', async () => {
    vi.spyOn(modelRepository, 'listByKind').mockResolvedValue([model({ id: 2, kind: 'rerank', name: 'Reranker' })]);
    const r: any = await modelService.rerankList();
    expect(r.providers.length).toBeGreaterThan(0);
    expect(r.models.length).toBe(1);
    expect(r.total).toBe(1);
  });

  it('rerank_test rejects an empty query', async () => {
    await expect(modelService.rerankTest({ query: '  ', documents: [{ text: 'a' }] })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('rerank_test rejects empty documents', async () => {
    await expect(modelService.rerankTest({ query: 'q', documents: [] })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});

describe('P8 job dashboard — O01 (wait/cancel/retry/events/artifacts)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('wait returns finished when the job is already terminal', async () => {
    vi.spyOn(parseJobService, 'status').mockResolvedValue(statusView({ status: 'succeeded', progress: 100 }));
    const r: any = await jobService.wait({ job_id: 'parse_x', timeout_ms: 500 });
    expect(r.finished).toBe(true);
    expect(r.timed_out).toBe(false);
    expect(r.status).toBe('succeeded');
  });

  it('wait times out on a permanently pending job', async () => {
    vi.spyOn(parseJobService, 'status').mockResolvedValue(statusView({ status: 'pending' }));
    const r: any = await jobService.wait({ job_id: 'parse_x', timeout_ms: 150, interval_ms: 50 });
    expect(r.finished).toBe(false);
    expect(r.timed_out).toBe(true);
  });

  it('cancel cancels a pending job', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(job({ status: 'pending' }));
    const upd = vi.spyOn(parseJobRepository, 'update').mockResolvedValue(job({ status: 'cancelled' }));
    vi.spyOn(parseJobService, 'status').mockResolvedValue(statusView({ status: 'cancelled' }));
    const r: any = await jobService.cancel('parse_x');
    expect(r.status).toBe('cancelled');
    expect(upd).toHaveBeenCalledWith('parse_x', expect.objectContaining({ status: 'cancelled' }));
  });

  it('cancel rejects a terminal job', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(job({ status: 'succeeded' }));
    await expect(jobService.cancel('parse_x')).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('retry rejects a succeeded job', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(job({ status: 'succeeded' }));
    await expect(jobService.retry('parse_x')).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('retry requeues a cancelled job', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(job({ status: 'cancelled' }));
    const upd = vi.spyOn(parseJobRepository, 'update').mockResolvedValue(job({ status: 'pending' }));
    vi.spyOn(parseJobService, 'status').mockResolvedValue(statusView({ status: 'pending' }));
    const r: any = await jobService.retry('parse_x');
    expect(r.status).toBe('pending');
    expect(upd).toHaveBeenCalledWith('parse_x', expect.objectContaining({ status: 'pending' }));
  });

  it('events derives a lifecycle timeline for a finished job', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(
      job({ status: 'succeeded', started_at: '2026-01-01T00:00:01.000Z', finished_at: '2026-01-01T00:00:02.000Z' }),
    );
    const r: any = await jobService.events('parse_x');
    expect(r.total).toBe(3);
    expect(r.items.map((e: any) => e.type)).toEqual(['enqueued', 'started', 'succeeded']);
  });

  it('artifacts returns the produced document', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(job({ document_id: 7 }));
    vi.spyOn(knowledgeRepository, 'findDocumentById').mockResolvedValue({ id: 7, kb_id: 1, title: 'Paper', parse_status: 'ready' } as any);
    const r: any = await jobService.artifacts('parse_x');
    expect(r.total).toBe(1);
    expect(r.items[0].kind).toBe('document');
    expect(r.items[0].name).toBe('Paper');
  });

  it('artifacts returns empty when the job has no document', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(job({ document_id: null }));
    const r: any = await jobService.artifacts('parse_x');
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });

  it('artifacts throws resource_not_found for an unknown job', async () => {
    vi.spyOn(parseJobRepository, 'findById').mockResolvedValue(undefined);
    await expect(jobService.artifacts('nope')).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
