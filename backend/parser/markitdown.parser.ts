// MarkItDown Parser — multi-format document → unified Markdown
// Supported: PDF (pdf-parse), DOCX (mammoth), MD, TXT, images (metadata)
// Implements DocumentParser interface for pluggable architecture
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { markdownParser } from './markdown.js';
import {
  type DocumentParser,
  type InputFormat,
  type ParseOptions,
  type ParseResult,
  type ParserCapability,
  ParserError,
} from './types.js';
import type { ParsedProperty } from '../types.js';

// ---- Helpers ----

function tryLoadModule(name: string): { loaded: true; fn: any } | { loaded: false; error: string } {
  try {
    const req = createRequire(import.meta.url);
    const mod = req(name);
    const fn = typeof mod === 'function' ? mod : (mod.default || mod.PDFParse || mod);
    return { loaded: true, fn };
  } catch (e: any) {
    return { loaded: false, error: e.message };
  }
}

function detectFormat(fileName: string): InputFormat {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, InputFormat> = {
    '.pdf': 'pdf', '.docx': 'docx', '.doc': 'docx',
    '.md': 'md', '.txt': 'txt',
    '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpeg',
    '.gif': 'gif', '.webp': 'webp',
  };
  return map[ext] || 'txt';
}

function mimeTypeFor(format: InputFormat): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown', txt: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp',
  };
  return map[format] || 'application/octet-stream';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countWords(text: string): number {
  return (text.match(/[一-鿿]/g) || []).length + (text.match(/[a-zA-Z0-9]+/g) || []).length;
}

// ---- MarkItDown Parser Implementation ----

export class MarkItDownParser implements DocumentParser {
  readonly name = 'MarkItDown';

  getCapabilities(): ParserCapability[] {
    const pdf = tryLoadModule('pdf-parse');
    const docx = tryLoadModule('mammoth');

    return [
      { format: 'pdf', extensions: ['.pdf'],
        description: 'PDF documents (pdf-parse)',
        available: pdf.loaded },
      { format: 'docx', extensions: ['.docx', '.doc'],
        description: 'Word documents (mammoth)',
        available: docx.loaded },
      { format: 'md', extensions: ['.md'],
        description: 'Markdown (native)', available: true },
      { format: 'txt', extensions: ['.txt', '.csv', '.json', '.xml', '.yaml', '.yml'],
        description: 'Plain text (native)', available: true },
      { format: 'png', extensions: ['.png'],
        description: 'PNG images (metadata only)', available: true },
      { format: 'jpg', extensions: ['.jpg', '.jpeg'],
        description: 'JPEG images (metadata only)', available: true },
      { format: 'gif', extensions: ['.gif'],
        description: 'GIF images (metadata only)', available: true },
      { format: 'webp', extensions: ['.webp'],
        description: 'WebP images (metadata only)', available: true },
    ];
  }

  detectFormat(fileName: string): InputFormat {
    return detectFormat(fileName);
  }

  // ======================== Parse File ========================

  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParseResult> {
    const t0 = Date.now();
    const maxSize = options.maxFileSize || 50 * 1024 * 1024;

    // Validate
    if (!fs.existsSync(filePath)) {
      throw new ParserError(
        `File not found: ${filePath}`,
        'FILE_NOT_FOUND', path.basename(filePath),
      );
    }

    const stat = fs.statSync(filePath);
    if (stat.size > maxSize) {
      throw new ParserError(
        `File too large: ${formatFileSize(stat.size)} (max ${formatFileSize(maxSize)})`,
        'FILE_TOO_LARGE', path.basename(filePath),
      );
    }

    if (stat.size === 0) {
      throw new ParserError(
        `File is empty: ${path.basename(filePath)}`,
        'EMPTY_FILE', path.basename(filePath),
      );
    }

    const fileName = path.basename(filePath);
    const format = options.format === 'auto' || !options.format ? detectFormat(fileName) : options.format;
    const detectMs = Date.now() - t0;
    const warnings: string[] = [];

    // Parse based on format
    const parseStart = Date.now();
    let markdown: string;

    switch (format) {
      case 'pdf': {
        const pdf = tryLoadModule('pdf-parse');
        if (!pdf.loaded) {
          throw new ParserError(
            `PDF parsing requires pdf-parse. Install: npm install pdf-parse`,
            'DEPENDENCY_MISSING', fileName, 'pdf',
            'Run: npm install pdf-parse',
          );
        }
        const buffer = fs.readFileSync(filePath);
        const data = await pdf.fn(buffer);
        const text = data.text || '';
        if (!text.trim()) {
          throw new ParserError(
            `PDF extracted no text — may be scanned/image-only PDF`,
            'EMPTY_OUTPUT', fileName, 'pdf',
            'This PDF may be image-based. OCR processing is not yet supported.',
          );
        }
        markdown = '';
        if (data.info?.Title) markdown += `# ${data.info.Title}\n\n`;
        if (data.numpages) markdown += `> ${data.numpages} pages\n\n`;
        markdown += text;
        break;
      }

      case 'docx': {
        const docx = tryLoadModule('mammoth');
        if (!docx.loaded) {
          throw new ParserError(
            `DOCX parsing requires mammoth. Install: npm install mammoth`,
            'DEPENDENCY_MISSING', fileName, 'docx',
            'Run: npm install mammoth',
          );
        }
        const buffer = fs.readFileSync(filePath);
        const result = await docx.fn.convertToMarkdown({ buffer });
        for (const msg of result.messages) {
          warnings.push(`mammoth: [${msg.type}] ${msg.message}`);
        }
        markdown = result.value || '';
        if (!markdown.trim()) {
          throw new ParserError(
            `DOCX extracted no content`,
            'EMPTY_OUTPUT', fileName, 'docx',
          );
        }
        break;
      }

      case 'md':
      case 'txt':
        markdown = fs.readFileSync(filePath, 'utf-8');
        if (!markdown.trim()) {
          throw new ParserError(
            `File is empty or contains only whitespace`,
            'EMPTY_OUTPUT', fileName, format,
          );
        }
        break;

      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp': {
        let dimensions = '';
        try {
          const buf = fs.readFileSync(filePath);
          if (format === 'png' && buf.length > 24) {
            dimensions = ` (${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}px)`;
          }
        } catch { /* ignore */ }
        markdown = `# ${fileName}\n\n> Image file${dimensions}, ${formatFileSize(stat.size)}\n\n*Image — OCR/vision-model processing not configured.*`;
        warnings.push('Image OCR not available — install a vision model (e.g., Ollama llava) for text extraction');
        break;
      }

      default:
        throw new ParserError(
          `Unsupported format: ${format}`,
          'UNSUPPORTED_FORMAT', fileName, format,
          `Supported: pdf, docx, md, txt, png, jpg, gif, webp`,
        );
    }

    // Validate output
    if (!markdown || !markdown.trim()) {
      throw new ParserError(
        `Parser produced empty output for ${fileName}`,
        'EMPTY_OUTPUT', fileName, format,
      );
    }

    const parseMs = Date.now() - parseStart;

    // Extract structured properties
    let properties: ParsedProperty[] | undefined;
    if (options.extractProperties && (format === 'md' || format === 'txt')) {
      try {
        properties = markdownParser.parse(markdown);
        if (properties.length > 0) {
          warnings.push(`Extracted ${properties.length} structured properties`);
        }
      } catch (err: any) {
        warnings.push(`Property extraction skipped: ${err.message}`);
      }
    }

    // Strip null bytes — PDF text often contains \x00 which PostgreSQL UTF-8 rejects (SQLSTATE 22021)
    markdown = markdown.replace(/\x00/g, '');

    console.log(`[Parser] ${fileName} | format=${format} | size=${formatFileSize(stat.size)} | words=${countWords(markdown)} | detect=${detectMs}ms parse=${parseMs}ms | SUCCESS`);

    return {
      markdown,
      sourceFormat: format,
      metadata: {
        fileName, fileSize: stat.size, mimeType: mimeTypeFor(format),
        wordCount: countWords(markdown), parsedAt: new Date().toISOString(),
      },
      properties,
      warnings,
      timing: { detectMs, parseMs, totalMs: Date.now() - t0 },
    };
  }

  // ======================== Parse String ========================

  async parseString(content: string, fileName = 'input.md', options: ParseOptions = {}): Promise<ParseResult> {
    const t0 = Date.now();
    const format = options.format === 'auto' || !options.format ? detectFormat(fileName) : options.format;
    const warnings: string[] = [];

    // Binary formats can't be parsed from strings
    const binaryFormats: InputFormat[] = ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
    if (binaryFormats.includes(format)) {
      throw new ParserError(
        `Cannot parse ${format.toUpperCase()} from a string — use file upload instead`,
        'BINARY_REQUIRES_FILE', fileName, format,
        'Upload the file as multipart/form-data for binary format parsing',
      );
    }

    if (!content || !content.trim()) {
      throw new ParserError(
        'Content is empty',
        'EMPTY_CONTENT', fileName, format,
      );
    }

    let markdown = content.replace(/\x00/g, '');
    let properties: ParsedProperty[] | undefined;
    if (options.extractProperties) {
      try {
        properties = markdownParser.parse(markdown);
      } catch (err: any) {
        warnings.push(`Property extraction skipped: ${err.message}`);
      }
    }

    const totalMs = Date.now() - t0;
    console.log(`[Parser] ${fileName} | format=${format} (string) | chars=${content.length} | ms=${totalMs} | SUCCESS`);

    return {
      markdown, sourceFormat: format,
      metadata: {
        fileName, fileSize: Buffer.byteLength(content, 'utf-8'),
        mimeType: mimeTypeFor(format), wordCount: countWords(markdown),
        parsedAt: new Date().toISOString(),
      },
      properties, warnings,
      timing: { detectMs: 0, parseMs: totalMs, totalMs },
    };
  }

  // ======================== Parse Buffer ========================

  async parseBuffer(buffer: Buffer, fileName: string, options: ParseOptions = {}): Promise<ParseResult> {
    if (!buffer || buffer.length === 0) {
      throw new ParserError(
        'Upload buffer is empty',
        'EMPTY_BUFFER', fileName,
      );
    }

    const tmpDir = './backend/data/tmp';
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}_${fileName}`);

    try {
      fs.writeFileSync(tmpPath, buffer);
      return await this.parseFile(tmpPath, options);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }
}

export const markitdownParser = new MarkItDownParser();
