// Vector Repository — abstracts pgvector / Milvus backends
// Services call vectorRepo.search() without knowing the underlying store
import { db } from '../db/connection.js';
import { vectors } from '../db/schema.js';
import { eq, sql, cosineDistance, desc } from 'drizzle-orm';

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

export interface VectorStore {
  insert(records: VectorRecord[]): Promise<void>;
  search(queryVector: number[], topK: number): Promise<VectorSearchResult[]>;
  deleteByEntryId(entryId: number): Promise<void>;
  clear(): Promise<void>;
  isReady(): boolean;
}

/**
 * Pgvector implementation — uses PostgreSQL's pgvector extension.
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
    // Use cosine distance operator (<=>) for pgvector
    const results = await db
      .select({
        chunk_id: vectors.chunkId,
        entry_id: vectors.entryId,
        distance: cosineDistance(vectors.embedding, queryVector),
      })
      .from(vectors)
      .orderBy(cosineDistance(vectors.embedding, queryVector))
      .limit(topK);

    return results.map((r) => ({
      chunk_id: r.chunk_id,
      entry_id: r.entry_id,
      score: 1 - (r.distance as number), // cosineDistance → cosine similarity
    }));
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
