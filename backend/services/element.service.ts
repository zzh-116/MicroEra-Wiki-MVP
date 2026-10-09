// Element service (P2-02) — ties layout extraction to persisted document
// elements and exposes the image/table/OCR queries the doc.images, doc.tables,
// and doc.ocr operations need.
import fs from 'node:fs';
import path from 'node:path';
import { documentElementRepository } from '../repositories/document-element.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { extractElements } from '../parser/elements.js';
import { getParser } from '../parser/factory.js';
import { config } from '../config.js';
import { ServiceError } from './knowledge.service.js';

export interface ImageItem {
  src: string;
  alt: string;
  start_line: number;
  end_line: number;
  start_char: number;
  end_char: number;
}

export interface TableItem {
  headers: string[];
  rows: string[][];
  raw: string;
  start_line: number;
  end_line: number;
  start_char: number;
  end_char: number;
}

export interface OcrImageResult {
  src: string;
  status: 'ok' | 'unavailable' | 'missing';
  text?: string;
}

export class ElementService {
  /** Extract layout elements from parsed markdown and persist them. */
  async extractAndSave(documentId: number, markdown: string): Promise<number> {
    const elements = extractElements(markdown);
    await documentElementRepository.saveElements(documentId, elements);
    return elements.length;
  }

  async listImages(documentId: number): Promise<{ doc_id: number; items: ImageItem[] }> {
    const rows = await documentElementRepository.listByDocument(documentId, 'image');
    const items: ImageItem[] = rows.map((r) => ({
      src: String(r.content.src ?? ''),
      alt: String(r.content.alt ?? ''),
      start_line: r.start_line ?? 0,
      end_line: r.end_line ?? 0,
      start_char: r.start_char ?? 0,
      end_char: r.end_char ?? 0,
    }));
    return { doc_id: documentId, items };
  }

  async listTables(documentId: number): Promise<{ doc_id: number; items: TableItem[] }> {
    const rows = await documentElementRepository.listByDocument(documentId, 'table');
    const items: TableItem[] = rows.map((r) => ({
      headers: (r.content.headers as string[]) ?? [],
      rows: (r.content.rows as string[][]) ?? [],
      raw: String(r.content.raw ?? ''),
      start_line: r.start_line ?? 0,
      end_line: r.end_line ?? 0,
      start_char: r.start_char ?? 0,
      end_char: r.end_char ?? 0,
    }));
    return { doc_id: documentId, items };
  }

  /**
   * Re-run OCR on a document's embedded images. Resolves each blob ref to a
   * local file and delegates to the parser (Docling OCR). Degrades gracefully:
   * a missing Docling install yields per-image `unavailable` rather than a crash.
   */
  async ocr(documentId: number): Promise<{ doc_id: number; ocr_status: string; images: OcrImageResult[] }> {
    if (!(await knowledgeRepository.findDocumentById(documentId))) {
      throw new ServiceError('resource_not_found', `document ${documentId} not found`);
    }
    const rows = await documentElementRepository.listByDocument(documentId, 'image');
    const images: OcrImageResult[] = [];

    if (rows.length === 0) {
      return { doc_id: documentId, ocr_status: 'no_images', images };
    }

    const parser = getParser();
    const available = await parser.isAvailable();

    for (const row of rows) {
      const src = String(row.content.src ?? '');
      const imagePath = resolveImagePath(src);
      if (!imagePath || !fs.existsSync(imagePath)) {
        images.push({ src, status: 'missing' });
        continue;
      }
      if (!available) {
        images.push({ src, status: 'unavailable' });
        continue;
      }
      try {
        const result = await parser.parseFile(imagePath);
        images.push({ src, status: 'ok', text: result.markdown });
      } catch {
        images.push({ src, status: 'unavailable' });
      }
    }

    const allOk = images.every((i) => i.status === 'ok');
    return { doc_id: documentId, ocr_status: allOk ? 'completed' : 'partial', images };
  }
}

/** Resolve a `/api/images/<name>` blob ref to its local file path. */
function resolveImagePath(src: string): string | null {
  const m = src.match(/^\/api\/images\/([^/?#]+)/);
  if (!m) return null;
  return path.join(config.dataDir, 'images', m[1]);
}

export const elementService = new ElementService();
