// Knowledge v2 operations — REST surface for the Operation Registry verbs
// (kb.* / doc.* / folder.*). Each handler resolves a ServiceError onto the wire
// contract (ok/fail) so CLI and MCP clients see identical JSON to the raw HTTP.
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { knowledgeService, ServiceError } from '../../backend/services/knowledge.service.js';
import { elementService } from '../../backend/services/element.service.js';
import { knowledgeChunkService } from '../../backend/services/chunk.service.js';
import { parseJobService } from '../../backend/services/parse-job.service.js';
import { parseApiService } from '../../backend/services/parse-api.service.js';
import { MAX_SOURCE_FILE_BYTES } from '../../backend/storage/source-files.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const knowledgeV2Router = Router();

// Knowledge operations require an authenticated user; public read access with
// visibility filtering is a later phase (P1-05/P1-06).
knowledgeV2Router.use(requireAuth);

/** Merge query + body into one input map (body wins for overlapping keys). */
function inputOf(req: Request): Record<string, any> {
  return { ...(req.query as Record<string, any>), ...(req.body as Record<string, any>) };
}

function toInt(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const ERROR_STATUS: Record<ServiceError['kind'], number> = {
  resource_not_found: 404,
  validation_failed: 400,
  conflict: 409,
  internal: 500,
};

/** Wrap a service call in the wire contract; map ServiceError to HTTP + JSON. */
async function handle(
  op: string,
  req: Request,
  res: Response,
  fn: () => Promise<unknown>,
): Promise<void> {
  const trace = newTraceId();
  try {
    const data = await fn();
    res.json(ok(op, data, trace));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      const status = ERROR_STATUS[err.kind];
      res.status(status).json(fail(op, err.kind as ErrorKindKey, err.message, trace));
      return;
    }
    res.status(500).json(fail(op, 'internal', err?.message ?? 'internal error', trace));
  }
}

// ── Binary source-file upload (TB-1) ───────────────────────────────────────
// multipart with the file held in memory (validated + written by the service,
// never to a client-supplied path). 50 MB cap matches the storage module's
// MAX_SOURCE_FILE_BYTES; only the `file` field is accepted.
const sourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SOURCE_FILE_BYTES, files: 1 },
});

/** Map a MulterError onto a ServiceError so it lands in the wire contract. */
function multerToServiceError(err: unknown): ServiceError {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'LIMIT_FILE_SIZE') {
    return new ServiceError('validation_failed', `file exceeds ${MAX_SOURCE_FILE_BYTES} bytes limit`);
  }
  if (e?.code === 'LIMIT_FILE_COUNT') {
    return new ServiceError('validation_failed', 'exactly one file is required');
  }
  return new ServiceError('validation_failed', `upload rejected: ${e?.message ?? 'invalid multipart request'}`);
}

/** `sourceUpload.single('file')` as middleware, funneling MulterError into the
 *  wire contract (otherwise multer would return a bare non-JSON error). */
function singleSourceFile(req: Request, res: Response, next: NextFunction): void {
  sourceUpload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    void handle('doc.upload_file', req, res, async () => {
      throw multerToServiceError(err);
    });
  });
}

// ── KB ─────────────────────────────────────────────────────────────────────
knowledgeV2Router.post('/kb/create', (req, res) =>
  handle('kb.create', req, res, () =>
    knowledgeService.createKb({ name: req.body?.name, slug: req.body?.slug, description: req.body?.description, visibility: req.body?.visibility })));

knowledgeV2Router.get('/kb/list', (req, res) =>
  handle('kb.list', req, res, () =>
    knowledgeService.listKbs({ page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

knowledgeV2Router.get('/kb/view', (req, res) =>
  handle('kb.view', req, res, async () => {
    const id = toInt(req.query.kb_id);
    if (!id) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.viewKb(id);
  }));

knowledgeV2Router.patch('/kb/update', (req, res) =>
  handle('kb.update', req, res, async () => {
    const id = toInt(inputOf(req).kb_id);
    if (!id) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.updateKb(id, { name: req.body?.name, description: req.body?.description, visibility: req.body?.visibility });
  }));

knowledgeV2Router.delete('/kb/delete', (req, res) =>
  handle('kb.delete', req, res, async () => {
    const id = toInt(inputOf(req).kb_id);
    if (!id) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.deleteKb(id);
  }));

knowledgeV2Router.get('/kb/status', (req, res) =>
  handle('kb.status', req, res, async () => {
    const id = toInt(req.query.kb_id);
    if (!id) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.kbStatus(id);
  }));

knowledgeV2Router.get('/kb/check', (req, res) =>
  handle('kb.check', req, res, () =>
    knowledgeService.checkKb({ kb_id: toInt(req.query.kb_id), slug: req.query.slug as string | undefined })));

// ── Folders (kb.folder_*) ──────────────────────────────────────────────────
knowledgeV2Router.post('/kb/folder_create', (req, res) =>
  handle('kb.folder_create', req, res, async () => {
    const kbId = toInt(inputOf(req).kb_id);
    if (!kbId) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.createFolder({ kb_id: kbId, parent_id: toInt(inputOf(req).parent_id) ?? null, name: inputOf(req).name });
  }));

knowledgeV2Router.get('/kb/folder_list', (req, res) =>
  handle('kb.folder_list', req, res, async () => {
    const kbId = toInt(req.query.kb_id);
    if (!kbId) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.listFolders(kbId);
  }));

knowledgeV2Router.post('/kb/folder_move', (req, res) =>
  handle('kb.folder_move', req, res, async () => {
    const folderId = toInt(inputOf(req).folder_id);
    if (!folderId) throw new ServiceError('validation_failed', 'folder_id is required');
    return knowledgeService.moveFolder(folderId, toInt(inputOf(req).parent_id) ?? null);
  }));

knowledgeV2Router.delete('/kb/folder_delete', (req, res) =>
  handle('kb.folder_delete', req, res, async () => {
    const folderId = toInt(inputOf(req).folder_id);
    if (!folderId) throw new ServiceError('validation_failed', 'folder_id is required');
    return knowledgeService.deleteFolder(folderId);
  }));

// ── Documents ──────────────────────────────────────────────────────────────
knowledgeV2Router.get('/doc/list', (req, res) =>
  handle('doc.list', req, res, () =>
    knowledgeService.listDocuments({ kb_id: toInt(req.query.kb_id), folder_id: toInt(req.query.folder_id), page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

knowledgeV2Router.get('/doc/view', (req, res) =>
  handle('doc.view', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.viewDocument(id);
  }));

knowledgeV2Router.patch('/doc/update', (req, res) =>
  handle('doc.update', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.updateDocument(id, {
      title: req.body?.title,
      summary: req.body?.summary,
      content: req.body?.content,
      visibility: req.body?.visibility,
      folder_id: toInt(inputOf(req).folder_id),
    });
  }));

knowledgeV2Router.delete('/doc/delete', (req, res) =>
  handle('doc.delete', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.deleteDocument(id);
  }));

knowledgeV2Router.post('/doc/restore', (req, res) =>
  handle('doc.restore', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.restoreDocument(id);
  }));

knowledgeV2Router.post('/doc/move', (req, res) =>
  handle('doc.move', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.moveDocument(id, toInt(inputOf(req).folder_id) ?? null);
  }));

knowledgeV2Router.post('/doc/batch', (req, res) =>
  handle('doc.batch', req, res, async () => {
    const ids = req.body?.doc_ids;
    return knowledgeService.batchDeleteDocuments(ids);
  }));

// ── Revisions / source ─────────────────────────────────────────────────────
knowledgeV2Router.get('/doc/revisions', (req, res) =>
  handle('doc.revisions', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.listRevisions(id);
  }));

knowledgeV2Router.get('/doc/revision_view', (req, res) =>
  handle('doc.revision_view', req, res, async () => {
    const id = toInt(req.query.doc_id);
    const no = toInt(req.query.revision_no);
    if (!id || !no) throw new ServiceError('validation_failed', 'doc_id and revision_no are required');
    return knowledgeService.viewRevision(id, no);
  }));

knowledgeV2Router.post('/doc/revision_restore', (req, res) =>
  handle('doc.revision_restore', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    const no = toInt(inputOf(req).revision_no);
    if (!id || !no) throw new ServiceError('validation_failed', 'doc_id and revision_no are required');
    return knowledgeService.restoreRevision(id, no);
  }));

knowledgeV2Router.get('/doc/source_view', (req, res) =>
  handle('doc.source_view', req, res, async () => {
    const id = toInt(req.query.source_id);
    if (!id) throw new ServiceError('validation_failed', 'source_id is required');
    return knowledgeService.viewSource(id);
  }));

// ── Preview / artifacts / export / import (P1-04) ──────────────────────────
knowledgeV2Router.post('/doc/preview', (req, res) =>
  handle('doc.preview', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.previewDocument(id);
  }));

knowledgeV2Router.get('/doc/download', (req, res) =>
  handle('doc.download', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.downloadDocument(id);
  }));

knowledgeV2Router.get('/doc/artifacts', (req, res) =>
  handle('doc.artifacts', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeService.listArtifacts(id);
  }));

knowledgeV2Router.get('/doc/artifact_download', (req, res) =>
  handle('doc.artifact_download', req, res, async () => {
    const id = toInt(req.query.doc_id);
    const name = req.query.name as string | undefined;
    if (!id || !name) throw new ServiceError('validation_failed', 'doc_id and name are required');
    return knowledgeService.getArtifact(id, name);
  }));

knowledgeV2Router.post('/kb/export', (req, res) =>
  handle('kb.export', req, res, async () => {
    const id = toInt(inputOf(req).kb_id);
    if (!id) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.exportKb(id, (inputOf(req).format as string) ?? 'json');
  }));

knowledgeV2Router.post('/kb/import', (req, res) =>
  handle('kb.import', req, res, async () => {
    const id = toInt(inputOf(req).kb_id);
    if (!id) throw new ServiceError('validation_failed', 'kb_id is required');
    return knowledgeService.importKb(id, req.body?.documents);
  }));

// ── P2: upload / import / parse / reparse / wait (P01) ──────────────────────
knowledgeV2Router.post('/doc/upload', (req, res) =>
  handle('doc.upload', req, res, async () => {
    const kbId = toInt(inputOf(req).kb_id);
    if (!kbId) throw new ServiceError('validation_failed', 'kb_id is required');
    return parseApiService.upload({
      kb_id: kbId,
      title: inputOf(req).title,
      content: inputOf(req).content,
      file_name: inputOf(req).file_name,
      file_path: inputOf(req).file_path,
      visibility: inputOf(req).visibility,
      folder_id: toInt(inputOf(req).folder_id) ?? null,
    });
  }));

// Binary source-file upload (PDF/DOCX/MD/TXT ≤50MB). `singleSourceFile` runs
// before the handler so an oversized/malformed multipart is rejected as a
// validation error, and the service then validates type + content + stores the
// file under DATA_DIR/sources (never a client-supplied path).
knowledgeV2Router.post('/doc/upload-file', singleSourceFile, (req, res) =>
  handle('doc.upload_file', req, res, async () => {
    const kbId = toInt(req.body?.kb_id);
    if (!kbId) throw new ServiceError('validation_failed', 'kb_id is required');
    const file = req.file;
    if (!file) throw new ServiceError('validation_failed', 'file is required');
    return parseApiService.uploadFile({
      kb_id: kbId,
      title: req.body?.title as string | undefined,
      visibility: req.body?.visibility as 'public' | 'internal' | undefined,
      folder_id: toInt(req.body?.folder_id) ?? null,
      file: { name: file.originalname, mime: file.mimetype, size: file.size, buffer: file.buffer },
    });
  }));

knowledgeV2Router.post('/doc/import_url', (req, res) =>
  handle('doc.import_url', req, res, async () => {
    const kbId = toInt(inputOf(req).kb_id);
    if (!kbId) throw new ServiceError('validation_failed', 'kb_id is required');
    return parseApiService.importUrl({
      kb_id: kbId,
      url: inputOf(req).url,
      title: inputOf(req).title,
      visibility: inputOf(req).visibility,
      folder_id: toInt(inputOf(req).folder_id) ?? null,
    });
  }));

knowledgeV2Router.post('/doc/parse', (req, res) =>
  handle('doc.parse', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return parseApiService.parse({ doc_id: id });
  }));

knowledgeV2Router.post('/doc/reparse', (req, res) =>
  handle('doc.reparse', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return parseApiService.reparse({ doc_id: id });
  }));

knowledgeV2Router.get('/doc/wait', (req, res) =>
  handle('doc.wait', req, res, async () => {
    const jobId = req.query.job_id as string | undefined;
    if (!jobId) throw new ServiceError('validation_failed', 'job_id is required');
    return parseApiService.wait({ job_id: jobId, timeout_ms: toInt(req.query.timeout_ms) });
  }));

// ── P2: parsed elements (P02) ───────────────────────────────────────────────
knowledgeV2Router.get('/doc/images', (req, res) =>
  handle('doc.images', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return elementService.listImages(id);
  }));

knowledgeV2Router.get('/doc/tables', (req, res) =>
  handle('doc.tables', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return elementService.listTables(id);
  }));

knowledgeV2Router.post('/doc/ocr', (req, res) =>
  handle('doc.ocr', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return elementService.ocr(id);
  }));

// ── P2: chunks (P03) ────────────────────────────────────────────────────────
knowledgeV2Router.get('/chunk/list', (req, res) =>
  handle('chunk.list', req, res, async () => {
    const id = toInt(req.query.doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeChunkService.list(id);
  }));

knowledgeV2Router.get('/chunk/view', (req, res) =>
  handle('chunk.view', req, res, async () => {
    const id = toInt(req.query.doc_id);
    const chunkId = req.query.chunk_id as string | undefined;
    if (!id || !chunkId) throw new ServiceError('validation_failed', 'doc_id and chunk_id are required');
    return knowledgeChunkService.view(id, chunkId);
  }));

knowledgeV2Router.post('/chunk/preview', (req, res) =>
  handle('chunk.preview', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    if (!id) throw new ServiceError('validation_failed', 'doc_id is required');
    return knowledgeChunkService.preview(id, {
      strategy: inputOf(req).strategy,
      chunk_size: toInt(inputOf(req).chunk_size),
      overlap: toInt(inputOf(req).overlap),
      min_chunk_size: toInt(inputOf(req).min_chunk_size),
    });
  }));

knowledgeV2Router.patch('/chunk/update', (req, res) =>
  handle('chunk.update', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    const chunkId = inputOf(req).chunk_id as string | undefined;
    const text = inputOf(req).text as string | undefined;
    if (!id || !chunkId) throw new ServiceError('validation_failed', 'doc_id and chunk_id are required');
    return knowledgeChunkService.update(id, chunkId, text ?? '');
  }));

knowledgeV2Router.delete('/chunk/delete', (req, res) =>
  handle('chunk.delete', req, res, async () => {
    const id = toInt(inputOf(req).doc_id);
    const chunkId = inputOf(req).chunk_id as string | undefined;
    if (!id || !chunkId) throw new ServiceError('validation_failed', 'doc_id and chunk_id are required');
    return knowledgeChunkService.remove(id, chunkId);
  }));

// ── P2: durable parse jobs (P04) + deadletters (O03) ────────────────────────
knowledgeV2Router.get('/job/parse_status', (req, res) =>
  handle('job.parse_status', req, res, async () => {
    const jobId = req.query.job_id as string | undefined;
    if (!jobId) throw new ServiceError('validation_failed', 'job_id is required');
    return parseJobService.status(jobId);
  }));

knowledgeV2Router.post('/job/parse_retry', (req, res) =>
  handle('job.parse_retry', req, res, async () => {
    const jobId = inputOf(req).job_id as string | undefined;
    if (!jobId) throw new ServiceError('validation_failed', 'job_id is required');
    return parseJobService.retry(jobId);
  }));

knowledgeV2Router.post('/job/parse_cancel', (req, res) =>
  handle('job.parse_cancel', req, res, async () => {
    const jobId = inputOf(req).job_id as string | undefined;
    if (!jobId) throw new ServiceError('validation_failed', 'job_id is required');
    return parseJobService.cancel(jobId);
  }));

knowledgeV2Router.post('/job/deadletters', (req, res) =>
  handle('job.deadletters', req, res, () => parseJobService.deadletters()));

knowledgeV2Router.post('/job/replay_deadletter', (req, res) =>
  handle('job.replay_deadletter', req, res, async () => {
    const id = inputOf(req).deadletter_id as string | undefined;
    if (!id) throw new ServiceError('validation_failed', 'deadletter_id is required');
    return parseJobService.replayDeadletter(id);
  }));
