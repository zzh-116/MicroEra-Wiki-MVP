// Controlled source-file storage (TB-1) — the server-owned, traversal-safe
// landing zone for uploaded PDF/DOCX/MD/TXT binaries.
//
// Security model (D-A/D-B, §2 of the Phase 2 design):
//   - The client NEVER supplies a server path. The stored name is always
//     `<uuid>.<ext>` where `<ext>` comes from the extension whitelist, never
//     the original filename (which may carry `../`, non-ASCII, or a spoofed
//     suffix).
//   - Files are written with the `wx` flag (exclusive create) so an existing
//     file is never overwritten — a name collision is retried with a fresh
//     UUID, and a persistent failure is a hard error rather than a clobber.
//   - Type validation checks extension + declared MIME + a content feature
//     (magic bytes / text heuristic), so a spoofed Content-Type alone cannot
//     smuggle a disallowed payload. The content feature is authoritative; the
//     extension decides the format; MIME is a secondary (non-generic) signal.
//   - `resolveSourceFilePath` re-resolves and asserts the result stays under
//     DATA_DIR/sources (defense-in-depth for any later read/delete).
//
// This module is the single source of truth for where a source file lives and
// how it is named; the Docling worker (TB-2) and the GC (TB-3) will resolve
// the same `sources/<uuid>.<ext>` reference through `resolveSourceFilePath`.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256Buffer } from '../utils/hash.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('source-files');

/** Hard cap on an uploaded source file (50 MB — matches ParseOptions.maxFileSize). */
export const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;

export type SourceFileFormat = 'pdf' | 'docx' | 'md' | 'txt';

export type SourceFileErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'MIME_MISMATCH'
  | 'CONTENT_MISMATCH'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'WRITE_FAILED'
  | 'INVALID_STORED_NAME';

/** Non-sensitive validation/write error — mapped to the wire contract by the caller. */
export class SourceFileError extends Error {
  code: SourceFileErrorCode;
  constructor(code: SourceFileErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SourceFileError';
  }
}

interface FormatRule {
  format: SourceFileFormat;
  ext: string;
  mimes: string[];
  /** Content-feature check: does this buffer actually look like the format? */
  match: (buf: Buffer) => boolean;
}

/** Reject obvious binaries by a NUL byte in the leading window (text formats). */
function isTextLike(buf: Buffer): boolean {
  const window = buf.subarray(0, Math.min(buf.length, 512));
  return !window.includes(0);
}

const FORMAT_RULES: FormatRule[] = [
  {
    format: 'pdf',
    ext: '.pdf',
    mimes: ['application/pdf', 'application/x-pdf'],
    match: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    format: 'docx',
    ext: '.docx',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    // OOXML (.docx) is a ZIP container: PK\x03\x04 magic + the mandatory
    // [Content_Types].xml entry marker. Cheap but meaningful for a "content
    // feature" (a random ZIP without the OOXML manifest is rejected).
    match: (b) =>
      b.length >= 4 &&
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      b[2] === 0x03 &&
      b[3] === 0x04 &&
      b.includes(Buffer.from('[Content_Types].xml')),
  },
  { format: 'md', ext: '.md', mimes: ['text/markdown', 'text/plain', 'text/x-markdown'], match: isTextLike },
  { format: 'txt', ext: '.txt', mimes: ['text/plain'], match: isTextLike },
];

function ruleForExtension(name: string): FormatRule | undefined {
  const ext = path.extname(name).toLowerCase();
  return FORMAT_RULES.find((r) => r.ext === ext);
}

/** Validate a prospective source file without writing anything. Returns the
 *  resolved format + extension, or throws a typed `SourceFileError`. */
export function validateSourceFile(
  buffer: Buffer,
  opts: { name: string; mime: string; maxBytes?: number },
): { format: SourceFileFormat; ext: string } {
  const maxBytes = opts.maxBytes ?? MAX_SOURCE_FILE_BYTES;

  if (!buffer || buffer.length === 0) {
    throw new SourceFileError('EMPTY_FILE', 'file is empty');
  }
  if (buffer.length > maxBytes) {
    throw new SourceFileError('FILE_TOO_LARGE', `file exceeds ${maxBytes} bytes`);
  }

  const rule = ruleForExtension(opts.name);
  if (!rule) {
    const ext = path.extname(opts.name).toLowerCase();
    throw new SourceFileError('UNSUPPORTED_FORMAT', `unsupported file extension "${ext || '(none)'}"`);
  }

  // Content feature is authoritative — the bytes must actually look like the
  // format implied by the extension. Never trust the client Content-Type.
  if (!rule.match(buffer)) {
    throw new SourceFileError('CONTENT_MISMATCH', `file content does not match ".${rule.format}"`);
  }

  // Declared MIME is a secondary signal: reject a clearly-wrong type, but
  // tolerate generic/missing MIME (the content check above is the real gate).
  const mime = (opts.mime || '').toLowerCase();
  const isGeneric = !mime || mime === 'application/octet-stream';
  if (!isGeneric && !rule.mimes.includes(mime)) {
    throw new SourceFileError('MIME_MISMATCH', `MIME "${mime}" not allowed for .${rule.format}`);
  }

  return { format: rule.format, ext: rule.ext };
}

/** Resolve a stored source-file name under DATA_DIR/sources, refusing any path
 *  that escapes the data dir. Names are server-generated, so this is defense
 *  in depth for later read/delete paths (never a client-supplied string). */
export function resolveSourceFilePath(dataDir: string, storedName: string): string {
  const root = path.resolve(dataDir, 'sources');
  const target = path.resolve(root, storedName);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new SourceFileError('INVALID_STORED_NAME', 'invalid source-file path');
  }
  return target;
}

export interface WrittenSourceFile {
  storedName: string;
  /** Reference relative to DATA_DIR, e.g. "sources/<uuid>.pdf" — stored on `sources.uri`. */
  uri: string;
  absolutePath: string;
  checksum: string;
  size: number;
  format: SourceFileFormat;
}

/** Write a validated source file under DATA_DIR/sources with an exclusive
 *  (`wx`) create, returning its stored reference and integrity digest. */
export function writeSourceFile(
  dataDir: string,
  buffer: Buffer,
  opts: { name: string; mime: string; maxBytes?: number },
): WrittenSourceFile {
  const { format, ext } = validateSourceFile(buffer, opts);
  const dir = path.resolve(dataDir, 'sources');
  fs.mkdirSync(dir, { recursive: true });

  const { storedName, absolutePath } = writeExclusive(dir, ext, buffer);

  return {
    storedName,
    uri: `sources/${storedName}`,
    absolutePath,
    checksum: sha256Buffer(buffer),
    size: buffer.length,
    format,
  };
}

/** Exclusive-create a file under `dir` with a fresh UUID name; never overwrites. */
function writeExclusive(dir: string, ext: string, buffer: Buffer): { storedName: string; absolutePath: string } {
  for (let i = 0; i < 3; i++) {
    const name = `${randomUUID()}${ext}`;
    const abs = path.join(dir, name);
    try {
      fs.writeFileSync(abs, buffer, { flag: 'wx' });
      return { storedName: name, absolutePath: abs };
    } catch (err: any) {
      if (err?.code === 'EEXIST') continue;
      throw new SourceFileError('WRITE_FAILED', `failed to write source file: ${err.message}`);
    }
  }
  throw new SourceFileError('WRITE_FAILED', 'failed to allocate a unique source-file name');
}

/** Remove a stored source file (compensation / GC). Returns false — and emits a
 *  persisted ERROR audit entry — when the removal fails, so the orphan stays
 *  recoverable instead of silently leaking. */
export function removeSourceFile(dataDir: string, storedName: string): boolean {
  try {
    const target = resolveSourceFilePath(dataDir, storedName);
    fs.rmSync(target, { force: true });
    return true;
  } catch (err) {
    logger.error('source-file removal failed', err as Error, { storedName, dataDir });
    return false;
  }
}
