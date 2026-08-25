// Relation Repository - persisted knowledge graph edges (entry_relations).
// Graph APIs read from this table instead of recomputing neighbors per request.
import { and, inArray, or } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { entryRelations } from '../db/schema.js';

export const SEMANTIC_RELATION_TYPE = 'semantic_related';
export const EMBEDDING_RELATION_SOURCE = 'embedding';

export interface EntryRelationRow {
  id: number;
  sourceEntryId: number;
  targetEntryId: number;
  relationType: string;
  similarity: number | null;
  relationSource: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewEntryRelation {
  sourceEntryId: number;
  targetEntryId: number;
  similarity: number;
  /** Preserve a real relation type when known; defaults to semantic_related. */
  relationType?: string;
  /** Preserve the relation source when known; defaults to embedding. */
  relationSource?: string;
}

function mapRow(row: typeof entryRelations.$inferSelect): EntryRelationRow {
  return {
    id: row.id,
    sourceEntryId: row.sourceEntryId,
    targetEntryId: row.targetEntryId,
    relationType: row.relationType,
    similarity: row.similarity == null ? null : Number(row.similarity),
    relationSource: row.relationSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RelationRepository {
  /** Relations where BOTH endpoints are in the given entry id set. */
  async findByEntryIds(entryIds: number[], limit?: number): Promise<EntryRelationRow[]> {
    if (entryIds.length === 0) return [];
    const rows = await db
      .select()
      .from(entryRelations)
      .where(
        and(
          inArray(entryRelations.sourceEntryId, entryIds),
          inArray(entryRelations.targetEntryId, entryIds),
        ),
      )
      .orderBy(entryRelations.sourceEntryId, entryRelations.targetEntryId)
      .limit(limit ?? 10000);
    return rows.map(mapRow);
  }

  /** Relations touching ANY of the given entries (either endpoint), bounded.
   *  Lets /focused fetch a local neighbourhood without loading the whole table. */
  async findTouching(entryIds: number[], limit = 300): Promise<EntryRelationRow[]> {
    if (entryIds.length === 0) return [];
    const rows = await db
      .select()
      .from(entryRelations)
      .where(
        or(
          inArray(entryRelations.sourceEntryId, entryIds),
          inArray(entryRelations.targetEntryId, entryIds),
        ),
      )
      .orderBy(entryRelations.sourceEntryId, entryRelations.targetEntryId)
      .limit(limit);
    return rows.map(mapRow);
  }

  /** Relations where BOTH endpoints are within the given id set, bounded. */
  async findWithin(entryIds: number[], limit = 600): Promise<EntryRelationRow[]> {
    if (entryIds.length === 0) return [];
    const rows = await db
      .select()
      .from(entryRelations)
      .where(
        and(
          inArray(entryRelations.sourceEntryId, entryIds),
          inArray(entryRelations.targetEntryId, entryIds),
        ),
      )
      .orderBy(entryRelations.sourceEntryId, entryRelations.targetEntryId)
      .limit(limit);
    return rows.map(mapRow);
  }

  async count(): Promise<number> {
    const result = await db.select({ count: entryRelations.id }).from(entryRelations);
    return result.length;
  }

  /** Replace the whole table atomically during a graph rebuild. */
  async replaceAll(relations: NewEntryRelation[]): Promise<number> {
    return db.transaction(async (tx) => {
      await tx.delete(entryRelations);
      if (relations.length === 0) return 0;

      const now = new Date();
      await tx.insert(entryRelations).values(
        relations.map((r) => ({
          sourceEntryId: r.sourceEntryId,
          targetEntryId: r.targetEntryId,
          relationType: r.relationType ?? SEMANTIC_RELATION_TYPE,
          similarity: r.similarity,
          relationSource: r.relationSource ?? EMBEDDING_RELATION_SOURCE,
          createdAt: now,
          updatedAt: now,
        })),
      );
      return relations.length;
    });
  }
}

export const relationRepository = new RelationRepository();
