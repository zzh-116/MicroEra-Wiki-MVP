// Retrieval repository (P3-01) — vector TopK over the knowledge pipeline
// (knowledge_vectors → knowledge_chunks → documents → knowledge_bases).
//
// ACL is enforced in SQL, never post-hoc in JS: soft-deleted rows and
// non-public documents are filtered out of the query itself, so an anonymous
// caller never has internal/deleted rows pulled into memory in the first
// place. Ranking is a true global TopK by cosine distance (no per-document
// cap), unlike the legacy entry-based search which limited chunks per entry.
import { BaseRepository } from './base.js';
import { knowledgeVectors, knowledgeChunks, documents, knowledgeBases } from '../db/schema.js';
import { eq, and, cosineDistance, isNull } from 'drizzle-orm';

export interface VectorHitRow {
  chunk_id: string;
  document_id: number;
  distance: number;
  text: string;
  heading: string | null;
  strategy: string;
  title: string;
  kb_id: number;
  visibility: string;
}

export interface VectorSearchFilter {
  queryVector: number[];
  topK: number;
  kbId?: number;
  folderId?: number;
  /** When false, restrict to public documents + public KBs (ACL). */
  isInternal?: boolean;
}

export class RetrievalRepository extends BaseRepository {
  async vectorSearch(f: VectorSearchFilter): Promise<VectorHitRow[]> {
    const conditions = [
      isNull(documents.deletedAt),
      isNull(knowledgeBases.deletedAt),
    ];
    if (f.kbId !== undefined) conditions.push(eq(documents.kbId, f.kbId));
    if (f.folderId !== undefined) conditions.push(eq(documents.folderId, f.folderId));
    if (f.isInternal === false) {
      conditions.push(eq(documents.visibility, 'public'));
      conditions.push(eq(knowledgeBases.visibility, 'public'));
    }

    const rows = await this.db
      .select({
        chunk_id: knowledgeVectors.chunkId,
        document_id: knowledgeVectors.documentId,
        distance: cosineDistance(knowledgeVectors.embedding, f.queryVector),
        text: knowledgeChunks.text,
        heading: knowledgeChunks.heading,
        strategy: knowledgeChunks.strategy,
        title: documents.title,
        kb_id: documents.kbId,
        visibility: documents.visibility,
      })
      .from(knowledgeVectors)
      .innerJoin(knowledgeChunks, eq(knowledgeVectors.chunkId, knowledgeChunks.id))
      .innerJoin(documents, eq(knowledgeVectors.documentId, documents.id))
      .innerJoin(knowledgeBases, eq(documents.kbId, knowledgeBases.id))
      .where(and(...conditions))
      .orderBy(cosineDistance(knowledgeVectors.embedding, f.queryVector))
      .limit(f.topK);

    return rows.map((r) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      distance: r.distance as number,
      text: r.text,
      heading: r.heading,
      strategy: r.strategy,
      title: r.title,
      kb_id: r.kb_id,
      visibility: r.visibility,
    }));
  }
}

export const retrievalRepository = new RetrievalRepository();
