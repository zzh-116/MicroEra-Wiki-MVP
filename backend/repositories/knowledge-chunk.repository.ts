// Knowledge chunk repository (P2-03) — persists a document's chunks and
// enforces index invalidation: editing or deleting a chunk removes its vector
// so the retrieval index never serves stale text.
import { BaseRepository, DbClient } from './base.js';
import { knowledgeChunks, knowledgeVectors } from '../db/schema.js';
import { eq, count } from 'drizzle-orm';
import type { ChunkResult } from '../chunk/service.js';

export interface KnowledgeChunkRow {
  id: string;
  document_id: number;
  index: number;
  text: string;
  strategy: string;
  heading: string | null;
  start_char: number;
  end_char: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function toRow(r: typeof knowledgeChunks.$inferSelect): KnowledgeChunkRow {
  return {
    id: r.id,
    document_id: r.documentId,
    index: r.index,
    text: r.text,
    strategy: r.strategy,
    heading: r.heading,
    start_char: r.startChar,
    end_char: r.endChar,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export class KnowledgeChunkRepository extends BaseRepository {
  /** Replace all chunks for a document (re-chunking is idempotent). */
  async saveChunks(documentId: number, chunks: ChunkResult[], tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
    if (chunks.length === 0) return;
    await client.insert(knowledgeChunks).values(
      chunks.map((c) => ({
        id: c.id,
        documentId,
        index: c.index,
        text: c.text,
        strategy: String(c.metadata?.strategy ?? 'markdown'),
        heading: c.metadata?.heading ? String(c.metadata.heading) : null,
        startChar: c.startChar,
        endChar: c.endChar,
        metadata: c.metadata ?? {},
      })),
    );
  }

  async listByDocument(documentId: number): Promise<KnowledgeChunkRow[]> {
    const rows = await this.db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentId, documentId))
      .orderBy(knowledgeChunks.index);
    return rows.map(toRow);
  }

  async findById(chunkId: string): Promise<KnowledgeChunkRow | undefined> {
    const rows = await this.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.id, chunkId)).limit(1);
    return rows[0] ? toRow(rows[0]) : undefined;
  }

  async updateText(chunkId: string, text: string): Promise<KnowledgeChunkRow | undefined> {
    const [row] = await this.db
      .update(knowledgeChunks)
      .set({ text, updatedAt: new Date() })
      .where(eq(knowledgeChunks.id, chunkId))
      .returning();
    return row ? toRow(row) : undefined;
  }

  async deleteById(chunkId: string, tx?: DbClient): Promise<boolean> {
    const client = tx ?? this.db;
    const [row] = await client
      .delete(knowledgeChunks)
      .where(eq(knowledgeChunks.id, chunkId))
      .returning({ id: knowledgeChunks.id });
    return !!row;
  }

  async deleteByDocument(documentId: number, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
  }

  async countByDocument(documentId: number): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentId, documentId));
    return Number(value);
  }

  // ── Index invalidation ──────────────────────────────────────────────────
  /** Remove a chunk's vector so stale embeddings never surface in retrieval. */
  async invalidateVector(chunkId: string, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(knowledgeVectors).where(eq(knowledgeVectors.chunkId, chunkId));
  }

  async invalidateVectorsByDocument(documentId: number, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(knowledgeVectors).where(eq(knowledgeVectors.documentId, documentId));
  }
}

export const knowledgeChunkRepository = new KnowledgeChunkRepository();
