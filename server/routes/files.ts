import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { fileRepository } from '../../backend/repositories/file.repository.js';
export const filesRouter = Router();
filesRouter.get('/', optionalAuth, async (req: Request, res: Response) => {
  const eid = req.query.entry_id ? Number(req.query.entry_id) : undefined;
  res.json(await fileRepository.findByEntryId(eid, req.isInternal));
});
filesRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  res.status(201).json(await fileRepository.create(req.body));
});
filesRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  await fileRepository.delete(Number(req.params.id));
  res.json({ success: true });
});
