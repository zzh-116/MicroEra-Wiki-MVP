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
import { eq, and, cosineDistance, isNull, sql, desc, inArray, gte, lte, ilike } from 'drizzle-orm';

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

export interface LexicalHitRow {
  chunk_id: string;
  document_id: number;
  score: number;
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
  filters?: MetadataFilters;
}

export interface LexicalSearchFilter {
  /** Normalized tsquery text (lowercased, whitespace-collapsed). */
  query: string;
  topK: number;
  kbId?: number;
  folderId?: number;
  isInternal?: boolean;
  filters?: MetadataFilters;
}

/** Metadata filters for search.filtered (P3-06). Each field maps to a SQL
 *  predicate so filtering happens in the database, never post-hoc in JS. */
export interface MetadataFilters {
  strategy?: string;
  visibility?: 'public' | 'internal';
  document_ids?: number[];
  title_contains?: string;
  created_after?: string;
  created_before?: string;
}

export class RetrievalRepository extends BaseRepository {
  /** Shared ACL conditions: exclude soft-deleted docs/KBs and, for a public
   *  caller, non-public rows — always in SQL, never post-hoc. */
  private aclConditions(f: { kbId?: number; folderId?: number; isInternal?: boolean }): any[] {
    const conditions: any[] = [
      isNull(documents.deletedAt),
      isNull(knowledgeBases.deletedAt),
    ];
    if (f.kbId !== undefined) conditions.push(eq(documents.kbId, f.kbId));
    if (f.folderId !== undefined) conditions.push(eq(documents.folderId, f.folderId));
    if (f.isInternal === false) {
      conditions.push(eq(documents.visibility, 'public'));
      conditions.push(eq(knowledgeBases.visibility, 'public'));
    }
    return conditions;
  }

  /** Metadata-filter predicates (P3-06): strategy (chunk), and document-scoped
   *  visibility / id-set / title substring / created range. */
  private metadataConditions(f?: MetadataFilters): any[] {
    if (!f) return [];
    const conds: any[] = [];
    if (f.strategy !== undefined) conds.push(eq(knowledgeChunks.strategy, f.strategy));
    if (f.visibility !== undefined) conds.push(eq(documents.visibility, f.visibility));
    if (f.document_ids !== undefined && f.document_ids.length > 0) conds.push(inArray(documents.id, f.document_ids));
    if (f.title_contains) conds.push(ilike(documents.title, `%${f.title_contains}%`));
    if (f.created_after) conds.push(gte(documents.createdAt, new Date(f.created_after)));
    if (f.created_before) conds.push(lte(documents.createdAt, new Date(f.created_before)));
    return conds;
  }

  async vectorSearch(f: VectorSearchFilter): Promise<VectorHitRow[]> {
    const conditions = [...this.aclConditions(f), ...this.metadataConditions(f.filters)];

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

  /** Lexical search via Postgres FTS (BM25-ish baseline). The `simple` config
   *  tokenizes on whitespace/punctuation (no stemming) so it behaves sensibly
   *  on mixed Chinese–English text. `websearch_to_tsquery` gives users Google-
   *  style OR semantics with quoted phrases and `-` exclusions; ts_rank orders
   *  matches by term frequency + document-length normalization. */
  async lexicalSearch(f: LexicalSearchFilter): Promise<LexicalHitRow[]> {
    const tsvector = sql`to_tsvector('simple', ${knowledgeChunks.text})`;
    const tsquery = sql`websearch_to_tsquery('simple', ${f.query})`;
    const conditions = [...this.aclConditions(f), ...this.metadataConditions(f.filters), sql`${tsvector} @@ ${tsquery}`];

    const rows = await this.db
      .select({
        chunk_id: knowledgeChunks.id,
        document_id: knowledgeChunks.documentId,
        score: sql<number>`ts_rank(${tsvector}, ${tsquery})`,
        text: knowledgeChunks.text,
        heading: knowledgeChunks.heading,
        strategy: knowledgeChunks.strategy,
        title: documents.title,
        kb_id: documents.kbId,
        visibility: documents.visibility,
      })
      .from(knowledgeChunks)
      .innerJoin(documents, eq(knowledgeChunks.documentId, documents.id))
      .innerJoin(knowledgeBases, eq(documents.kbId, knowledgeBases.id))
      .where(and(...conditions))
      .orderBy(desc(sql`ts_rank(${tsvector}, ${tsquery})`))
      .limit(f.topK);

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

export const retrievalRepository = new RetrievalRepository();
