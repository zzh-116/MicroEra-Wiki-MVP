// Vector Repository - abstracts pgvector / Milvus backends
// Services call vectorRepo.search() without knowing the underlying store
import { db } from '../db/connection.js';
import { entries, entryTags, tags, vectors } from '../db/schema.js';
import { eq, sql, cosineDistance, inArray } from 'drizzle-orm';

export interface VectorRecord {
  chunk_id: string;
  entry_id: number;
  embedding: number[];
}

export interface VectorSearchResult {
  entry_id: number;
  chunk_id: string;
  score: number;
}

/** Core knowledge types shown in the graph: papers, patents, and tech docs.
 *  Legacy technical aliases are kept so existing real-data entries still match. */
const CORE_ENTRY_TYPES = [
  'academic_paper',
  'patent',
  'tech_doc',
  'product',
  'tech',
  'data_standard',
  'data_item',
] as const;

/** Core tags: MOF, quantum (量子), papermaking (造纸), computational materials (计算材料). */
const CORE_TAG_PATTERNS = [
  'mof',
  '\u91cf\u5b50', // 量子
  '\u9020\u7eb8', // 造纸
  '\u8ba1\u7b97\u6750\u6599', // 计算材料
];

export interface VectorStore {
  insert(records: VectorRecord[]): Promise<void>;
  search(queryVector: number[], topK: number): Promise<VectorSearchResult[]>;
  deleteByEntryId(entryId: number): Promise<void>;
  clear(): Promise<void>;
  isReady(): boolean;
}

/**
 * Pgvector implementation - uses PostgreSQL's pgvector extension.
 * Suitable for up to ~500K vectors. For larger scale, swap in MilvusStore.
 */
class PgvectorStore implements VectorStore {
  async insert(records: VectorRecord[]): Promise<void> {
    const valid = records.filter((r) => r.embedding && r.embedding.length > 0);
    if (valid.length === 0) return;

    for (const r of valid) {
      await db
        .insert(vectors)
        .values({
          chunkId: r.chunk_id,
          entryId: r.entry_id,
          embedding: r.embedding,
          store: 'pgvector',
        })
        .onConflictDoUpdate({
          target: vectors.chunkId,
          set: { embedding: r.embedding, entryId: r.entry_id },
        });
    }
  }

  async search(queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    // Restrict graph neighbors to core knowledge types and dedupe by title
    // (DISTINCT ON (title) keeps the best-scoring record for each title).
    const results = await db
      .selectDistinctOn([entries.title], {
        chunk_id: vectors.chunkId,
        entry_id: vectors.entryId,
        distance: cosineDistance(vectors.embedding, queryVector),
      })
      .from(vectors)
      .innerJoin(entries, eq(vectors.entryId, entries.id))
      .where(inArray(entries.entryType, CORE_ENTRY_TYPES))
      .orderBy(entries.title, cosineDistance(vectors.embedding, queryVector))
      .limit(topK);

    if (results.length === 0) return [];

    const entryIds = [...new Set(results.map((r) => r.entry_id))];
    const tagRows = await db
      .select({ entryId: entryTags.entryId, tagName: tags.name })
      .from(entryTags)
      .innerJoin(tags, eq(entryTags.tagId, tags.id))
      .where(inArray(entryTags.entryId, entryIds));

    const boosted = new Set<number>();
    for (const row of tagRows) {
      const lower = row.tagName.toLowerCase();
      if (CORE_TAG_PATTERNS.some((pattern) => lower.includes(pattern))) {
        boosted.add(row.entryId);
      }
    }

    return results
      .map((r) => ({
        chunk_id: r.chunk_id,
        entry_id: r.entry_id,
        score: 1 - (r.distance as number) + (boosted.has(r.entry_id) ? 0.2 : 0),
      }))
      .sort((a, b) => b.score - a.score);
  }

  async deleteByEntryId(entryId: number): Promise<void> {
    await db.delete(vectors).where(eq(vectors.entryId, entryId));
  }

  async clear(): Promise<void> {
    await db.delete(vectors);
  }

  isReady(): boolean { return true; }
}

export class VectorRepository implements VectorStore {
  private store: VectorStore;

  constructor(store?: VectorStore) {
    // Default to pgvector. Swap in Milvus via config or constructor injection.
    this.store = store ?? new PgvectorStore();
  }

  async insert(records: VectorRecord[]): Promise<void> {
    return this.store.insert(records);
  }

  async search(queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    return this.store.search(queryVector, topK);
  }

  async deleteByEntryId(entryId: number): Promise<void> {
    return this.store.deleteByEntryId(entryId);
  }

  async clear(): Promise<void> {
    return this.store.clear();
  }

  isReady(): boolean { return this.store.isReady(); }
}

export const vectorRepository = new VectorRepository();
