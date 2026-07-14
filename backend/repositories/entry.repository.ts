import { BaseRepository, DbClient } from './base.js';
import { entries, entryTags, tags } from '../db/schema.js';
import { eq, like, and, or, inArray, desc, isNull, sql } from 'drizzle-orm';
import type { Entry } from '../types.js';

export interface CreateEntryInput {
  title: string;
  entry_type: Entry['entry_type'];
  summary: string;
  content: string;
  visibility: Entry['visibility'];
  category_id?: number;
  created_by?: number;
  tags?: string[];
}

export interface UpdateEntryInput extends Partial<CreateEntryInput> {}

const VALID_ENTRY_TYPES = ['asset', 'product', 'tech', 'patent', 'data_item'] as const;

export class EntryRepository extends BaseRepository {
  /** Hydrate entry rows with their tags */
  private async hydrateTags(entryRows: Array<typeof entries.$inferSelect>): Promise<Entry[]> {
    if (entryRows.length === 0) return [];

    const ids = entryRows.map((e) => e.id);
    const tagRows = await this.db
      .select({ entryId: entryTags.entryId, tagName: tags.name })
      .from(entryTags)
      .innerJoin(tags, eq(entryTags.tagId, tags.id))
      .where(inArray(entryTags.entryId, ids));

    const tagMap = new Map<number, string[]>();
    for (const row of tagRows) {
      if (!tagMap.has(row.entryId)) tagMap.set(row.entryId, []);
      tagMap.get(row.entryId)!.push(row.tagName);
    }

    return entryRows.map((e) => ({
      id: e.id,
      title: e.title,
      entry_type: e.entryType as Entry['entry_type'],
      summary: e.summary,
      content: e.content,
      visibility: e.visibility as Entry['visibility'],
      category_id: e.categoryId ?? undefined,
      created_at: e.createdAt.toISOString(),
      updated_at: e.updatedAt.toISOString(),
      tags: tagMap.get(e.id) || [],
    }));
  }

  async findById(id: number): Promise<Entry | undefined> {
    const rows = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), isNull(entries.deletedAt)))
      .limit(1);
    if (rows.length === 0) return undefined;
    const hydrated = await this.hydrateTags(rows);
    return hydrated[0];
  }

  async findByIds(ids: number[]): Promise<Entry[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(entries)
      .where(and(inArray(entries.id, ids), isNull(entries.deletedAt)));
    return this.hydrateTags(rows);
  }

  async findMany(params?: {
    keyword?: string;
    entry_type?: string;
    visibility?: string;
    category_id?: string;
    tag?: string;
    isInternal?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ entries: Entry[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const conditions: ReturnType<typeof eq>[] = [isNull(entries.deletedAt)];

    if (!params?.isInternal) {
      conditions.push(eq(entries.visibility, 'public'));
    }

    if (params) {
      if (params.keyword) {
        const kw = `%${params.keyword.toLowerCase()}%`;
        conditions.push(
          or(
            like(sql`lower(${entries.title})`, kw),
            like(sql`lower(${entries.summary})`, kw),
            like(sql`lower(${entries.content})`, kw),
          )!,
        );
      }
      if (params.entry_type && params.entry_type !== 'all') {
        conditions.push(eq(entries.entryType, params.entry_type));
      }
      if (params.visibility && params.visibility !== 'all') {
        conditions.push(eq(entries.visibility, params.visibility));
      }
      if (params.category_id && params.category_id !== 'all') {
        conditions.push(eq(entries.categoryId, Number(params.category_id)));
      }
      if (params.tag) {
        const matchingIds = await this.db
          .select({ entryId: entryTags.entryId })
          .from(entryTags)
          .innerJoin(tags, eq(entryTags.tagId, tags.id))
          .where(eq(tags.name, params.tag));
        const ids = matchingIds.map((r) => r.entryId);
        if (ids.length > 0) {
          conditions.push(inArray(entries.id, ids));
        } else {
          return { entries: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 10, totalPages: 0 };
        }
      }
    }

    const where = and(...conditions);

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    // Apply pagination
    const pg = params?.page || 1;
    const ps = params?.pageSize || 10;
    const offset = (pg - 1) * ps;
    const totalPages = Math.max(1, Math.ceil(total / ps));

    const rows = await this.db
      .select()
      .from(entries)
      .where(where)
      .orderBy(desc(entries.updatedAt))
      .limit(ps)
      .offset(offset);

    const entriesList = await this.hydrateTags(rows);
    return { entries: entriesList, total, page: pg, pageSize: ps, totalPages };
  }

  /** Backward-compatible: returns flat array for callers that don't need pagination */
  async findAll(params?: {
    keyword?: string;
    entry_type?: string;
    visibility?: string;
    category_id?: string;
    tag?: string;
    isInternal?: boolean;
  }): Promise<Entry[]> {
    const result = await this.findMany({ ...params, page: 1, pageSize: 999999 });
    return result.entries;
  }

  async create(input: CreateEntryInput, tx?: DbClient): Promise<Entry> {
    const client = tx ?? this.db;
    const now = new Date();

    // Defensive field normalization — prevent common insert failures
    // Strip null bytes (\x00) — PDF text often contains them, PostgreSQL UTF-8 rejects them (SQLSTATE 22021)
    const clean = (s: string) => (s || '').replace(/\x00/g, '');
    const safeTitle = clean(input.title || 'Untitled').slice(0, 500);
    const safeSummary = clean(input.summary || '').slice(0, 2000);
    const safeContent = clean(input.content || '');
    const safeEntryType = VALID_ENTRY_TYPES.includes(input.entry_type as any)
      ? input.entry_type
      : 'data_item';
    const safeVisibility = ['public', 'internal'].includes(input.visibility)
      ? input.visibility
      : 'internal';

    // Log the insert payload for debugging
    console.log(`[EntryRepo] Creating entry: title="${safeTitle.slice(0, 80)}" type=${safeEntryType} visibility=${safeVisibility} contentLen=${safeContent.length} categoryId=${input.category_id ?? 'null'} createdBy=${input.created_by ?? 'null'} tags=${(input.tags || []).length}`);

    try {
      const [row] = await client
        .insert(entries)
        .values({
          title: safeTitle,
          entryType: safeEntryType,
          summary: safeSummary,
          content: safeContent,
          visibility: safeVisibility,
          categoryId: input.category_id ?? null,
          createdBy: input.created_by ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Insert tag associations
      if (input.tags && input.tags.length > 0) {
        for (const tagName of input.tags) {
          await client.insert(tags).values({ name: tagName }).onConflictDoNothing();
          const [tag] = await client
            .select({ id: tags.id })
            .from(tags)
            .where(eq(tags.name, tagName))
            .limit(1);
          if (tag) {
            await client.insert(entryTags).values({ entryId: row.id, tagId: tag.id });
          }
        }
      }

      const hydrated = await this.hydrateTags([row]);
      console.log(`[EntryRepo] Created entry #${row.id}`);
      return hydrated[0];
    } catch (err: any) {
      // Full diagnostic logging for database errors
      console.error('[EntryRepo] INSERT FAILED:');
      console.error('  Message:', err.message);
      console.error('  Code:', err.code);
      console.error('  Detail:', err.detail);
      console.error('  Constraint:', err.constraint);
      console.error('  Table:', err.table);
      console.error('  Column:', err.column);
      console.error('  Payload:', JSON.stringify({
        title: safeTitle.slice(0, 100),
        entryType: safeEntryType,
        summaryLen: safeSummary.length,
        contentLen: safeContent.length,
        visibility: safeVisibility,
        categoryId: input.category_id,
        createdBy: input.created_by,
        tagsCount: input.tags?.length,
      }));
      throw err; // Re-throw for upstream handling
    }
  }

  async update(id: number, input: UpdateEntryInput): Promise<Entry> {
    return this.db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updateData.title = input.title;
      if (input.entry_type !== undefined) updateData.entryType = input.entry_type;
      if (input.summary !== undefined) updateData.summary = input.summary;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.visibility !== undefined) updateData.visibility = input.visibility;
      if (input.category_id !== undefined) updateData.categoryId = input.category_id;

      await tx.update(entries).set(updateData).where(eq(entries.id, id));

      // Sync tags
      if (input.tags !== undefined) {
        await tx.delete(entryTags).where(eq(entryTags.entryId, id));
        for (const tagName of input.tags) {
          await tx.insert(tags).values({ name: tagName }).onConflictDoNothing();
          const [tag] = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(eq(tags.name, tagName))
            .limit(1);
          if (tag) {
            await tx.insert(entryTags).values({ entryId: id, tagId: tag.id });
          }
        }
      }

      const [row] = await tx.select().from(entries).where(eq(entries.id, id)).limit(1);
      const hydrated = await this.hydrateTags([row]);
      return hydrated[0];
    });
  }

  async softDelete(id: number): Promise<void> {
    await this.db
      .update(entries)
      .set({ deletedAt: new Date() })
      .where(eq(entries.id, id));
  }

  /** Hard delete (cascade handles related tables) */
  async delete(id: number): Promise<void> {
    await this.db.delete(entries).where(eq(entries.id, id));
  }

  async count(isInternal = false): Promise<number> {
    const conditions = [isNull(entries.deletedAt)];
    if (!isInternal) conditions.push(eq(entries.visibility, 'public'));

    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(and(...conditions));
    return Number(result[0]?.count ?? 0);
  }
}

export const entryRepository = new EntryRepository();
