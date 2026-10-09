// P3-05 — Retrieval eval: pure metric functions (recall@k / MRR / nDCG@k) plus
// the service (dataset CRUD, run, report, compare) with the repository and
// retrieval service mocked out for determinism.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dedupePreservingOrder,
  recallAtK,
  reciprocalRank,
  ndcgAtK,
  evalService,
} from '../../backend/services/eval.service.js';
import { evalRepository } from '../../backend/repositories/eval.repository.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';

const dataset = {
  id: 1,
  name: 'ds',
  kb_id: 1,
  description: '',
  method: 'hybrid' as const,
  created_at: new Date().toISOString(),
  deleted_at: null,
  items: [
    { id: 1, dataset_id: 1, query: 'q1', relevant_document_ids: [2, 3] },
    { id: 2, dataset_id: 1, query: 'q2', relevant_document_ids: [5] },
  ],
};

function hit(document_id: number): any {
  return { chunk_id: `c${document_id}`, document_id, text: 't', score: 0.5 };
}

describe('P3-05 eval metric functions', () => {
  it('dedupes ids keeping first occurrence', () => {
    expect(dedupePreservingOrder([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });

  it('computes recall@k as the fraction of relevant docs in the top-k', () => {
    expect(recallAtK([1, 2, 3], [2, 4], 3)).toBeCloseTo(0.5);
    expect(recallAtK([1, 2, 3], [2], 3)).toBeCloseTo(1);
    expect(recallAtK([1, 2, 3], [], 3)).toBeCloseTo(0);
  });

  it('computes MRR as the reciprocal rank of the first relevant doc', () => {
    expect(reciprocalRank([1, 2, 3], [3])).toBeCloseTo(1 / 3);
    expect(reciprocalRank([1, 2, 3], [1])).toBeCloseTo(1);
    expect(reciprocalRank([1, 2, 3], [9])).toBeCloseTo(0);
  });

  it('computes binary-relevance nDCG@k against the ideal ranking', () => {
    // retrieved [2,1,3], relevant {3,1}, k=3
    expect(ndcgAtK([2, 1, 3], [3, 1], 3)).toBeCloseTo(1.1309 / 1.6309, 3);
    expect(ndcgAtK([1, 2, 3], [], 3)).toBeCloseTo(0);
  });
});

describe('P3-05 eval service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runEval scores each query and persists a completed run', async () => {
    vi.spyOn(evalRepository, 'findDatasetById').mockResolvedValue(dataset);
    const hybrid = vi.spyOn(retrievalService, 'hybridSearch').mockImplementation(async (input: any) =>
      input.query === 'q1' ? [hit(3), hit(9)] : [hit(1), hit(5)],
    );
    const createRun = vi.spyOn(evalRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id,
      dataset_id: r.datasetId,
      method: r.method,
      params: r.params,
      metrics: r.metrics,
      per_query: r.perQuery,
      status: 'completed',
      created_at: new Date().toISOString(),
    }));

    const result: any = await evalService.runEval({ dataset_id: 1, method: 'hybrid', top_k: 3 });

    expect(result.run_id).toMatch(/^eval_/);
    expect(result.method).toBe('hybrid');
    expect(result.per_query).toHaveLength(2);
    expect(result.per_query[0].retrieved_document_ids).toEqual([3, 9]);
    expect(result.per_query[0].recall_at_k).toBeCloseTo(0.5);
    expect(result.per_query[0].mrr).toBeCloseTo(1);
    expect(result.per_query[1].mrr).toBeCloseTo(0.5);
    // aggregates = means across the two queries
    expect(result.metrics.num_queries).toBe(2);
    expect(result.metrics.recall_at_k).toBeCloseTo(0.75);
    expect(result.metrics.mrr).toBeCloseTo(0.75);
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(hybrid).toHaveBeenCalledTimes(2);
  });

  it('createDataset rejects an empty name or empty query list', async () => {
    await expect(evalService.createDataset({ name: '  ', queries: [{ query: 'q', relevant_document_ids: [] }] }))
      .rejects.toMatchObject({ kind: 'validation_failed' });
    await expect(evalService.createDataset({ name: 'ds', queries: [] }))
      .rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('runEval rejects a missing dataset or an unknown dataset', async () => {
    await expect(evalService.runEval({ dataset_id: 0 })).rejects.toMatchObject({ kind: 'validation_failed' });
    vi.spyOn(evalRepository, 'findDatasetById').mockResolvedValue(undefined);
    await expect(evalService.runEval({ dataset_id: 999 })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('report returns the persisted run or rejects an unknown run id', async () => {
    vi.spyOn(evalRepository, 'findRunById').mockResolvedValue(undefined);
    await expect(evalService.report({ run_id: 'nope' })).rejects.toMatchObject({ kind: 'resource_not_found' });

    vi.mocked(evalRepository.findRunById).mockResolvedValue({
      id: 'eval_x',
      dataset_id: 1,
      method: 'lexical',
      params: { top_k: 10 },
      status: 'completed',
      metrics: { recall_at_k: 1, mrr: 1, ndcg_at_k: 1, num_queries: 1 },
      per_query: [],
      created_at: new Date().toISOString(),
    });
    vi.spyOn(evalRepository, 'findDatasetById').mockResolvedValue(dataset);
    const rep: any = await evalService.report({ run_id: 'eval_x' });
    expect(rep.run_id).toBe('eval_x');
    expect(rep.dataset_name).toBe('ds');
  });

  it('compare returns side-by-side metrics and deltas vs the baseline run', async () => {
    vi.spyOn(evalRepository, 'listRunsByIds').mockImplementation(async (ids: string[]) =>
      ids.map((id, i) => ({
        id,
        dataset_id: 1,
        method: 'lexical',
        params: {},
        status: 'completed' as const,
        metrics: { recall_at_k: 0.5 + i * 0.2, mrr: 0.4 + i * 0.2, ndcg_at_k: 0.3 + i * 0.2, num_queries: 1 },
        per_query: [],
        created_at: new Date().toISOString(),
      })),
    );

    const cmp: any = await evalService.compare({ run_ids: ['a', 'b'] });
    expect(cmp.baseline_run_id).toBe('a');
    expect(cmp.runs).toHaveLength(2);
    expect(cmp.deltas[0].recall_at_k_delta).toBeCloseTo(0.2);
    expect(cmp.deltas[0].mrr_delta).toBeCloseTo(0.2);
  });

  it('compare rejects fewer than two run ids', async () => {
    await expect(evalService.compare({ run_ids: ['a'] })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});
