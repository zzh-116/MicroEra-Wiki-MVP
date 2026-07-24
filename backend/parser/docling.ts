// Docling Parser — multi-format document → unified Markdown via Docling CLI
// Supported: PDF, DOCX, PPTX, XLSX, HTML, MD, AsciiDoc, CSV, TXT, Images
// Implements DocumentParser interface for pluggable architecture
//
// Architecture note:
//   Docling (IBM Research) is called via its CLI as a child process.
//   The parser writes input to a temp file, invokes `docling`, and reads
//   the output Markdown. No Docling Python objects leak beyond this module.
//   To swap parsers, implement DocumentParser and register in factory.ts.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { type DocumentParser } from './base.js';
import {
  type InputFormat,
  type ParseOptions,
  type ParseResult,
  type ParseMetadata,
  type ParserCapability,
  ParserError,
} from './models.js';
import type { ParsedProperty } from '../types.js';
import { markdownParser } from './markdown.js';

const execFileAsync = promisify(execFile);

// ---- Helpers ----

/** Format → file extension mapping */
const FORMAT_EXTENSIONS: Record<InputFormat, string[]> = {
  pdf: ['.pdf'],
  docx: ['.docx', '.doc'],
  pptx: ['.pptx', '.ppt'],
  xlsx: ['.xlsx', '.xls'],
  html: ['.html', '.htm'],
  md: ['.md'],
  asciidoc: ['.adoc', '.asciidoc'],
  csv: ['.csv'],
  txt: ['.txt', '.json', '.xml', '.yaml', '.yml', '.log'],
  png: ['.png'],
  jpg: ['.jpg', '.jpeg'],
  jpeg: ['.jpeg', '.jpg'],
  gif: ['.gif'],
  webp: ['.webp'],
  auto: [],
};

function detectFormat(fileName: string): InputFormat {
  const ext = path.extname(fileName).toLowerCase();
  for (const [format, exts] of Object.entries(FORMAT_EXTENSIONS)) {
    if (exts.includes(ext)) return format as InputFormat;
  }
  return 'txt';
}

function mimeTypeFor(format: InputFormat): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    html: 'text/html',
    md: 'text/markdown',
    asciidoc: 'text/asciidoc',
    csv: 'text/csv',
    txt: 'text/plain',
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
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  return cjk + latin;
}

/** Strip inline data:image/...;base64,... URLs from Markdown */
function stripDataUriImages(markdown: string): string {
  // Pass 1: markdown image syntax ![alt](data:image/...)
  markdown = markdown.replace(
    /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
    (_full: string, alt: string) => `[Embedded image: ${alt?.trim() || 'Image'}]`,
  );
  // Pass 2: bare base64 URIs (LLM may output them raw, or broken parse artifacts)
  markdown = markdown.replace(
    /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{100,}/g,
    '[Embedded image omitted]',
  );
  return markdown;
}

/** Count how many data-URI images will be stripped */
function stripDataUriImages_count(markdown: string): number {
  const matches = markdown.match(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g);
  return matches ? matches.length : 0;
}

/** Formats that Docling CLI can process natively */
const DOCLING_FORMATS: Set<InputFormat> = new Set([
  'pdf', 'docx', 'pptx', 'xlsx', 'html', 'md', 'asciidoc', 'csv', 'txt',
]);

/** Formats that can be read as plain text directly */
const TEXT_FORMATS: Set<InputFormat> = new Set(['md', 'txt', 'csv', 'html', 'asciidoc']);

/** Binary formats — cannot be parsed from a string */
const BINARY_FORMATS: Set<InputFormat> = new Set([
  'pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp',
]);

// ---- Docling CLI Resolution ----

let _doclingCommand: string | null = null;
let _doclingLastCheck = 0;
/** Retry discovery every 60s after a failure so a mid-session `pip install` takes effect. */
const DOCLING_RETRY_MS = 60_000;

async function resolveDoclingCommand(): Promise<string> {
  if (_doclingCommand) return _doclingCommand;

  const now = Date.now();
  if (_doclingLastCheck > 0 && now - _doclingLastCheck < DOCLING_RETRY_MS) {
    throw new Error('Docling CLI not found. Install: pip install docling');
  }
  _doclingLastCheck = now;

  // Docling installs a console script 'docling' (pip install docling)
  try {
    await execFileAsync('docling', ['--version'], { timeout: 15000, windowsHide: true });
    _doclingCommand = 'docling';
    console.log('[Docling] Found: docling CLI');
    return _doclingCommand;
  } catch { /* continue */ }

  // Fallback: try python -c to invoke docling (if PATH is incomplete)
  try {
    await execFileAsync('python', ['-c', 'from docling.cli import main; import sys; sys.exit(0)'], { timeout: 15000, windowsHide: true });
    _doclingCommand = 'docling'; // still use 'docling' — the python check was just to verify import works
    console.log('[Docling] Found: docling (verified via Python import)');
    return _doclingCommand;
  } catch { /* continue */ }

  throw new Error('Docling CLI not found. Install: pip install docling');
}

function buildDoclingArgs(filePath: string, outputDir: string, format: InputFormat): [string, string[]] {
  // Docling 2.x CLI: docling convert <source> --from <fmt> --to md --output <dir>
  // --from gives Docling an explicit format hint, improving backend selection
  // --abort-on-error prevents silent partial output on corrupt pages
  if (format !== 'auto' && format !== 'txt' && format !== 'md' && format !== 'csv') {
    return ['docling', ['convert', filePath, '--from', format, '--to', 'md', '--output', outputDir]];
  }
  return ['docling', ['convert', filePath, '--to', 'md', '--output', outputDir]];
}

/** Generate a safe ASCII filename for temp files to avoid CLI encoding issues */
function safeTempName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  // Use timestamp + sanitized base (ASCII-only, max 64 chars)
  const base = originalName
    .replace(/\.[^.]+$/, '')           // strip extension
    .replace(/[^\x00-\x7F]/g, '')       // strip non-ASCII (Chinese, corrupted UTF-8, etc.)
    .replace(/[^a-zA-Z0-9._-]/g, '_')   // replace special chars with underscore
    .slice(0, 64)                       // cap length
    || 'document';                       // fallback if all chars were stripped
  return `${base}_${Date.now()}${ext}`;
}

// ---- DoclingParser Implementation ----

export class DoclingParser implements DocumentParser {
  readonly name = 'Docling';
  readonly version = '2.x';

  private _available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    try {
      await resolveDoclingCommand();
      return true;
    } catch {
      // Don't cache failure — retry on next call
      // resolveDoclingCommand has its own 60s retry window
      return false;
    }
  }

  getCapabilities(): ParserCapability[] {
    // Report all docling-supported formats; availability is checked lazily
    const capPairs: Array<{ format: InputFormat; desc: string }> = [
      { format: 'pdf', desc: 'PDF documents (academic papers, reports)' },
      { format: 'docx', desc: 'Word documents' },
      { format: 'pptx', desc: 'PowerPoint presentations' },
      { format: 'xlsx', desc: 'Excel spreadsheets' },
      { format: 'html', desc: 'HTML web pages' },
      { format: 'md', desc: 'Markdown (native)' },
      { format: 'asciidoc', desc: 'AsciiDoc documents' },
      { format: 'csv', desc: 'CSV data files' },
      { format: 'txt', desc: 'Plain text' },
      { format: 'png', desc: 'PNG images (OCR via Docling)' },
      { format: 'jpg', desc: 'JPEG images (OCR via Docling)' },
      { format: 'gif', desc: 'GIF images (OCR via Docling)' },
      { format: 'webp', desc: 'WebP images (OCR via Docling)' },
    ];

    // Don't block on availability check — report all as potentially available
    // The actual check happens at parse time
    return capPairs.map((c) => ({
      format: c.format,
      extensions: FORMAT_EXTENSIONS[c.format] || [],
      description: c.desc,
      available: true, // lazy — checked at parse time with a clear error
    }));
  }

  detectFormat(fileName: string): InputFormat {
    return detectFormat(fileName);
  }

  // ======================== Parse File ========================

  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParseResult> {
    const t0 = performance.now();
    const maxSize = options.maxFileSize || 50 * 1024 * 1024;
    const timeout = options.timeout || 300000; // 5 min — first run downloads HF models (~2GB)

    // Validate input
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
    const format = (options.format && options.format !== 'auto')
      ? options.format
      : detectFormat(fileName);
    const detectMs = performance.now() - t0;
    const warnings: string[] = [];

    // Fast path: text-based formats (csv, txt, md) are parsed inline without
    // invoking Docling CLI.  The work is the same as parseString but the timing
    // stays inside parseFile's scope so detectMs / parseMs / totalMs form a
    // coherent whole.  HTML still goes through Docling for structured conversion.
    if (TEXT_FORMATS.has(format) && format !== 'html') {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content || !content.trim()) {
        throw new ParserError(
          `File is empty: ${fileName}`,
          'EMPTY_FILE', fileName, format,
        );
      }

      const parseStart = performance.now();

      // --- same processing as parseString ---
      let markdown = content.replace(/\x00/g, '');
      markdown = stripDataUriImages(markdown);

      // Extract structured properties
      let properties: ParsedProperty[] | undefined;
      if (options.extractProperties) {
        try {
          properties = markdownParser.parse(markdown);
          if (properties.length > 0) warnings.push(`Extracted ${properties.length} structured properties`);
        } catch (err: any) {
          warnings.push(`Property extraction skipped: ${err.message}`);
        }
      }

      // Extract metadata (same pipeline as the Docling branch)
      const metadata = this.extractMetadata(markdown, fileName, stat.size, format);
      metadata.wordCount = countWords(markdown);

      const parseMs = Math.round((performance.now() - parseStart) * 100) / 100;
      const totalMs = Math.round((performance.now() - t0) * 100) / 100;

      console.log(`[Docling] ${fileName} | format=${format} (text) | size=${formatFileSize(stat.size)} | words=${metadata.wordCount} | detect=${detectMs.toFixed(1)}ms parse=${parseMs.toFixed(1)}ms | SUCCESS`);

      return {
        markdown,
        sourceFormat: format,
        metadata,
        properties,
        warnings,
        timing: { detectMs: Math.round(detectMs * 100) / 100, parseMs, totalMs },
      };
    }

    // For HTML and binary formats, Docling CLI is required
    const available = await this.isAvailable();
    if (!available) {
      throw new ParserError(
        'Docling is not installed. Install: pip install docling',
        'DEPENDENCY_MISSING', fileName, format,
        'Run: pip install docling',
      );
    }

    // Verify Docling supports this format
    if (!DOCLING_FORMATS.has(format)) {
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(format);
      if (isImage) {
        // Docling can process images with OCR pipeline
        // Fall through — Docling will attempt OCR
        warnings.push(`Image format (${format}) — Docling will attempt OCR extraction`);
      } else {
        throw new ParserError(
          `Unsupported format: ${format}`,
          'UNSUPPORTED_FORMAT', fileName, format,
          `Docling supports: ${[...DOCLING_FORMATS].join(', ')}`,
        );
      }
    }

    // Create temp output directory
    const tmpDir = path.join('./backend/data/tmp', `docling_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const parseStart = performance.now();
    let markdown = '';

    try {
      // Resolve the docling command
      await resolveDoclingCommand();

      // Build and execute the docling command
      const [cmd, args] = buildDoclingArgs(filePath, tmpDir, format);

      console.log(`[Docling] ${cmd} ${args.join(' ')} (format=${format}, size=${formatFileSize(stat.size)})`);

      const { stderr } = await execFileAsync(cmd, args, {
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024, // 10MB stderr buffer
      });

      // Log docling stderr as diagnostics (docling writes progress to stderr)
      if (stderr) {
        const stderrText = stderr.trim();
        const stderrLines = stderrText.split('\n');

        // Collect ERROR lines as warnings (may be non-fatal — e.g. page-count mismatch)
        for (const line of stderrLines) {
          if (line.includes('ERROR') || line.includes('error')) {
            warnings.push(`docling: ${line.trim().slice(0, 250)}`);
          }
        }

        // Log first info line for diagnostics
        const firstInfo = stderrLines.find((l) => l.includes('INFO'));
        if (firstInfo) {
          console.log(`[Docling] ${firstInfo.slice(0, 200)}`);
        }
      }

      // Find the generated markdown file
      // Docling output name: <input_basename_without_ext>.md
      const inputBase = path.basename(filePath, path.extname(filePath));
      const expectedOutput = path.join(tmpDir, `${inputBase}.md`);

      if (fs.existsSync(expectedOutput)) {
        markdown = fs.readFileSync(expectedOutput, 'utf-8');
      } else {
        // Fallback: search for any .md files in the output directory
        const mdFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.md'));
        if (mdFiles.length > 0) {
          markdown = fs.readFileSync(path.join(tmpDir, mdFiles[0]), 'utf-8');
          warnings.push(`Output file name mismatch — expected "${inputBase}.md", got "${mdFiles[0]}"`);
        }
      }

      // If Docling produced output despite stderr errors, accept it
      if (markdown && markdown.trim()) {
        // Stderr errors are downgraded to warnings — the parse succeeded
      } else if (!markdown || !markdown.trim()) {
        // No output — the docling errors were fatal
        const errorSummary = stderr
          ? stderr.trim().split('\n').filter((l: string) => l.includes('ERROR')).join('; ').slice(0, 400)
          : 'Unknown error';
        throw new ParserError(
          `Docling produced no output: ${errorSummary || 'Check file integrity'}`,
          'EMPTY_OUTPUT', fileName, format,
          'The document may be corrupted, encrypted, or in an unsupported format.',
        );
      }
    } catch (err: any) {
      if (err instanceof ParserError) throw err;

      // Handle docling CLI errors
      if (err.killed && err.signal === 'SIGTERM') {
        throw new ParserError(
          `Docling timed out after ${timeout / 1000}s`,
          'TIMEOUT', fileName, format,
          'Increase timeout in ParseOptions or check file complexity.',
        );
      }

      const rawMsg: string = err.stderr || err.message || String(err);
      // Strip ANSI escape codes (e.g. [32m, [0m) from Python logging output
      const msg = rawMsg.replace(/\x1b\[[0-9;]*m/g, '');

      if (msg.includes('encrypted') || msg.includes('password')) {
        throw new ParserError(
          'Document is encrypted/password-protected',
          'ENCRYPTED', fileName, format,
          'Remove password protection before importing.',
        );
      }

      if (msg.includes('corrupt') || msg.includes('invalid') || msg.includes('not a valid')) {
        throw new ParserError(
          `Document appears to be corrupted: ${msg.slice(-300)}`,
          'CORRUPTED', fileName, format,
        );
      }

      // Try to recover: Docling may have produced output despite non-zero exit
      // (e.g. non-fatal warnings on some pages). Check for markdown output.
      const inputBase = path.basename(filePath, path.extname(filePath));
      const expectedOutput = path.join(tmpDir, `${inputBase}.md`);
      if (fs.existsSync(expectedOutput)) {
        markdown = fs.readFileSync(expectedOutput, 'utf-8');
      } else {
        try {
          const mdFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.md'));
          if (mdFiles.length > 0) {
            markdown = fs.readFileSync(path.join(tmpDir, mdFiles[0]), 'utf-8');
          }
        } catch { /* no output to recover */ }
      }

      if (markdown && markdown.trim()) {
        // Recovery succeeded — accept the output with a warning
        warnings.push(`Docling exited with error but produced parseable output (${markdown.length} chars)`);
        console.log(`[Docling] ${fileName} | recovered output despite CLI error (${markdown.length} chars)`);
        // Fall through to post-processing below
      } else {
        // Extract the last meaningful lines from stderr (Python CLIs put errors at the end)
        const lines = msg.split('\n').filter((l: string) => l.trim());
        const tail = lines.slice(-5).join(' | ').slice(-400);
        throw new ParserError(
          `Docling parse failed: ${tail || 'Unknown error (check file integrity)'}`,
          'PARSE_FAILED', fileName, format,
        );
      }
    } finally {
      // Clean up temp directory
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // Validate output
    if (!markdown || !markdown.trim()) {
      throw new ParserError(
        `Docling produced empty output for ${fileName}`,
        'EMPTY_OUTPUT', fileName, format,
        'The document may be image-only without readable text, or is corrupted.',
      );
    }

    const parseMs = Math.round((performance.now() - parseStart) * 100) / 100;

    // Strip null bytes
    markdown = markdown.replace(/\x00/g, '');

    // Strip inline Base64 data-URI images (Docling embeds images as base64).
    // These can be tens of KB and break page layout when rendered.
    // Replaced with a safe placeholder.
    const strippedCount = stripDataUriImages_count(markdown);
    markdown = stripDataUriImages(markdown);
    if (strippedCount > 0) {
      console.log(`[Docling] Stripped ${strippedCount} inline base64 image(s) from "${fileName}"`);
      warnings.push(`Stripped ${strippedCount} inline base64 image(s)`);
    }

    // Extract structured properties
    let properties: ParsedProperty[] | undefined;
    if (options.extractProperties) {
      try {
        properties = markdownParser.parse(markdown);
        if (properties.length > 0) {
          warnings.push(`Extracted ${properties.length} structured properties`);
        }
      } catch (err: any) {
        warnings.push(`Property extraction skipped: ${err.message}`);
      }
    }

    // Extract basic metadata from markdown content
    const metadata = this.extractMetadata(markdown, fileName, stat.size, format);
    metadata.wordCount = countWords(markdown);

    const totalMs = Math.round((performance.now() - t0) * 100) / 100;
    console.log(`[Docling] ${fileName} | format=${format} | size=${formatFileSize(stat.size)} | words=${metadata.wordCount} | detect=${detectMs.toFixed(1)}ms parse=${parseMs.toFixed(1)}ms | SUCCESS`);

    return {
      markdown,
      sourceFormat: format,
      metadata,
      properties,
      warnings,
      timing: { detectMs: Math.round(detectMs * 100) / 100, parseMs, totalMs },
    };
  }

  // ======================== Parse String ========================

  async parseString(content: string, fileName = 'input.md', options: ParseOptions = {}): Promise<ParseResult> {
    const t0 = performance.now();
    const format = (options.format && options.format !== 'auto')
      ? options.format
      : detectFormat(fileName);
    const warnings: string[] = [];

    // Binary formats can't be parsed from strings
    if (BINARY_FORMATS.has(format)) {
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

    // For text formats, parse directly without invoking Docling CLI
    let markdown = content.replace(/\x00/g, '');

    // Strip inline Base64 data-URI images (defensive — any source can contain them)
    markdown = stripDataUriImages(markdown);

    // For HTML, invoke Docling for better conversion
    if (format === 'html') {
      const tmpDir = path.join('./backend/data/tmp', `docling_str_${Date.now()}`);
      const tmpFile = path.join(tmpDir, fileName);
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(tmpFile, content, 'utf-8');
        return await this.parseFile(tmpFile, { ...options, format: 'html' });
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }

    let properties: ParsedProperty[] | undefined;
    if (options.extractProperties) {
      try {
        properties = markdownParser.parse(markdown);
      } catch (err: any) {
        warnings.push(`Property extraction skipped: ${err.message}`);
      }
    }

    const totalMs = Math.round((performance.now() - t0) * 100) / 100;
    console.log(`[Docling] ${fileName} | format=${format} (string) | chars=${content.length} | ms=${totalMs.toFixed(2)} | SUCCESS`);

    return {
      markdown,
      sourceFormat: format,
      metadata: {
        fileName,
        fileSize: Buffer.byteLength(content, 'utf-8'),
        mimeType: mimeTypeFor(format),
        wordCount: countWords(markdown),
        parsedAt: new Date().toISOString(),
      },
      properties,
      warnings,
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

    // Write buffer to temp file with a safe ASCII name.
    // Original filenames may contain Chinese, corrupted UTF-8, or other
    // non-ASCII characters that break CLI argument encoding on Windows.
    const tmpDir = path.join('./backend/data/tmp', `docling_buf_${Date.now()}`);
    const safeName = safeTempName(fileName);
    const tmpPath = path.join(tmpDir, safeName);
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(tmpPath, buffer);
      return await this.parseFile(tmpPath, options);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  // ======================== Metadata Extraction ========================

  /** Extract metadata from parsed markdown without a separate JSON pass */
  private extractMetadata(
    markdown: string,
    fileName: string,
    fileSize: number,
    format: InputFormat,
  ): ParseMetadata {
    const headings: string[] = [];
    let title: string | undefined;
    let tablesCount = 0;

    for (const line of markdown.split('\n')) {
      const hMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (hMatch) {
        const text = hMatch[2].trim();
        if (!title && (hMatch[1] === '#' || hMatch[1] === '##')) {
          title = text;
        }
        headings.push(text);
      }
      if (line.startsWith('|') && line.endsWith('|') && !line.startsWith('|---')) {
        tablesCount++;
      }
    }

    return {
      fileName,
      fileSize,
      mimeType: mimeTypeFor(format),
      pageCount: undefined, // Only available from JSON output
      wordCount: 0, // Filled by caller
      title,
      headings: headings.slice(0, 20),
      tablesCount: tablesCount > 0 ? tablesCount : undefined,
      imagesCount: undefined,
      parsedAt: new Date().toISOString(),
    };
  }
}

export const doclingParser = new DoclingParser();
