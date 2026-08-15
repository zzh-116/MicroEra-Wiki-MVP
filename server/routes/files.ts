import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { fileRepository } from '../../backend/repositories/file.repository.js';
import { config } from '../../backend/config.js';
import type { FileCreateInput } from '../../backend/repositories/file.repository.js';
export const filesRouter = Router();

/** Resolve a storage_path under DATA_DIR and reject traversal outside it. */
export function resolveDataFilePath(dataDir: string, storagePath: string): string {
  const root = path.resolve(dataDir);
  const target = path.resolve(root, storagePath || '');
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('INVALID_STORAGE_PATH');
  }
  return target;
}

/** Strip server-owned object storage metadata from client input. */
export function sanitizeFileCreateInput(
  body: Record<string, unknown> | null | undefined,
): Omit<FileCreateInput, 'objectKey' | 'objectBucket' | 'sha256' | 'contentType'> {
  const safe = { ...(body ?? {}) } as Record<string, unknown>;
  delete safe.objectKey;
  delete safe.objectBucket;
  delete safe.sha256;
  delete safe.contentType;
  return safe as Omit<FileCreateInput, 'objectKey' | 'objectBucket' | 'sha256' | 'contentType'>;
}

filesRouter.get('/', optionalAuth, async (req: Request, res: Response) => {
  const eid = req.query.entry_id ? Number(req.query.entry_id) : undefined;
  res.json(await fileRepository.findByEntryId(eid, req.isInternal));
});
filesRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const safe = sanitizeFileCreateInput(req.body);
  res.status(201).json(await fileRepository.create(safe as FileCreateInput));
});
filesRouter.get('/:id/download', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid file id' });
      return;
    }

    const file = await fileRepository.findByIdForUser(id, req.isInternal);
    if (!file) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'File not found' });
      return;
    }

    let resolvedPath: string;
    try {
      resolvedPath = resolveDataFilePath(config.dataDir, file.storage_path);
    } catch {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid storage path' });
      return;
    }

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Local file not found' });
      return;
    }

    const stat = fs.statSync(resolvedPath);
    res.setHeader('Content-Type', file.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`,
    );
    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: 'DOWNLOAD_FAILED', message: err.message });
  }
});
filesRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  await fileRepository.delete(Number(req.params.id));
  res.json({ success: true });
});
