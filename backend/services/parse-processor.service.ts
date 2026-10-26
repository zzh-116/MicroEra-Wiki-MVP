// Parse processor (2b Phase 1/2) — the real worker handlers for a leased parse
// job. Three routes share one fenced publish (`publishMarkdown`):
//
//   - `createPureTextProcessor`  — Markdown/TXT fast path: the document's
//     `content` is already the parsed markdown (raw text arrived at upload),
//     so there is no Docling CLI and no binary handling here. Unchanged from
//     Phase 1.
//   - `createDoclingProcessor`   — resolves the DB-trusted `sources.uri` to a
//     stored file, verifies existence/size/SHA-256, then parses PDF/DOCX via
//     the Docling CLI (MD/TXT files are read directly as UTF-8, no CLI).
//   - `createParseProcessor`     — the production router: a stored
//     `sources/<uuid>.<ext>` reference means "read the source file from disk",
//     otherwise fall back to the pure-text fast path. The client payload is
//     NEVER used for routing — only the DB-trusted source record is.
//
// Compute (extract/chunk/embed) happens OUTSIDE any transaction; only the final
// publish goes through `parseCommitRepository.commitParsedDocument`, which
// fences the job lease + document ownership + KB liveness and writes
// elements/chunks/revision/content/vectors atomically. Fence failures surface
// as `ParseCommitError` so the worker can classify them (see `runJob`).
//
// Embedding is STRICT: when a document yields real chunks, every chunk must
// embed successfully and each vector must be exactly the configured dimension.
// Any partial/total embedding failure or dimension mismatch throws a
// `ParseProcessorError` BEFORE the fenced commit, so no incomplete
// chunks/vectors/revision is ever published and the job flows into the normal
// retry/deadletter path. An empty document (no chunks) is published as an empty
// parse — deliberately NOT reported as an embedding fault.
import fs from 'node:fs';
import path from 'node:path';
import {
  knowledgeRepository,
  type DocumentRow,
  type SourceRow,
} from '../repositories/knowledge.repository.js';
import { parseCommitRepository, ParseCommitError } from '../repositories/parse-commit.repository.js';
import { extractElements } from '../parser/elements.js';
import { chunkService } from '../chunk/service.js';
import type { ChunkResult } from '../chunk/service.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import { config } from '../config.js';
import { sha256, sha256Buffer } from '../utils/hash.js';
import { resolveSourceFilePath, MAX_SOURCE_FILE_BYTES } from '../storage/source-files.js';
import { doclingParser } from '../parser/docling.js';
import { ParserError } from '../parser/models.js';
import type { ParseJobRow } from '../repositories/parse-job.repository.js';

/** A job handler that turns a leased parse job into a published document. */
export type ParseProcessor = (job: ParseJobRow) => Promise<void>;
/** Pure-text (Phase 1) handler — reads `doc.content` only. */
export type PureTextProcessor = (job: ParseJobRow) => Promise<void>;

/** Embedding / source-file / Docling validation failure codes — clear and
 *  non-sensitive (never contain document text or source-file bodies). Each code
 *  carries a retryability classification (see `ParseProcessorError.retryable`):
 *  permanent failures are terminal (no retry, no deadletter) because re-running
 *  cannot change the file on disk; retryable failures flow through `fail` and
 *  deadletter only after `max_attempts`. */
export type ParseProcessorErrorCode =
  | 'EMBEDDING_FAILED'
  | 'EMBEDDING_DIMENSION_MISMATCH'
  | 'EMBEDDING_EMPTY_VECTOR'
  | 'EMBEDDING_RESULT_MALFORMED'
  | 'SOURCE_FILE_MISSING'
  | 'SOURCE_FILE_TOO_LARGE'
  | 'SOURCE_HASH_MISMATCH'
  | 'SOURCE_FILE_ENCRYPTED'
  | 'SOURCE_FILE_CORRUPTED'
  | 'SOURCE_FORMAT_UNRECOGNIZED'
  | 'DOCLING_DEPENDENCY_MISSING'
  | 'DOCLING_TIMEOUT'
  | 'DOCLING_EMPTY_OUTPUT'
  | 'DOCLING_PARSE_FAILED';

export class ParseProcessorError extends Error {
  code: ParseProcessorErrorCode;
  /** `false` = permanent: the worker routes it to `failPermanently` (terminal,
   *  no retry / deadletter). `true` = retryable via the normal `fail` path.
   *  Defaults to `true` so any future throw site that forgets the flag degrades
   *  to a retry rather than silently dropping a job. */
  retryable: boolean;
  constructor(code: ParseProcessorErrorCode, message: string, retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = 'ParseProcessorError';
  }
}

/** Source-file formats the worker can produce markdown from. */
type SourceFileFormat = 'pdf' | 'docx' | 'md' | 'txt';

/** Map a stored source `sources/<uuid>.<ext>` reference to its format. Never
 *  trusts anything but the server-generated extension. */
function formatFromUri(uri: string): SourceFileFormat {
  const ext = path.extname(uri).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.md') return 'md';
  if (ext === '.txt') return 'txt';
  throw new ParseProcessorError('SOURCE_FORMAT_UNRECOGNIZED', `unrecognized source-file format "${ext || '(none)'}"`, false);
}

/** Markdown produced from a stored source file, plus the names of image files
 *  the parse actually wrote under DATA_DIR/images (trusted provenance, P1-B).
 *  MD/TXT files are read directly with no extraction, so `savedImages` is empty. */
interface SourceMarkdown {
  markdown: string;
  savedImages: string[];
}

/**
 * Resolve the DB-trusted `sources.uri` to on-disk bytes and turn them into
 * markdown, after verifying existence, size range, and SHA-256 integrity.
 *
 * `source.uri` is server-generated (`sources/<uuid>.<ext>` from TB-1) and the
 * authoritative record; the job payload's `source_file` is deliberately ignored.
 * MD/TXT files are read directly (no Docling); PDF/DOCX go through the Docling
 * CLI. Any `ParserError` from Docling is translated to a non-sensitive
 * `ParseProcessorError` code so the job flows into the retry/deadletter path.
 */
async function readSourceMarkdown(doc: DocumentRow, source: SourceRow): Promise<SourceMarkdown> {
  if (!source.uri || !source.uri.startsWith('sources/')) {
    throw new ParseProcessorError('SOURCE_FILE_MISSING', `document ${doc.id} has no stored source file`, false);
  }

  // The stored name is the basename; resolveSourceFilePath re-roots it under
  // DATA_DIR/sources and refuses any path that escapes (defense-in-depth for a
  // later read path — the value is DB-trusted, not client-supplied).
  const storedName = source.uri.replace(/^sources\//, '');
  let abs: string;
  try {
    abs = resolveSourceFilePath(config.dataDir, storedName);
  } catch {
    throw new ParseProcessorError('SOURCE_FILE_MISSING', `invalid stored source path for document ${doc.id}`, false);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw new ParseProcessorError('SOURCE_FILE_MISSING', `source file missing for document ${doc.id}`, false);
  }
  if (stat.size === 0) {
    throw new ParseProcessorError('SOURCE_FILE_MISSING', `source file is empty for document ${doc.id}`, false);
  }
  if (stat.size > MAX_SOURCE_FILE_BYTES) {
    throw new ParseProcessorError('SOURCE_FILE_TOO_LARGE', `source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes`, false);
  }

  // Integrity: SHA-256 of the on-disk bytes must equal the DB-trusted digest.
  // The expected digest is the source record's checksum (set at TB-1 upload),
  // with the document's file_hash as a fallback.
  const bytes = fs.readFileSync(abs);
  const expected = source.checksum ?? doc.file_hash;
  if (!expected || sha256Buffer(bytes) !== expected) {
    throw new ParseProcessorError('SOURCE_HASH_MISMATCH', `source file checksum mismatch for document ${doc.id}`, false);
  }

  const format = formatFromUri(source.uri);

  // Pure-text file fast path: read the bytes directly, no Docling CLI, no image
  // extraction — so savedImages is empty (nothing is registered).
  if (format === 'md' || format === 'txt') {
    return { markdown: bytes.toString('utf8').replace(/\x00/g, ''), savedImages: [] };
  }

  // PDF/DOCX → Docling CLI. The result's `savedImages` are the image files the
  // trusted parser actually wrote; they are forwarded to the fenced commit and
  // registered there (never derived from the editable markdown body — P1-B).
  try {
    const result = await doclingParser.parseFile(abs, { format });
    if (!result.markdown || !result.markdown.trim()) {
      throw new ParseProcessorError('DOCLING_EMPTY_OUTPUT', `Docling produced empty output for document ${doc.id}`, false);
    }
    return { markdown: result.markdown, savedImages: result.savedImages ?? [] };
  } catch (err) {
    throw translateDoclingError(err, doc.id);
  }
}

/** Map a Docling/ParserError onto a non-sensitive `ParseProcessorError` code,
 *  tagging each with its retryability. Never echo the document body or file
 *  contents into the message.
 *
 *  Permanent (retryable=false): the failure is a property of the bytes on disk
 *  or of a missing resource, so re-running cannot change the outcome and a
 *  retry would only burn attempts → the worker routes these to `failPermanently`.
 *  Retryable (true): transient/environmental (dependency down, CLI timeout,
 *  generic parse failure) → normal `fail` path, deadletter after max_attempts.
 */
function translateDoclingError(err: unknown, docId: number): ParseProcessorError {
  if (err instanceof ParseProcessorError) return err;
  if (err instanceof ParserError) {
    switch (err.code) {
      case 'DEPENDENCY_MISSING':
        return new ParseProcessorError('DOCLING_DEPENDENCY_MISSING', `Docling is unavailable for document ${docId}`, true);
      case 'TIMEOUT':
        return new ParseProcessorError('DOCLING_TIMEOUT', `Docling timed out for document ${docId}`, true);
      case 'FILE_NOT_FOUND':
        return new ParseProcessorError('SOURCE_FILE_MISSING', `source file missing for document ${docId}`, false);
      case 'FILE_TOO_LARGE':
        return new ParseProcessorError('SOURCE_FILE_TOO_LARGE', `source file too large for document ${docId}`, false);
      case 'ENCRYPTED':
        return new ParseProcessorError('SOURCE_FILE_ENCRYPTED', `source file is encrypted for document ${docId}`, false);
      case 'CORRUPTED':
        return new ParseProcessorError('SOURCE_FILE_CORRUPTED', `source file is corrupted for document ${docId}`, false);
      case 'EMPTY_FILE':
      case 'EMPTY_CONTENT':
      case 'EMPTY_BUFFER':
        return new ParseProcessorError('SOURCE_FILE_MISSING', `source file is empty for document ${docId}`, false);
      case 'EMPTY_OUTPUT':
        return new ParseProcessorError('DOCLING_EMPTY_OUTPUT', `Docling produced empty output for document ${docId}`, false);
      case 'UNSUPPORTED_FORMAT':
        return new ParseProcessorError('SOURCE_FORMAT_UNRECOGNIZED', `source file format unsupported for document ${docId}`, false);
      case 'PARSE_FAILED':
        return new ParseProcessorError('DOCLING_PARSE_FAILED', `Docling parse failed (${err.code}) for document ${docId}`, true);
      default:
        return new ParseProcessorError('DOCLING_PARSE_FAILED', `Docling parse failed (${err.code}) for document ${docId}`, true);
    }
  }
  // Unknown (non-ParserError) throw from the CLI path → treat as retryable so a
  // transient/environmental fault is not silently dropped.
  return new ParseProcessorError('DOCLING_PARSE_FAILED', `Docling parse failed for document ${docId}`, true);
}

/** Shared fenced publish: extract → chunk → strict-embed → atomic commit. Used
 *  identically by every processor once markdown has been obtained.
 *
 *  `savedImages`/`replaceImages` govern image ownership (P1-B): a full content
 *  re-parse (content re-derived from the source file) passes `replaceImages: true`
 *  and atomically REPLACES ownership; an index-only rebuild (content re-used from
 *  `documents.content`) passes `replaceImages: false` and PRESERVES ownership. */
async function publishMarkdown(
  job: ParseJobRow,
  doc: DocumentRow,
  markdown: string,
  savedImages: string[],
  replaceImages: boolean,
): Promise<void> {
  const elements = extractElements(markdown);
  const chunks = chunkService.chunk(markdown, `doc_${doc.id}`);
  const vectors = chunks.length > 0 ? await embedStrictly(chunks) : [];

  await parseCommitRepository.commitParsedDocument({
    jobId: job.id,
    owner: job.lease_owner ?? '',
    leaseVersion: job.lease_version,
    documentId: doc.id,
    kbId: doc.kb_id,
    title: doc.title,
    content: markdown,
    checksum: sha256(markdown),
    elements,
    chunks,
    vectors,
    savedImages,
    replaceImages,
  });
}

/** Pure-text fast path — the document's `content` is already markdown. */
export function createPureTextProcessor(): PureTextProcessor {
  return async (job: ParseJobRow): Promise<void> => {
    if (job.document_id == null) {
      throw new ParseCommitError('DOCUMENT_GONE', `job ${job.id} has no document_id`);
    }

    // KB-aware read: a soft-deleted document or KB yields undefined → permanent.
    const doc = await knowledgeRepository.findDocumentById(job.document_id);
    if (!doc) {
      throw new ParseCommitError('DOCUMENT_GONE', `document ${job.document_id} not found or its KB is deleted`);
    }

    // Index-only rebuild: content re-used from `doc.content`, image ownership
    // preserved (replaceImages=false, savedImages empty).
    await publishMarkdown(job, doc, doc.content ?? '', [], false);
  };
}

/** Source-file processor — resolve + verify + parse a stored PDF/DOCX/MD/TXT. */
export function createDoclingProcessor(): ParseProcessor {
  return async (job: ParseJobRow): Promise<void> => {
    if (job.document_id == null) {
      throw new ParseCommitError('DOCUMENT_GONE', `job ${job.id} has no document_id`);
    }
    const doc = await knowledgeRepository.findDocumentById(job.document_id);
    if (!doc) {
      throw new ParseCommitError('DOCUMENT_GONE', `document ${job.document_id} not found or its KB is deleted`);
    }
    if (doc.source_id == null) {
      throw new ParseProcessorError('SOURCE_FILE_MISSING', `document ${doc.id} has no source record`, false);
    }
    const source = await knowledgeRepository.findSourceById(doc.source_id);
    if (!source || !source.uri?.startsWith('sources/')) {
      throw new ParseProcessorError('SOURCE_FILE_MISSING', `document ${doc.id} has no stored source file`, false);
    }

    const { markdown, savedImages } = await readSourceMarkdown(doc, source);
    await publishMarkdown(job, doc, markdown, savedImages, true);
  };
}

/** Production router: stored source file → read from disk (Docling for
 *  PDF/DOCX, direct read for MD/TXT); otherwise the pure-text fast path.
 *  Routing is driven by the DB-trusted source record, never the client payload. */
export function createParseProcessor(): ParseProcessor {
  return async (job: ParseJobRow): Promise<void> => {
    if (job.document_id == null) {
      throw new ParseCommitError('DOCUMENT_GONE', `job ${job.id} has no document_id`);
    }
    const doc = await knowledgeRepository.findDocumentById(job.document_id);
    if (!doc) {
      throw new ParseCommitError('DOCUMENT_GONE', `document ${job.document_id} not found or its KB is deleted`);
    }

    if (doc.source_id != null) {
      const source = await knowledgeRepository.findSourceById(doc.source_id);
      if (source?.uri?.startsWith('sources/')) {
        const { markdown, savedImages } = await readSourceMarkdown(doc, source);
        await publishMarkdown(job, doc, markdown, savedImages, true);
        return;
      }
    }

    // No stored source file → pure-text fast path (doc.content is markdown) =
    // index-only rebuild: preserve existing image ownership.
    await publishMarkdown(job, doc, doc.content ?? '', [], false);
  };
}

/** Embed every chunk and enforce the strict contract: all chunks succeed, and
 *  each vector is non-empty and exactly `config.embeddingDimension` wide. Any
 *  violation throws before the fenced commit (no partial publish). */
async function embedStrictly(chunks: ChunkResult[]): Promise<Array<{ chunk_id: string; embedding: number[] }>> {
  const { vectors, failed } = await ollamaEmbedder.embedBatch(chunks.map((c) => c.text));

  if (failed.length > 0) {
    throw new ParseProcessorError(
      'EMBEDDING_FAILED',
      `embedding failed for ${failed.length}/${chunks.length} chunks (first: ${failed[0].error})`,
    );
  }

  if (!Array.isArray(vectors) || vectors.length !== chunks.length) {
    throw new ParseProcessorError(
      'EMBEDDING_RESULT_MALFORMED',
      `embedder returned ${Array.isArray(vectors) ? vectors.length : 'a non-array'} vectors for ${chunks.length} chunks`,
    );
  }

  const rows: Array<{ chunk_id: string; embedding: number[] }> = [];
  for (let i = 0; i < chunks.length; i++) {
    const v = vectors[i];
    if (!v || v.length === 0) {
      throw new ParseProcessorError('EMBEDDING_EMPTY_VECTOR', `empty embedding vector at chunk ${i}`);
    }
    if (v.length !== config.embeddingDimension) {
      throw new ParseProcessorError(
        'EMBEDDING_DIMENSION_MISMATCH',
        `embedding dimension ${v.length} != ${config.embeddingDimension} at chunk ${i}`,
      );
    }
    rows.push({ chunk_id: chunks[i].id, embedding: v });
  }

  return rows;
}
