import { BaseRepository } from './base.js';
import { tags, entryTags } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { Tag } from '../types.js';

export class TagRepository extends BaseRepository {
  async findAll(): Promise<Tag[]> {
    const rows = await this.db.select().from(tags);
    return rows.map((t) => ({ id: t.id, name: t.name }));
  }

  /** Upsert tags by name. Returns array of tag IDs. */
  async upsert(names: string[]): Promise<number[]> {
    if (names.length === 0) return [];

    const ids: number[] = [];
    for (const name of names) {
      await this.db.insert(tags).values({ name }).onConflictDoNothing();
      const [row] = await this.db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, name))
        .limit(1);
      if (row) ids.push(row.id);
    }
    return ids;
  }

  /** Get tag IDs by names */
  async findByNames(names: string[]): Promise<Tag[]> {
    if (names.length === 0) return [];
    const rows = await this.db
      .select()
      .from(tags)
      .where(inArray(tags.name, names));
    return rows.map((t) => ({ id: t.id, name: t.name }));
  }

  /** Sync entry-tag associations (delete old, insert new) */
  async syncEntryTags(entryId: number, tagNames: string[], tx = this.db): Promise<void> {
    await tx.delete(entryTags).where(eq(entryTags.entryId, entryId));

    if (tagNames.length === 0) return;

    for (const name of tagNames) {
      await tx.insert(tags).values({ name }).onConflictDoNothing();
      const [tag] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, name))
        .limit(1);
      if (tag) {
        await tx.insert(entryTags).values({ entryId, tagId: tag.id }).onConflictDoNothing();
      }
    }
  }
}

export const tagRepository = new TagRepository();
