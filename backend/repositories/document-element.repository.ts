// Document element repository — persists layout-aware parsed elements
// (headings, tables, images, page markers) for a knowledge document (P2-02).
import { BaseRepository, DbClient } from './base.js';
import { documentElements } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ParsedElement, ElementType } from '../parser/elements.js';

export interface ElementRow {
  id: number;
  document_id: number;
  element_type: string;
  position: number;
  content: Record<string, unknown>;
  start_char: number | null;
  end_char: number | null;
  start_line: number | null;
  end_line: number | null;
  created_at: string;
}

function toRow(r: typeof documentElements.$inferSelect): ElementRow {
  return {
    id: r.id,
    document_id: r.documentId,
    element_type: r.elementType,
    position: r.position,
    content: (r.content ?? {}) as Record<string, unknown>,
    start_char: r.startChar,
    end_char: r.endChar,
    start_line: r.startLine,
    end_line: r.endLine,
    created_at: r.createdAt.toISOString(),
  };
}

export class DocumentElementRepository extends BaseRepository {
  /** Replace all elements for a document (extraction is idempotent). */
  async saveElements(documentId: number, elements: ParsedElement[], tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(documentElements).where(eq(documentElements.documentId, documentId));
    if (elements.length === 0) return;
    await client.insert(documentElements).values(
      elements.map((e) => ({
        documentId,
        elementType: e.type,
        position: e.position,
        content: e.content as Record<string, unknown>,
        startChar: e.startChar,
        endChar: e.endChar,
        startLine: e.startLine,
        endLine: e.endLine,
      })),
    );
  }

  async listByDocument(documentId: number, type?: ElementType): Promise<ElementRow[]> {
    const rows = await this.db.select().from(documentElements).where(eq(documentElements.documentId, documentId));
    const filtered = type ? rows.filter((r) => r.elementType === type) : rows;
    return filtered
      .sort((a, b) => a.position - b.position)
      .map(toRow);
  }

  async deleteByDocument(documentId: number, tx?: DbClient): Promise<void> {
    const client = tx ?? this.db;
    await client.delete(documentElements).where(eq(documentElements.documentId, documentId));
  }
}

export const documentElementRepository = new DocumentElementRepository();
