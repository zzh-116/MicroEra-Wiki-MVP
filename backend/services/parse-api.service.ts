// Parse API service (P2-06) — the doc.upload / doc.import_url / doc.parse /
// doc.reparse / doc.wait operations. These create a document + source +
// revision, enqueue a durable parse job, and let callers poll the job. The
// heavy parse→chunk→embed→index pipeline (P2-05 ingestService) runs against the
// job, so these operations return "document + job", never "already indexed".
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { parseJobService } from './parse-job.service.js';
import { sha256 } from '../utils/hash.js';
import { ServiceError } from './knowledge.service.js';

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
    },
  ): Promise<JobHandle> {
    const kb = await knowledgeRepository.findKbById(kbId);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${kbId} not found`);

    const content = input.content ?? '';
    const checksum = sha256(content);
    const source = await knowledgeRepository.createSource({
      kbId,
      type: input.sourceType,
      name: input.sourceName,
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
      fileSize: Buffer.byteLength(content, 'utf8'),
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

  /** doc.import_url — fetch a URL's text, create a document, enqueue a parse. */
  async importUrl(input: ImportUrlInput): Promise<JobHandle> {
    const url = input.url?.trim();
    if (!url) throw new ServiceError('validation_failed', 'url is required');
    const kb = await knowledgeRepository.findKbById(input.kb_id);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${input.kb_id} not found`);

    let content: string;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      content = await res.text();
    } catch (err) {
      throw new ServiceError('internal', `failed to import URL: ${(err as Error).message}`);
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
