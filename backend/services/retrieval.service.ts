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

const MAX_TOP_K = 100;

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
}

export const retrievalService = new RetrievalService();
