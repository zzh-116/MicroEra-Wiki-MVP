// Document-image ownership repository (P1-B).
//
// `document_images` is the sole trusted authority for image ↔ document
// ownership. Rows are written ONLY by the parse pipeline via `registerImages`,
// never derived from user-editable `documents.content`, so pasting an
// `/api/images/<name>` URL into a document body cannot grant access.
// `isImageAccessible` joins through `documents` and additionally requires the
// document AND its parent knowledge base to be active (deleted_at IS NULL) —
// the same predicate used everywhere else in the knowledge domain.
import { BaseRepository, DbClient } from './base.js';
import { documentImages, documents, knowledgeBases } from '../db/schema.js';
import { and, eq, exists, isNull, sql, type SQLWrapper } from 'drizzle-orm';

export interface DocumentImageRow {
  id: number;
  document_id: number;
  image_name: string;
  created_at: string;
}

function toRow(r: typeof documentImages.$inferSelect): DocumentImageRow {
  return {
    id: r.id,
    document_id: r.documentId,
    image_name: r.imageName,
    created_at: r.createdAt.toISOString(),
  };
}

export class DocumentImageRepository extends BaseRepository {
  private parentKbActive(kbId: SQLWrapper): ReturnType<typeof exists> {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, kbId), isNull(knowledgeBases.deletedAt))),
    );
  }

  /**
   * Trusted write path (P1-B): record that a parse pipeline extracted
   * `imageNames` from `documentId`. Idempotent under the UNIQUE(document_id,
   * image_name) constraint, so re-parses and retries cannot double-register.
   * Only the parser/import pipeline may call this — never doc_update or content
   * editing.
   */
  async registerImages(documentId: number, imageNames: string[], tx?: DbClient): Promise<void> {
    if (imageNames.length === 0) return;
    const client = tx ?? this.db;
    await client
      .insert(documentImages)
      .values(imageNames.map((imageName) => ({ documentId, imageName })))
      .onConflictDoNothing();
  }

  /** True when `imageName` is owned by an active document in an active KB. */
  async isImageAccessible(imageName: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: documentImages.id })
      .from(documentImages)
      .innerJoin(documents, eq(documents.id, documentImages.documentId))
      .where(
        and(
          eq(documentImages.imageName, imageName),
          isNull(documents.deletedAt),
          this.parentKbActive(documents.kbId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Images owned by a single document (reports / re-parse replace). */
  async listByDocument(documentId: number): Promise<DocumentImageRow[]> {
    const rows = await this.db
      .select()
      .from(documentImages)
      .where(eq(documentImages.documentId, documentId));
    return rows.map(toRow);
  }

  /** Drop all ownership rows for a document (failure cleanup / re-parse). */
  async removeByDocument(documentId: number, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(documentImages).where(eq(documentImages.documentId, documentId));
  }

  /** Every registered image name (orphan-GC / historical report). */
  async allImageNames(): Promise<string[]> {
    const rows = await this.db
      .select({ imageName: documentImages.imageName })
      .from(documentImages);
    return rows.map((r) => r.imageName);
  }
}

export const documentImageRepository = new DocumentImageRepository();
