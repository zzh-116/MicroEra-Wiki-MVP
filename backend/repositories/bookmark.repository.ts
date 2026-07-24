import { BaseRepository } from './base.js';
import { bookmarks, entries } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { entryRepository } from './entry.repository.js';
import type { Bookmark, Entry } from '../types.js';

export class BookmarkRepository extends BaseRepository {
  /** List all entries bookmarked by a user, ordered by bookmark creation time (newest first) */
  async findByUser(userId: number): Promise<Entry[]> {
    const rows = await this.db
      .select({ entryId: bookmarks.entryId })
      .from(bookmarks)
      .innerJoin(entries, eq(bookmarks.entryId, entries.id))
      .where(and(eq(bookmarks.userId, userId), isNull(entries.deletedAt)))
      .orderBy(desc(bookmarks.createdAt));

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.entryId);
    return entryRepository.findByIds(ids);
  }

  /** Add a bookmark. Returns the bookmark record. Idempotent — ignores duplicates. */
  async add(userId: number, entryId: number): Promise<Bookmark> {
    const now = new Date();
    await this.db
      .insert(bookmarks)
      .values({ userId, entryId, createdAt: now })
      .onConflictDoNothing();
    return { userId, entryId, createdAt: now.toISOString() };
  }

  /** Remove a bookmark */
  async remove(userId: number, entryId: number): Promise<void> {
    await this.db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.entryId, entryId)));
  }

  /** Check if a user has bookmarked an entry */
  async isBookmarked(userId: number, entryId: number): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.entryId, entryId)))
      .limit(1);
    return rows.length > 0;
  }

  /** Count bookmarks for a user */
  async count(userId: number): Promise<number> {
    const rows = await this.db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));
    return rows.length;
  }
}

export const bookmarkRepository = new BookmarkRepository();
