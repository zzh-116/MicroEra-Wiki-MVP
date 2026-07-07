import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { metadataStore } from '../../backend/metadata/store.js';

export const filesRouter = Router();

filesRouter.get('/', optionalAuth, (req: Request, res: Response) => {
  const entryId = req.query.entry_id ? Number(req.query.entry_id) : undefined;
  res.json(metadataStore.getFiles(entryId, req.isInternal));
});

filesRouter.post('/', requireAuth, (req: Request, res: Response) => {
  res.status(201).json(metadataStore.createFile(req.body));
});

filesRouter.delete('/:id', requireAuth, (req: Request, res: Response) => {
  metadataStore.deleteFile(Number(req.params.id));
  res.json({ success: true });
});
