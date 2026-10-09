// Layout-aware parsed elements (P2-02).
// Extracts headings, tables, images, and page markers from parsed Markdown with
// source coordinates (line + char offsets). The image `src` is a blob reference
// — typically `/api/images/<file>` produced by the parser's base64 extractor.
// Pure and dependency-free so it is trivially testable and reusable by the
// ingest orchestration (P2-05).

export type ElementType = 'heading' | 'table' | 'image' | 'page';

export interface HeadingContent {
  level: number;
  text: string;
}

export interface TableContent {
  headers: string[];
  rows: string[][];
  raw: string;
}

export interface ImageContent {
  src: string;   // blob ref (e.g. /api/images/img_....png) or absolute URL
  alt: string;
}

export interface PageContent {
  pageNumber: number;
}

export interface ParsedElement {
  type: ElementType;
  position: number;
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
  content: HeadingContent | TableContent | ImageContent | PageContent;
}

/** Match `![alt](src)` where src is a path or URL (no data: URIs). */
const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
/** Match a bare image path reference the base64 extractor leaves behind. */
const BARE_IMAGE_RE = /\/api\/images\/[A-Za-z0-9_.-]+/g;
/** Common page markers emitted by Docling and other converters. */
const PAGE_MARKER_RE = /^\s*(?:<!--\s*page\s*[:#-]?\s*(\d+)\s*-->|\[Page\s+(\d+)\])\s*$/i;

/** True when a line begins a markdown table row. */
function isTableLine(line: string): boolean {
  return line.startsWith('|') && line.includes('|');
}

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/**
 * Extract layout elements from parsed Markdown. Line numbers are 1-based and
 * char offsets 0-based, so downstream consumers can highlight the exact source
 * span each element came from.
 */
export function extractElements(markdown: string): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const lines = markdown.split('\n');
  let charOffset = 0;
  let i = 0;

  const push = (
    type: ElementType,
    startLine: number,
    endLine: number,
    startChar: number,
    endChar: number,
    content: ParsedElement['content'],
  ): void => {
    elements.push({
      type,
      position: elements.length,
      startLine,
      endLine,
      startChar,
      endChar,
      content,
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = charOffset;

    // Page markers
    const pageMatch = line.match(PAGE_MARKER_RE);
    if (pageMatch) {
      const pageNumber = Number(pageMatch[1] ?? pageMatch[2]);
      push('page', i + 1, i + 1, lineStart, lineStart + line.length, { pageNumber });
      charOffset += line.length + 1;
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      push('heading', i + 1, i + 1, lineStart, lineStart + line.length, {
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      charOffset += line.length + 1;
      i++;
      continue;
    }

    // Tables: group consecutive table lines into one element
    if (isTableLine(line)) {
      const startLine = i + 1;
      const startChar = lineStart;
      const blockLines: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        blockLines.push(lines[i]);
        charOffset += lines[i].length + 1;
        i++;
      }
      const raw = blockLines.join('\n');
      const rows = blockLines.map(parseTableRow).filter((c) => c.length > 0);
      // Skip the separator row (|---|) to derive headers + data rows.
      const dataRows = rows.filter((c) => !isSeparatorRow(c));
      const headers = dataRows.length > 0 ? dataRows[0] : [];
      const body = dataRows.slice(1);
      push('table', startLine, startLine + blockLines.length - 1, startChar, charOffset - 1, {
        headers,
        rows: body,
        raw,
      });
      continue;
    }

    // Images (markdown syntax + bare /api/images/ refs on the same line)
    const imageContents: ImageContent[] = [];
    const mdImages = [...line.matchAll(IMAGE_MD_RE)];
    for (const m of mdImages) {
      const src = m[2];
      if (!src.startsWith('data:')) imageContents.push({ src, alt: m[1]?.trim() ?? '' });
    }
    for (const m of line.matchAll(BARE_IMAGE_RE)) {
      const src = m[0];
      if (!imageContents.some((c) => c.src === src)) imageContents.push({ src, alt: '' });
    }
    for (const content of imageContents) {
      push('image', i + 1, i + 1, lineStart, lineStart + line.length, content);
    }

    charOffset += line.length + 1;
    i++;
  }

  return elements;
}
