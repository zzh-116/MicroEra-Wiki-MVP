// Parse API service (P2-06) — the doc.upload / doc.import_url / doc.parse /
// doc.reparse / doc.wait operations. These create a document + source +
// revision, enqueue a durable parse job, and let callers poll the job. The
// heavy parse→chunk→embed→index pipeline (P2-05 ingestService) runs against the
// job, so these operations return "document + job", never "already indexed".
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { parseJobService } from './parse-job.service.js';
import { sha256 } from '../utils/hash.js';
import { ServiceError } from './knowledge.service.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { writeSourceFile, removeSourceFile, SourceFileError } from '../storage/source-files.js';
import { safeFetchText, SafeFetchError } from './ssrf-fetch.js';

const logger = createLogger('parse-api');

export interface UploadInput {
  kb_id: number;
  title?: string;
  content?: string;
  file_name?: string;
  file_path?: string;
  visibility?: 'public' | 'internal';
  folder_id?: number | null;
}

export interface ImportUrlInput {
  kb_id: number;
  url: string;
  title?: string;
  visibility?: 'public' | 'internal';
  folder_id?: number | null;
}

/** doc.upload-file — a binary source file (PDF/DOCX/MD/TXT), already read into
 *  memory by the route (multer), to be stored under DATA_DIR/sources and enqueued. */
export interface UploadFileInput {
  kb_id: number;
  title?: string;
  visibility?: 'public' | 'internal';
  folder_id?: number | null;
  file: { name: string; mime: string; size: number; buffer: Buffer };
}

export interface JobHandle {
  document_id: number;
  job_id: string;
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export class ParseApiService {
  private async createAndEnqueue(
    kbId: number,
    input: {
      title: string;
      content: string;
      sourceType: 'file' | 'url';
      sourceName: string;
      file_name?: string | null;
      visibility?: 'public' | 'internal';
      folder_id?: number | null;
      payload?: Record<string, unknown>;
      /** Binary source-file reference (TB-1): relative `sources/<uuid>.<ext>`. */
      uri?: string | null;
      /** Precomputed source checksum (binary upload); text defaults to sha256(content). */
      checksum?: string;
      /** Precomputed source byte size (binary upload); text defaults to byteLength. */
      fileSize?: number;
    },
  ): Promise<JobHandle> {
    const kb = await knowledgeRepository.findKbById(kbId);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${kbId} not found`);

    const content = input.content ?? '';
    const checksum = input.checksum ?? sha256(content);
    const fileSize = input.fileSize ?? Buffer.byteLength(content, 'utf8');
    const source = await knowledgeRepository.createSource({
      kbId,
      type: input.sourceType,
      name: input.sourceName,
      uri: input.uri ?? null,
      checksum,
    });
    const document = await knowledgeRepository.createDocument({
      kbId,
      sourceId: source.id,
      folderId: input.folder_id ?? null,
      title: input.title,
      content,
      visibility: input.visibility ?? 'internal',
      fileName: input.file_name ?? null,
      fileSize,
      fileHash: checksum,
      parseStatus: 'pending',
    });
    await knowledgeRepository.createRevision({
      documentId: document.id,
      revisionNo: 1,
      title: document.title,
      content,
      checksum,
    });
    const job = await parseJobService.enqueue({
      document_id: document.id,
      kb_id: kbId,
      payload: { action: 'parse', ...(input.payload ?? {}) },
    });
    // Mark this job as the document's current task so a fenced commit can
    // reject a stale (superseded) worker later.
    await knowledgeRepository.setCurrentParseJob(document.id, job.job_id);
    return { document_id: document.id, job_id: job.job_id };
  }

  /** doc.upload — accept content (text/markdown) into a KB and enqueue a parse. */
  async upload(input: UploadInput): Promise<JobHandle> {
    const title = (input.title ?? input.file_name ?? 'Untitled').trim();
    if (!title) throw new ServiceError('validation_failed', 'title is required');
    return this.createAndEnqueue(input.kb_id, {
      title,
      content: input.content ?? '',
      sourceType: 'file',
      sourceName: input.file_name ?? title,
      file_name: input.file_name ?? null,
      visibility: input.visibility,
      folder_id: input.folder_id,
    });
  }

  /** doc.upload-file — validate + store a binary source file under
   *  DATA_DIR/sources, then create the source/document/revision and enqueue a
   *  parse job. On any DB/enqueue failure the just-written file is removed
   *  (compensation); a failed cleanup is audited (persisted ERROR log). */
  async uploadFile(input: UploadFileInput): Promise<JobHandle> {
    const title = (input.title ?? input.file.name ?? 'Untitled').trim();
    if (!title) throw new ServiceError('validation_failed', 'title is required');
    if (input.visibility && !['public', 'internal'].includes(input.visibility)) {
      throw new ServiceError('validation_failed', `invalid visibility "${input.visibility}"`);
    }

    // The KB must exist and be active BEFORE we write anything — a bad KB must
    // not leave an orphan file on disk.
    const kb = await knowledgeRepository.findKbById(input.kb_id);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${input.kb_id} not found`);

    // Validate (extension + content feature + MIME, size, path) and write under
    // DATA_DIR/sources. Any violation throws before the database is touched.
    let written;
    try {
      written = writeSourceFile(config.dataDir, input.file.buffer, {
        name: input.file.name,
        mime: input.file.mime,
      });
    } catch (err) {
      if (err instanceof SourceFileError) {
        const kind =
          err.code === 'WRITE_FAILED' || err.code === 'INVALID_STORED_NAME'
            ? 'internal'
            : 'validation_failed';
        throw new ServiceError(kind, err.message);
      }
      throw err;
    }

    try {
      return await this.createAndEnqueue(input.kb_id, {
        title,
        content: '',
        sourceType: 'file',
        sourceName: input.file.name,
        file_name: input.file.name,
        visibility: input.visibility,
        folder_id: input.folder_id,
        uri: written.uri,
        checksum: written.checksum,
        fileSize: written.size,
        payload: { action: 'parse', format: written.format, source_file: written.uri },
      });
    } catch (err) {
      // Compensation: the file is on disk but create/enqueue failed — remove it
      // so no orphan file survives a DB failure. A cleanup failure is audited.
      const removed = removeSourceFile(config.dataDir, written.storedName);
      if (!removed) {
        logger.error('source-file compensation cleanup failed', err as Error, {
          storedName: written.storedName,
          uri: written.uri,
          absolutePath: written.absolutePath,
        });
      }
      throw err;
    }
  }

  /** doc.import_url — fetch a URL's text, create a document, enqueue a parse.
   *  The fetch goes through the SSRF guard (ssrf-fetch.ts): scheme whitelist,
   *  credential rejection, DNS validation against public ranges only, DNS
   *  pinning (no rebinding), redirects denied, timeout + size cap. Errors are
   *  surfaced without the URL or response body. */
  async importUrl(input: ImportUrlInput): Promise<JobHandle> {
    const url = input.url?.trim();
    if (!url) throw new ServiceError('validation_failed', 'url is required');
    const kb = await knowledgeRepository.findKbById(input.kb_id);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${input.kb_id} not found`);

    let content: string;
    try {
      content = await safeFetchText(url);
    } catch (err) {
      if (err instanceof SafeFetchError) {
        // Client-fixable (bad URL / non-public target) → 400; runtime failures → 500.
        const clientKinds: SafeFetchError['kind'][] = [
          'invalid_url',
          'unsupported_scheme',
          'ssrf_blocked',
          'dns_error',
        ];
        const kind: 'validation_failed' | 'internal' = clientKinds.includes(err.kind)
          ? 'validation_failed'
          : 'internal';
        throw new ServiceError(kind, err.message);
      }
      throw new ServiceError('internal', 'failed to import URL');
    }

    const title = (input.title ?? url).trim();
    return this.createAndEnqueue(input.kb_id, {
      title,
      content,
      sourceType: 'url',
      sourceName: url,
      file_name: null,
      visibility: input.visibility,
      folder_id: input.folder_id,
    });
  }

  /** doc.parse — enqueue a parse job for an existing document. */
  async parse(input: { doc_id: number }): Promise<JobHandle> {
    const doc = await knowledgeRepository.findDocumentById(input.doc_id);
    if (!doc) throw new ServiceError('resource_not_found', `document ${input.doc_id} not found`);
    const job = await parseJobService.enqueue({
      document_id: doc.id,
      kb_id: doc.kb_id,
      payload: { action: 'parse' },
    });
    await knowledgeRepository.setCurrentParseJob(doc.id, job.job_id);
    return { document_id: doc.id, job_id: job.job_id };
  }

  /** doc.reparse — force a re-parse of an existing document. */
  async reparse(input: { doc_id: number }): Promise<JobHandle> {
    const doc = await knowledgeRepository.findDocumentById(input.doc_id);
    if (!doc) throw new ServiceError('resource_not_found', `document ${input.doc_id} not found`);
    const job = await parseJobService.enqueue({
      document_id: doc.id,
      kb_id: doc.kb_id,
      payload: { action: 'reparse', force: true },
    });
    await knowledgeRepository.setCurrentParseJob(doc.id, job.job_id);
    return { document_id: doc.id, job_id: job.job_id };
  }

  /** doc.wait — poll a parse job until it reaches a terminal state or times out. */
  async wait(input: { job_id: string; timeout_ms?: number }): Promise<{ job_id: string; status: string; document_id: number | null }> {
    if (!input.job_id) throw new ServiceError('validation_failed', 'job_id is required');
    const timeout = input.timeout_ms ?? 30000;
    const deadline = Date.now() + timeout;
    let status = await parseJobService.status(input.job_id);
    while (!TERMINAL.has(status.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      status = await parseJobService.status(input.job_id);
    }
    return { job_id: status.job_id, status: status.status, document_id: status.document_id };
  }
}

export const parseApiService = new ParseApiService();
