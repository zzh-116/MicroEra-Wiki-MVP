import { BaseRepository, DbClient } from './base.js';
import { documentChunks } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { DocumentChunk, ParsedProperty } from '../types.js';

function buildSearchText(p: ParsedProperty): string {
  return [
    `[${p.code}] ${p.nameZh}`, p.nameEn,
    `符号: ${p.symbol}`, `定义: ${p.definition}`,
    `单位: ${p.preferredUnit}`,
    p.alternativeUnits ? `其他单位: ${p.alternativeUnits}` : '',
    p.valueRange ? `值域: ${p.valueRange}` : '',
    p.methods ? `方法: ${p.methods}` : '',
    p.notes ? `备注: ${p.notes}` : '',
  ].filter(Boolean).join('\n');
}

export class ChunkRepository extends BaseRepository {
  /**
   * Save chunks from ChunkService output (ChunkResult[]).
   * By default deletes existing chunks for the entry first, then inserts.
   * Pass { deleteExisting: false } to append without deleting (caller handles cleanup).
   */
  async saveChunks(
    entryId: number,
    chunks: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>,
    opts?: { deleteExisting?: boolean },
    tx?: DbClient,
  ): Promise<void> {
    const client = tx ?? this.db;
    if (opts?.deleteExisting !== false) {
      await client.delete(documentChunks).where(eq(documentChunks.entryId, entryId));
    }
    if (chunks.length > 0) {
      await client.insert(documentChunks).values(
        chunks.map((c) => ({
          id: c.id,
          entryId,
          text: c.text,
          metadata: c.metadata ?? {},
        })),
      );
    }
    console.log(`[ChunkRepo] Saved ${chunks.length} chunks for entry #${entryId}${opts?.deleteExisting === false ? ' (append)' : ''}`);
  }

  /** Save chunks from parsed properties. By default deletes existing chunks first. */
  async saveFromProperties(
    entryId: number,
    properties: ParsedProperty[],
    opts?: { deleteExisting?: boolean },
    tx?: DbClient,
  ): Promise<DocumentChunk[]> {
    const client = tx ?? this.db;
    const chunks: DocumentChunk[] = properties.map((p) => ({
      id: `${entryId}_${p.code}`,
      entryId,
      text: buildSearchText(p),
      metadata: {
        code: p.code, section: p.section, category: p.category,
        nameZh: p.nameZh, nameEn: p.nameEn, symbol: p.symbol,
        definition: p.definition, preferredUnit: p.preferredUnit,
        methods: p.methods,
      },
    }));

    if (opts?.deleteExisting !== false) {
      await client.delete(documentChunks).where(eq(documentChunks.entryId, entryId));
    }

    if (chunks.length > 0) {
      await client.insert(documentChunks).values(
        chunks.map((c) => ({
          id: c.id, entryId: c.entryId, text: c.text, metadata: c.metadata,
        })),
      );
    }
    return chunks;
  }

  async findByEntryId(entryId: number): Promise<DocumentChunk[]> {
    const rows = await this.db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.entryId, entryId));
    return rows.map((r) => ({
      id: r.id, entryId: r.entryId, text: r.text,
      metadata: r.metadata as Record<string, unknown>,
    }));
  }

  async findTextsByIds(chunkIds: string[]): Promise<Map<string, string>> {
    if (chunkIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: documentChunks.id, text: documentChunks.text })
      .from(documentChunks)
      .where(inArray(documentChunks.id, chunkIds));
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, r.text);
    return map;
  }

  async deleteByEntryId(entryId: number, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(documentChunks).where(eq(documentChunks.entryId, entryId));
  }

  async deleteAll(): Promise<void> {
    await this.db.delete(documentChunks);
  }
}

export const chunkRepository = new ChunkRepository();
