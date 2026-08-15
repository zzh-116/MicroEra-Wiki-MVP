import { BaseRepository } from './base.js';
import { wikiFiles, entries } from '../db/schema.js';
import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { WikiFile } from '../types.js';

export interface FileCreateInput {
  name: string;
  size: number;
  type: string;
  entryId: number;
  usageType: string;
  storagePath?: string | null;
  objectKey?: string | null;
  objectBucket?: string | null;
  sha256?: string | null;
  contentType?: string | null;
}

function toWikiFile(f: typeof wikiFiles.$inferSelect): WikiFile {
  return {
    id: f.id,
    entry_id: f.entryId,
    original_filename: f.originalFilename,
    stored_filename: f.storedFilename,
    file_type: f.fileType,
    file_size: f.fileSize,
    storage_path: f.storagePath,
    object_key: f.objectKey,
    object_bucket: f.objectBucket,
    sha256: f.sha256,
    content_type: f.contentType,
    usage_type: f.usageType,
    created_at: f.createdAt.toISOString(),
  };
}

export class FileRepository extends BaseRepository {
  async findByEntryId(entryId?: number, isInternal = false): Promise<WikiFile[]> {
    const conditions: SQL[] = [];
    if (entryId !== undefined) {
      conditions.push(eq(wikiFiles.entryId, entryId));
    }

    // Visibility filtering
    if (!isInternal) {
      const publicEntryIds = await this.db
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.visibility, 'public'));
      const ids = publicEntryIds.map((e) => e.id);
      if (ids.length > 0) {
        conditions.push(inArray(wikiFiles.entryId, ids));
      } else {
        return [];
      }
    }

    const rows =
      conditions.length > 0
        ? await this.db.select().from(wikiFiles).where(and(...conditions))
        : await this.db.select().from(wikiFiles);
    return rows.map(toWikiFile);
  }

  async findById(id: number): Promise<WikiFile | undefined> {
    const rows = await this.db
      .select()
      .from(wikiFiles)
      .where(eq(wikiFiles.id, id))
      .limit(1);
    return rows[0] ? toWikiFile(rows[0]) : undefined;
  }

  /** Resolve one file with entry visibility and soft-delete checks applied. */
  async findByIdForUser(id: number, isInternal = false): Promise<WikiFile | undefined> {
    const rows = await this.db
      .select({ file: wikiFiles, entry: entries })
      .from(wikiFiles)
      .innerJoin(entries, eq(wikiFiles.entryId, entries.id))
      .where(and(eq(wikiFiles.id, id), isNull(entries.deletedAt)))
      .limit(1);
    if (!rows[0]) return undefined;
    if (!isInternal && rows[0].entry.visibility !== 'public') return undefined;
    return toWikiFile(rows[0].file);
  }

  async create(input: FileCreateInput): Promise<WikiFile> {
    const stored = Math.random().toString(36).substring(2, 10);
    const [row] = await this.db
      .insert(wikiFiles)
      .values({
        entryId: input.entryId,
        originalFilename: input.name,
        storedFilename: stored,
        fileType: input.type,
        fileSize: input.size,
        storagePath: input.storagePath ?? `/uploads/images/${stored}`,
        objectKey: input.objectKey ?? null,
        objectBucket: input.objectBucket ?? null,
        sha256: input.sha256 ?? null,
        contentType: input.contentType ?? null,
        usageType: input.usageType,
      })
      .returning();
    return toWikiFile(row);
  }

  /** Record object storage metadata after the actual upload to MinIO. */
  async updateStorageMeta(
    id: number,
    meta: {
      objectKey: string;
      objectBucket: string;
      sha256?: string | null;
      contentType?: string | null;
    },
  ): Promise<WikiFile | undefined> {
    const [row] = await this.db
      .update(wikiFiles)
      .set({
        objectKey: meta.objectKey,
        objectBucket: meta.objectBucket,
        sha256: meta.sha256 ?? null,
        contentType: meta.contentType ?? null,
      })
      .where(eq(wikiFiles.id, id))
      .returning();
    return row ? toWikiFile(row) : undefined;
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(wikiFiles).where(eq(wikiFiles.id, id));
  }
}

export const fileRepository = new FileRepository();
