// Knowledge v2 operations — REST surface for the Operation Registry verbs
// (kb.* / doc.* / folder.*). Each handler resolves a ServiceError onto the wire
// contract (ok/fail) so CLI and MCP clients see identical JSON to the raw HTTP.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { knowledgeService, ServiceError } from '../../backend/services/knowledge.service.js';
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
