// Parser Service — MarkItDown concept: convert multiple formats into unified Markdown
// Supports: PDF, DOCX (Word), Markdown, Plain Text, image metadata extraction
//
// Dependencies (install as needed):
//   npm install pdf-parse mammoth
// These are optional — the parser gracefully degrades if they're not installed.

import fs from 'node:fs';
import path from 'node:path';
import { markdownParser } from './markdown.js';
import type { ParsedProperty } from '../types.js';

// ---- Supported input formats ----

export type InputFormat = 'pdf' | 'docx' | 'md' | 'txt' | 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp' | 'auto';

export interface ParseOptions {
  /** Override auto-detected format */
  format?: InputFormat;
  /** Extract structured properties from markdown tables (for .md files) */
  extractProperties?: boolean;
  /** Max file size in bytes (default 50MB) */
  maxFileSize?: number;
}

export interface ParseResult {
  /** Unified markdown content */
  markdown: string;
  /** Original format */
  sourceFormat: InputFormat;
  /** File metadata */
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    pageCount?: number;
    wordCount?: number;
    parsedAt: string;
  };
  /** Structured properties extracted from markdown tables (only for .md with extractProperties) */
  properties?: ParsedProperty[];
  /** Any warnings during parsing */
  warnings: string[];
}

// ---- Format detection ----

function detectFormat(fileName: string): InputFormat {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.pdf':  return 'pdf';
    case '.docx': return 'docx';
    case '.doc':  return 'docx';
    case '.md':   return 'md';
    case '.txt':  return 'txt';
    case '.png':  return 'png';
    case '.jpg':  return 'jpg';
    case '.jpeg': return 'jpeg';
    case '.gif':  return 'gif';
    case '.webp': return 'webp';
    default:      return 'txt';
  }
}

function mimeTypeFor(format: InputFormat): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return map[format] || 'application/octet-stream';
}

// ---- Parser implementations ----

async function tryLoadModule(name: string): Promise<any> {
  try {
    return await import(name);
  } catch {
    return null;
  }
}

async function parsePdf(filePath: string, warnings: string[]): Promise<string> {
  const pdfParse = await tryLoadModule('pdf-parse');
  if (!pdfParse) {
    warnings.push('pdf-parse not installed; reading PDF as raw text. Install: npm install pdf-parse');
    // Fallback: try to read as raw text (may get some text from simple PDFs)
    const raw = fs.readFileSync(filePath, 'utf-8');
    return extractReadableText(raw);
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse.default(buffer);
  const text = data.text || '';

  // Build a structured markdown from PDF content
  let md = '';
  if (data.info?.Title) md += `# ${data.info.Title}\n\n`;
  if (data.numpages) md += `> ${data.numpages} pages\n\n`;
  md += text;
  return md;
}

async function parseDocx(filePath: string, warnings: string[]): Promise<string> {
  const mammoth = await tryLoadModule('mammoth');
  if (!mammoth) {
    warnings.push('mammoth not installed; reading DOCX as raw text. Install: npm install mammoth');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return extractReadableText(raw);
  }

  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.convertToMarkdown({ buffer });
  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      warnings.push(`mammoth: [${msg.type}] ${msg.message}`);
    }
  }
  return result.value || '';
}

function parseMarkdown(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function parseText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Parse image files — extracts basic metadata and creates a markdown description.
 * For actual OCR/image understanding, you'd use a vision model (e.g., Ollama llava).
 */
function parseImage(filePath: string, fileName: string, fileSize: number): string {
  // Try to get image dimensions using a lightweight approach
  let dimensions = '';
  try {
    const buf = fs.readFileSync(filePath);
    if (fileName.endsWith('.png')) {
      // PNG: width at offset 16, height at offset 20 (big-endian uint32)
      if (buf.length > 24) {
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        dimensions = ` (${w}×${h}px)`;
      }
    }
  } catch {
    // Ignore dimension extraction failures
  }

  return `# ${fileName}\n\n> Image file${dimensions}, ${formatFileSize(fileSize)}\n\n*This image requires OCR or vision-model processing to extract textual content.*`;
}

// ---- Utility ----

function extractReadableText(raw: string): string {
  // Extract printable ASCII/UTF-8 runs from binary
  const readable = raw.replace(/[^\x20-\x7E一-鿿　-〿＀-￯\n\r\t]/g, '');
  return readable.trim() || '(No readable text extracted — this file may be binary-only.)';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countWords(text: string): number {
  // Count both CJK characters and space-separated words
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const words = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  return cjk + words;
}

// ---- Main Parser Service ----

export class ParserService {
  /**
   * Parse a file — auto-detect format and convert to unified markdown.
   */
  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParseResult> {
    const maxSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB default
    const warnings: string[] = [];

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size > maxSize) {
      throw new Error(`File too large: ${formatFileSize(stat.size)} (max: ${formatFileSize(maxSize)})`);
    }

    const fileName = path.basename(filePath);
    const format = options.format === 'auto' || !options.format
      ? detectFormat(fileName)
      : options.format;

    let markdown: string;

    switch (format) {
      case 'pdf':
        markdown = await parsePdf(filePath, warnings);
        break;
      case 'docx':
        markdown = await parseDocx(filePath, warnings);
        break;
      case 'md':
        markdown = parseMarkdown(filePath);
        break;
      case 'txt':
        markdown = parseText(filePath);
        break;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        markdown = parseImage(filePath, fileName, stat.size);
        break;
      default:
        markdown = parseText(filePath);
        warnings.push(`Unknown format "${format}", treated as plain text`);
    }

    // Extract structured properties from markdown tables
    let properties: ParsedProperty[] | undefined;
    if (options.extractProperties && (format === 'md' || format === 'txt')) {
      try {
        properties = markdownParser.parse(markdown);
        if (properties.length > 0) {
          warnings.push(`Extracted ${properties.length} structured properties from tables`);
        }
      } catch (err: any) {
        warnings.push(`Property extraction failed: ${err.message}`);
      }
    }

    return {
      markdown,
      sourceFormat: format,
      metadata: {
        fileName,
        fileSize: stat.size,
        mimeType: mimeTypeFor(format),
        wordCount: countWords(markdown),
        parsedAt: new Date().toISOString(),
      },
      properties,
      warnings,
    };
  }

  /**
   * Parse raw content string (from API upload).
   */
  async parseString(content: string, fileName: string = 'input.md', options: ParseOptions = {}): Promise<ParseResult> {
    const format = options.format === 'auto' || !options.format
      ? detectFormat(fileName)
      : options.format;

    const warnings: string[] = [];
    let markdown = content;

    // If format is non-text, we can't really parse raw content — it should be a buffer
    if (['pdf', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(format)) {
      warnings.push(`Cannot parse binary format "${format}" from string content — treating as plain text`);
    }

    let properties: ParsedProperty[] | undefined;
    if (options.extractProperties) {
      try {
        properties = markdownParser.parse(markdown);
      } catch (err: any) {
        warnings.push(`Property extraction failed: ${err.message}`);
      }
    }

    return {
      markdown,
      sourceFormat: format as InputFormat,
      metadata: {
        fileName,
        fileSize: Buffer.byteLength(content, 'utf-8'),
        mimeType: mimeTypeFor(format),
        wordCount: countWords(markdown),
        parsedAt: new Date().toISOString(),
      },
      properties,
      warnings,
    };
  }

  /**
   * Parse a buffer (for multipart uploads).
   */
  async parseBuffer(
    buffer: Buffer,
    fileName: string,
    options: ParseOptions = {}
  ): Promise<ParseResult> {
    // Write to temp file, then parse
    const tmpDir = './backend/data/tmp';
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}_${fileName}`);
    fs.writeFileSync(tmpPath, buffer);

    try {
      const result = await this.parseFile(tmpPath, options);
      return result;
    } finally {
      // Cleanup temp file
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  /**
   * Detect format from file extension.
   */
  detectFormat(fileName: string): InputFormat {
    return detectFormat(fileName);
  }
}

export const parserService = new ParserService();
