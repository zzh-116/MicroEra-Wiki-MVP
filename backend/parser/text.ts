// TextFallbackParser — dependency-free adapter for text-based formats.
// It never shells out to Docling, so knowledge ingestion keeps working for
// Markdown / plain-text / CSV / HTML-as-text even when Docling is not
// installed. Binary formats (PDF/DOCX/...) are refused with a clear error so
// callers can decide whether to require Docling.
//
// Content integrity (P01): every result carries the sha256 of the raw source
// bytes, so re-imports can be de-duplicated and integrity-checked.
import fs from 'node:fs';
import path from 'node:path';
import { type DocumentParser } from './base.js';
import {
  type InputFormat,
  type ParseOptions,
  type ParseResult,
  type ParseMetadata,
  type ParserCapability,
  ParserError,
} from './models.js';
import { sha256Buffer, sha256 } from '../utils/hash.js';

/** Text formats handled by this adapter without Docling. */
const TEXT_FORMATS: Set<InputFormat> = new Set(['md', 'txt', 'csv', 'asciidoc', 'html']);

const MIME: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  asciidoc: 'text/asciidoc',
  html: 'text/html',
};

function detectFormat(fileName: string): InputFormat {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, InputFormat> = {
    '.md': 'md', '.markdown': 'md', '.txt': 'txt', '.csv': 'csv',
    '.adoc': 'asciidoc', '.asciidoc': 'asciidoc', '.html': 'html', '.htm': 'html',
    // Binary/image formats are recognized so the adapter can refuse them
    // instead of silently decoding bytes as text.
    '.pdf': 'pdf', '.docx': 'docx', '.doc': 'docx', '.pptx': 'pptx', '.ppt': 'pptx',
    '.xlsx': 'xlsx', '.xls': 'xlsx', '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpeg',
    '.gif': 'gif', '.webp': 'webp',
  };
  return map[ext] ?? 'txt';
}

function mimeFor(format: InputFormat): string {
  return MIME[format] ?? 'text/plain';
}

function countWords(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  return cjk + latin;
}

/**
 * Strip the outer HTML shell down to readable text. This is a lossy fallback,
 * not a structured converter — Docling remains the structured HTML path. It is
 * deterministic and sufficient for plain-HTML knowledge sources.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class TextFallbackParser implements DocumentParser {
  readonly name = 'TextFallback';
  readonly version = '1.0';

  getCapabilities(): ParserCapability[] {
    return [
      { format: 'md', extensions: ['.md', '.markdown'], description: 'Markdown (native)', available: true },
      { format: 'txt', extensions: ['.txt'], description: 'Plain text', available: true },
      { format: 'csv', extensions: ['.csv'], description: 'CSV data files', available: true },
      { format: 'asciidoc', extensions: ['.adoc', '.asciidoc'], description: 'AsciiDoc documents', available: true },
      { format: 'html', extensions: ['.html', '.htm'], description: 'HTML (lossy text fallback)', available: true },
    ];
  }

  detectFormat(fileName: string): InputFormat {
    return detectFormat(fileName);
  }

  async isAvailable(): Promise<boolean> {
    return true; // no external dependency
  }

  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParseResult> {
    const t0 = performance.now();
    if (!fs.existsSync(filePath)) {
      throw new ParserError(`File not found: ${filePath}`, 'FILE_NOT_FOUND', path.basename(filePath));
    }
    const stat = fs.statSync(filePath);
    const maxSize = options.maxFileSize || 50 * 1024 * 1024;
    if (stat.size > maxSize) {
      throw new ParserError(`File too large: ${stat.size} bytes`, 'FILE_TOO_LARGE', path.basename(filePath));
    }
    const bytes = fs.readFileSync(filePath);
    if (bytes.length === 0) {
      throw new ParserError(`File is empty: ${path.basename(filePath)}`, 'EMPTY_FILE', path.basename(filePath));
    }
    const fileName = path.basename(filePath);
    const format = options.format && options.format !== 'auto' ? options.format : detectFormat(fileName);
    if (!TEXT_FORMATS.has(format)) {
      throw new ParserError(
        `Text fallback cannot parse ${format.toUpperCase()} — use the Docling adapter`,
        'UNSUPPORTED_FORMAT', fileName, format,
        'Install Docling (pip install docling) for binary formats.',
      );
    }
    const content = bytes.toString('utf-8').replace(/\x00/g, '');
    if (!content.trim()) {
      throw new ParserError(`File is empty: ${fileName}`, 'EMPTY_FILE', fileName, format);
    }
    const markdown = format === 'html' ? htmlToText(content) : content;
    const detectMs = performance.now() - t0;
    const metadata: ParseMetadata = {
      fileName,
      fileSize: stat.size,
      mimeType: mimeFor(format),
      wordCount: countWords(markdown),
      parsedAt: new Date().toISOString(),
    };
    const totalMs = Math.round((performance.now() - t0) * 100) / 100;
    return {
      markdown,
      sourceFormat: format,
      checksum: sha256Buffer(bytes),
      metadata,
      warnings: format === 'html' ? ['HTML parsed via lossy text fallback (Docling not used)'] : [],
      timing: { detectMs: Math.round(detectMs * 100) / 100, parseMs: Math.round((totalMs - detectMs) * 100) / 100, totalMs },
    };
  }

  async parseString(content: string, fileName = 'input.md', options: ParseOptions = {}): Promise<ParseResult> {
    const format = options.format && options.format !== 'auto' ? options.format : detectFormat(fileName);
    if (!TEXT_FORMATS.has(format)) {
      throw new ParserError(
        `Text fallback cannot parse ${format.toUpperCase()} from a string`,
        'UNSUPPORTED_FORMAT', fileName, format,
      );
    }
    if (!content || !content.trim()) {
      throw new ParserError('Content is empty', 'EMPTY_CONTENT', fileName, format);
    }
    const markdown = format === 'html' ? htmlToText(content.replace(/\x00/g, '')) : content.replace(/\x00/g, '');
    return {
      markdown,
      sourceFormat: format,
      checksum: sha256(content),
      metadata: {
        fileName,
        fileSize: Buffer.byteLength(content, 'utf-8'),
        mimeType: mimeFor(format),
        wordCount: countWords(markdown),
        parsedAt: new Date().toISOString(),
      },
      warnings: format === 'html' ? ['HTML parsed via lossy text fallback (Docling not used)'] : [],
      timing: { detectMs: 0, parseMs: 0, totalMs: 0 },
    };
  }

  async parseBuffer(buffer: Buffer, fileName: string, options: ParseOptions = {}): Promise<ParseResult> {
    if (!buffer || buffer.length === 0) {
      throw new ParserError('Upload buffer is empty', 'EMPTY_BUFFER', fileName);
    }
    const format = options.format && options.format !== 'auto' ? options.format : detectFormat(fileName);
    const result = await this.parseString(buffer.toString('utf-8'), fileName, options);
    return { ...result, checksum: sha256Buffer(buffer), metadata: { ...result.metadata, fileSize: buffer.length } };
  }
}

export const textFallbackParser = new TextFallbackParser();
