// Eval service (P3-05) — retrieval evaluation over synthetic relevance-judgement
// datasets. `eval.run` scores a retrieval method (vector/lexical/hybrid) against
// the ground-truth document ids in a dataset, computes recall@k / MRR / nDCG@k,
// and persists the run so `eval.report` / `eval.compare` can read it back.
//
// The metric functions are pure and exported so they can be unit-tested without
// a database or an embedder.
import { randomUUID } from 'node:crypto';
import { evalRepository } from '../repositories/eval.repository.js';
import { retrievalService } from './retrieval.service.js';
import { ServiceError } from './knowledge.service.js';

export type EvalMethod = 'vector' | 'lexical' | 'hybrid';
const METHODS: EvalMethod[] = ['vector', 'lexical', 'hybrid'];

export const MAX_TOP_K = 100;

/** Deduplicate an id list, keeping the first occurrence (retrieval order). */
export function dedupePreservingOrder(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** recall@k — fraction of relevant documents present in the top-k retrieved. */
export function recallAtK(retrievedIds: number[], relevantIds: number[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const rel = new Set(relevantIds);
  const hits = retrievedIds.slice(0, k).filter((id) => rel.has(id)).length;
  return hits / relevantIds.length;
}

/** MRR — reciprocal rank of the first relevant document (1-indexed), 0 if none. */
export function reciprocalRank(retrievedIds: number[], relevantIds: number[]): number {
  const rel = new Set(relevantIds);
  const idx = retrievedIds.findIndex((id) => rel.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

/** nDCG@k — binary-relevance discounted cumulative gain, normalized by the ideal
 *  (all relevant docs ranked first). 0 when there are no relevant docs. */
export function ndcgAtK(retrievedIds: number[], relevantIds: number[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const rel = new Set(relevantIds);
  let dcg = 0;
  retrievedIds.slice(0, k).forEach((id, i) => {
    if (rel.has(id)) dcg += 1 / Math.log2(i + 2);
  });
  const idealCount = Math.min(relevantIds.length, k);
  let idcg = 0;
  for (let i = 0; i < idealCount; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function avg(ns: number[]): number {
  if (ns.length === 0) return 0;
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export interface EvalQueryInput {
  query: string;
  relevant_document_ids: number[];
}

export class EvalService {
  async listDatasets(input: { page?: number; page_size?: number }) {
    return evalRepository.listDatasets({ page: input.page, pageSize: input.page_size });
  }

  async createDataset(input: {
    name: string;
    kb_id?: number;
    description?: string;
    method?: EvalMethod;
    queries?: EvalQueryInput[];
  }): Promise<unknown> {
    const name = (input.name ?? '').trim();
    if (!name) throw new ServiceError('validation_failed', 'name is required');
    if (input.method !== undefined && !METHODS.includes(input.method)) {
      throw new ServiceError('validation_failed', 'method must be vector|lexical|hybrid');
    }
    const queries: EvalQueryInput[] = (input.queries ?? [])
      .map((q) => ({
        query: (q?.query ?? '').trim(),
        relevant_document_ids: Array.isArray(q?.relevant_document_ids) ? q.relevant_document_ids : [],
      }))
      .filter((q) => q.query.length > 0);
    if (queries.length === 0) {
      throw new ServiceError('validation_failed', 'queries must contain at least one { query, relevant_document_ids }');
    }

    return evalRepository.createDataset({
      name,
      kbId: input.kb_id,
      description: input.description,
      method: input.method,
      queries,
    });
  }

  async runEval(input: {
    dataset_id: number;
    method?: EvalMethod;
    top_k?: number;
    is_internal?: boolean;
  }): Promise<unknown> {
    const datasetId = input.dataset_id;
    if (!datasetId) throw new ServiceError('validation_failed', 'dataset_id is required');
    const dataset = await evalRepository.findDatasetById(datasetId);
    if (!dataset) throw new ServiceError('resource_not_found', 'eval dataset not found');

    const method = input.method ?? dataset.method;
    if (!METHODS.includes(method)) throw new ServiceError('validation_failed', 'method must be vector|lexical|hybrid');
    if (dataset.items.length === 0) throw new ServiceError('validation_failed', 'dataset has no query items');

    const topK = Math.min(Math.max(input.top_k ?? 10, 1), MAX_TOP_K);
    const scope = { kb_id: dataset.kb_id ?? undefined, is_internal: input.is_internal };

    const perQuery: unknown[] = [];
    for (const item of dataset.items) {
      let hits: Array<{ document_id: number }>;
      if (method === 'vector') {
        hits = await retrievalService.vectorSearch({ query: item.query, ...scope, top_k: topK });
      } else if (method === 'lexical') {
        hits = await retrievalService.lexicalSearch({ query: item.query, ...scope, top_k: topK });
      } else {
        hits = await retrievalService.hybridSearch({ query: item.query, ...scope, top_k: topK });
      }

      const retrievedIds = dedupePreservingOrder(hits.map((h) => h.document_id));
      const relevant = item.relevant_document_ids;
      perQuery.push({
        query: item.query,
        relevant_document_ids: relevant,
        retrieved_document_ids: retrievedIds,
        recall_at_k: round(recallAtK(retrievedIds, relevant, topK)),
        mrr: round(reciprocalRank(retrievedIds, relevant)),
        ndcg_at_k: round(ndcgAtK(retrievedIds, relevant, topK)),
      });
    }

    const metrics = {
      recall_at_k: round(avg(perQuery.map((q: any) => q.recall_at_k))),
      mrr: round(avg(perQuery.map((q: any) => q.mrr))),
      ndcg_at_k: round(avg(perQuery.map((q: any) => q.ndcg_at_k))),
      num_queries: perQuery.length,
    };

    const run = await evalRepository.createRun({
      id: `eval_${randomUUID()}`,
      datasetId,
      method,
      params: { top_k: topK, is_internal: input.is_internal ?? null },
      metrics,
      perQuery,
      status: 'completed',
    });

    return {
      run_id: run.id,
      dataset_id: datasetId,
      dataset_name: dataset.name,
      method,
      metrics,
      per_query: perQuery,
      created_at: run.created_at,
    };
  }

  async report(input: { run_id: string }): Promise<unknown> {
    const run = await evalRepository.findRunById(input.run_id ?? '');
    if (!run) throw new ServiceError('resource_not_found', 'eval run not found');
    const dataset = await evalRepository.findDatasetById(run.dataset_id);
    return {
      run_id: run.id,
      dataset_id: run.dataset_id,
      dataset_name: dataset?.name ?? null,
      method: run.method,
      status: run.status,
      params: run.params,
      metrics: run.metrics,
      per_query: run.per_query,
      created_at: run.created_at,
    };
  }

  async compare(input: { run_ids: string[] }): Promise<unknown> {
    const ids = (input.run_ids ?? []).map((x) => String(x)).filter(Boolean);
    if (ids.length < 2) throw new ServiceError('validation_failed', 'run_ids requires at least two run ids');
    const runs = await evalRepository.listRunsByIds(ids);
    const byId = new Map(runs.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id));
    if (ordered.some((r) => !r)) throw new ServiceError('resource_not_found', 'one or more eval runs not found');

    const rows = ordered.map((r) => ({
      run_id: r!.id,
      dataset_id: r!.dataset_id,
      method: r!.method,
      metrics: r!.metrics,
    }));
    const base = rows[0].metrics;
    const deltas = rows.slice(1).map((r) => ({
      run_id: r.run_id,
      baseline_run_id: rows[0].run_id,
      recall_at_k_delta: round(r.metrics.recall_at_k - base.recall_at_k),
      mrr_delta: round(r.metrics.mrr - base.mrr),
      ndcg_at_k_delta: round(r.metrics.ndcg_at_k - base.ndcg_at_k),
    }));

    return { baseline_run_id: rows[0].run_id, runs: rows, deltas };
  }
}

export const evalService = new EvalService();
