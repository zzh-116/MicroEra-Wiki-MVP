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

const MAX_TOP_K = 100;

/** Normalize a query for Postgres FTS: trim, lowercase, collapse whitespace.
 *  `websearch_to_tsquery` then turns it into a valid OR query (phrases and `-`
 *  exclusions preserved), and it tolerates ordinary user input without throwing
 *  on the common cases. */
function normalizeLexicalQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
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
}

export const retrievalService = new RetrievalService();
