// Authenticated extracted-image route. Replaces the former unauthenticated
// `express.static` mount on `/api/images`, which let a guessed image file name
// bypass the parent-KB soft-delete access control (P1-2).
//
// An image is served only when ALL of these hold:
//   1. the request carries a valid bearer token (`requireAuth` → 401 otherwise),
//   2. the name is a single plain filename (no path separators / `..` traversal),
//   3. the name is registered in `document_images` (trusted parse provenance)
//      for a non-deleted document in an active knowledge base, and
//   4. the file actually exists under DATA_DIR/images.
import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { documentImageRepository } from '../../backend/repositories/document-image.repository.js';
import { config } from '../../backend/config.js';

export const imagesRouter = Router();

// Parser-generated names look like `img_<timestamp>_<index>.<ext>`. Constrain
// to a single safe filename segment so a request can never escape the images
// directory. `..` is additionally rejected (the regex alone would allow it).
const IMAGE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Reject traversal / malformed image names before any filesystem or DB access. */
export function isValidImageName(name: string): boolean {
  return IMAGE_NAME_RE.test(name) && !name.includes('..') && path.basename(name) === name;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
};

imagesRouter.get('/:name', requireAuth, async (req: Request, res: Response) => {
  const name = req.params.name ?? '';

  // Path-traversal / malformed-name guard before any filesystem or DB access.
  if (!isValidImageName(name)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid image name' });
    return;
  }

  // Object-level authorization: the image must be owned (trusted parse
  // provenance) by a non-deleted document in an active knowledge base.
  if (!(await documentImageRepository.isImageAccessible(name))) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Image not found' });
    return;
  }

  const filePath = path.join(config.dataDir, 'images', name);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Image not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', MIME_BY_EXT[path.extname(name).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', String(stat.size));
  // Protected content: forbid the browser and any intermediary proxy/shared cache
  // from storing the response, so it can never be replayed to a viewer whose
  // authorization has since changed (logout, token expiry, or role change).
  // `no-store` also defeats conditional re-requests; the stream below writes raw
  // headers, so Express emits no ETag/Last-Modified and no 304 revalidation path
  // exists — the image is always re-authorized on every request.
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});
