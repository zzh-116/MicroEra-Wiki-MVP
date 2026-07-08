import { BaseRepository } from './base.js';
import { wikiFiles, entries } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { WikiFile } from '../types.js';

function toWikiFile(f: typeof wikiFiles.$inferSelect): WikiFile {
  return {
    id: f.id,
    entry_id: f.entryId,
    original_filename: f.originalFilename,
    stored_filename: f.storedFilename,
    file_type: f.fileType,
    file_size: f.fileSize,
    storage_path: f.storagePath,
    usage_type: f.usageType,
    created_at: f.createdAt.toISOString(),
  };
}

export class FileRepository extends BaseRepository {
  async findByEntryId(entryId?: number, isInternal = false): Promise<WikiFile[]> {
    let query = this.db.select().from(wikiFiles);

    if (entryId !== undefined) {
      query = query.where(eq(wikiFiles.entryId, entryId));
    }

    // Visibility filtering
    if (!isInternal) {
      const publicEntryIds = await this.db
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.visibility, 'public'));
      const ids = publicEntryIds.map((e) => e.id);
      if (ids.length > 0) {
        query = query.where(inArray(wikiFiles.entryId, ids));
      } else {
        return [];
      }
    }

    const rows = await query;
    return rows.map(toWikiFile);
  }

  async create(input: {
    name: string;
    size: number;
    type: string;
    entryId: number;
    usageType: string;
  }): Promise<WikiFile> {
    const stored = Math.random().toString(36).substring(2, 10);
    const [row] = await this.db
      .insert(wikiFiles)
      .values({
        entryId: input.entryId,
        originalFilename: input.name,
        storedFilename: stored,
        fileType: input.type,
        fileSize: input.size,
        storagePath: `/uploads/images/${stored}`,
        usageType: input.usageType,
      })
      .returning();
    return toWikiFile(row);
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(wikiFiles).where(eq(wikiFiles.id, id));
  }
}

export const fileRepository = new FileRepository();
