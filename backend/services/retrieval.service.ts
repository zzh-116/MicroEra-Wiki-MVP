// Retrieval service (P3-01) — the search.* operation layer over the knowledge
// pipeline. Embeds the query with the same Ollama embedder used by ingest
// (P2-05), then delegates to RetrievalRepository which enforces global scored
// TopK and DB-level ACL filters.
import { ollamaEmbedder } from '../embedding/ollama.js';
import { retrievalRepository } from '../repositories/retrieval.repository.js';
import { ServiceError } from './knowledge.service.js';

export interface VectorSearchResult {
  chunk_id: string;
  document_id: number;
  /** 1 - cosine_distance (higher is more similar). */
  score: number;
  distance: number;
  text: string;
  heading: string | null;
  strategy: string;
  title: string;
  kb_id: number;
  visibility: string;
}

export interface VectorSearchInput {
  query: string;
  kb_id?: number;
  folder_id?: number;
  top_k?: number;
  is_internal?: boolean;
}

export interface LexicalSearchResult {
  chunk_id: string;
  document_id: number;
  /** ts_rank score (higher is a better match). */
  score: number;
  text: string;
  heading: string | null;
  strategy: string;
  title: string;
  kb_id: number;
  visibility: string;
}

export interface LexicalSearchInput {
  query: string;
  kb_id?: number;
  folder_id?: number;
  top_k?: number;
  is_internal?: boolean;
}

export interface HybridSearchInput {
  query: string;
  kb_id?: number;
  folder_id?: number;
  top_k?: number;
  is_internal?: boolean;
  /** Reciprocal-rank-fusion smoothing constant (default 60). */
  rrf_k?: number;
}

export interface HybridHit {
  chunk_id: string;
  document_id: number;
  /** Fused RRF score (higher is better). */
  score: number;
  text: string;
  heading: string | null;
  strategy: string;
  title: string;
  kb_id: number;
  visibility: string;
}

export interface ExplainHit {
  chunk_id: string;
  document_id: number;
  title: string;
  text: string;
  vector: { rank: number; score: number } | null;
  lexical: { rank: number; score: number } | null;
  rrf_score: number;
}

const MAX_TOP_K = 100;

/** Reciprocal-rank-fusion smoothing constant (the standard 60). */
export const RRF_K = 60;

/** Normalize a query for Postgres FTS: trim, lowercase, collapse whitespace.
 *  `websearch_to_tsquery` then turns it into a valid OR query (phrases and `-`
 *  exclusions preserved), and it tolerates ordinary user input without throwing
 *  on the common cases. */
function normalizeLexicalQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface FusedEntry {
  chunk_id: string;
  vector_rank: number | null;
  lexical_rank: number | null;
  rrf_score: number;
}

/** Reciprocal-rank fusion of two ranked lists keyed by chunk_id. Each source
 *  contributes 1/(k + rank) with rank starting at 1; entries are merged and
 *  sorted by descending fused score. Deterministic — no random tie-breaking. */
export function fuseReciprocalRank(
  vector: Array<{ chunk_id: string }>,
  lexical: Array<{ chunk_id: string }>,
  k: number = RRF_K,
): FusedEntry[] {
  const map = new Map<string, FusedEntry>();
  const touch = (chunkId: string): FusedEntry => {
    let e = map.get(chunkId);
    if (!e) {
      e = { chunk_id: chunkId, vector_rank: null, lexical_rank: null, rrf_score: 0 };
      map.set(chunkId, e);
    }
    return e;
  };
  vector.forEach((v, i) => {
    const e = touch(v.chunk_id);
    e.vector_rank = i + 1;
    e.rrf_score += 1 / (k + (i + 1));
  });
  lexical.forEach((l, i) => {
    const e = touch(l.chunk_id);
    e.lexical_rank = i + 1;
    e.rrf_score += 1 / (k + (i + 1));
  });
  return [...map.values()].sort((a, b) => b.rrf_score - a.rrf_score);
}

export class RetrievalService {
  async vectorSearch(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    const query = (input.query ?? '').trim();
    if (!query) throw new ServiceError('validation_failed', 'query is required');
    const topK = Math.min(Math.max(input.top_k ?? 10, 1), MAX_TOP_K);

    const queryVector = await ollamaEmbedder.embed(query);
    const rows = await retrievalRepository.vectorSearch({
      queryVector,
      topK,
      kbId: input.kb_id,
      folderId: input.folder_id,
      isInternal: input.is_internal,
    });

    return rows.map((r) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      distance: r.distance,
      score: 1 - r.distance,
      text: r.text,
      heading: r.heading,
      strategy: r.strategy,
      title: r.title,
      kb_id: r.kb_id,
      visibility: r.visibility,
    }));
  }

  /** Lexical (keyword) search via Postgres FTS — the BM25-ish baseline that
   *  hybrid retrieval fuses with vector results (P3-03). */
  async lexicalSearch(input: LexicalSearchInput): Promise<LexicalSearchResult[]> {
    const query = normalizeLexicalQuery(input.query ?? '');
    if (!query) throw new ServiceError('validation_failed', 'query is required');
    const topK = Math.min(Math.max(input.top_k ?? 10, 1), MAX_TOP_K);

    const rows = await retrievalRepository.lexicalSearch({
      query,
      topK,
      kbId: input.kb_id,
      folderId: input.folder_id,
      isInternal: input.is_internal,
    });

    return rows.map((r) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      score: r.score,
      text: r.text,
      heading: r.heading,
      strategy: r.strategy,
      title: r.title,
      kb_id: r.kb_id,
      visibility: r.visibility,
    }));
  }

  /** Run vector + lexical retrieval concurrently for a single query. */
  private async fetchBoth(
    input: HybridSearchInput,
    topK: number,
  ): Promise<{ vector: VectorSearchResult[]; lexical: LexicalSearchResult[] }> {
    const scope = { kb_id: input.kb_id, folder_id: input.folder_id, is_internal: input.is_internal };
    const [vector, lexical] = await Promise.all([
      this.vectorSearch({ query: input.query, ...scope, top_k: topK }),
      this.lexicalSearch({ query: input.query, ...scope, top_k: topK }),
    ]);
    return { vector, lexical };
  }

  private metaMap(hits: Array<HybridHit>): Map<string, Omit<HybridHit, 'chunk_id' | 'score'>> {
    const map = new Map<string, Omit<HybridHit, 'chunk_id' | 'score'>>();
    for (const h of hits) {
      if (!map.has(h.chunk_id)) {
        map.set(h.chunk_id, {
          document_id: h.document_id,
          text: h.text,
          heading: h.heading,
          strategy: h.strategy,
          title: h.title,
          kb_id: h.kb_id,
          visibility: h.visibility,
        });
      }
    }
    return map;
  }

  /** Hybrid retrieval: fuse vector + lexical ranked lists via RRF. */
  async hybridSearch(input: HybridSearchInput): Promise<HybridHit[]> {
    const query = (input.query ?? '').trim();
    if (!query) throw new ServiceError('validation_failed', 'query is required');
    const topK = Math.min(Math.max(input.top_k ?? 10, 1), MAX_TOP_K);
    const k = input.rrf_k ?? RRF_K;

    const { vector, lexical } = await this.fetchBoth(input, topK);
    const fused = fuseReciprocalRank(vector, lexical, k).slice(0, topK);
    const meta = this.metaMap([...vector, ...lexical]);

    return fused.map((f) => {
      const m = meta.get(f.chunk_id)!;
      return { chunk_id: f.chunk_id, score: f.rrf_score, ...m };
    });
  }

  /** Hybrid retrieval with a per-source score trace (search.explain). */
  async explainSearch(input: HybridSearchInput): Promise<ExplainHit[]> {
    const query = (input.query ?? '').trim();
    if (!query) throw new ServiceError('validation_failed', 'query is required');
    const topK = Math.min(Math.max(input.top_k ?? 10, 1), MAX_TOP_K);
    const k = input.rrf_k ?? RRF_K;

    const { vector, lexical } = await this.fetchBoth(input, topK);
    const fused = fuseReciprocalRank(vector, lexical, k).slice(0, topK);

    const vRank = new Map<string, { rank: number; score: number }>();
    vector.forEach((v, i) => vRank.set(v.chunk_id, { rank: i + 1, score: v.score }));
    const lRank = new Map<string, { rank: number; score: number }>();
    lexical.forEach((l, i) => lRank.set(l.chunk_id, { rank: i + 1, score: l.score }));

    const meta = this.metaMap([...vector, ...lexical]);
    return fused.map((f) => {
      const m = meta.get(f.chunk_id)!;
      return {
        chunk_id: f.chunk_id,
        document_id: m.document_id,
        title: m.title,
        text: m.text,
        vector: vRank.get(f.chunk_id) ?? null,
        lexical: lRank.get(f.chunk_id) ?? null,
        rrf_score: f.rrf_score,
      };
    });
  }
}

export const retrievalService = new RetrievalService();
