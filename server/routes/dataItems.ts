import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dataItemRepository } from '../../backend/repositories/data-item.repository.js';
export const dataItemsRouter = Router();
dataItemsRouter.use(requireAuth);
dataItemsRouter.get('/', async (req: Request, res: Response) => {
  const eid = req.query.entry_id ? Number(req.query.entry_id) : undefined;
  if (eid) { res.json(await dataItemRepository.findByEntryId(eid) || null); return; }
  res.json(await dataItemRepository.findAll());
});
dataItemsRouter.put('/', async (req: Request, res: Response) => {
  res.json(await dataItemRepository.upsert(req.body));
});
dataItemsRouter.delete('/:id', async (req: Request, res: Response) => {
  await dataItemRepository.delete(Number(req.params.id));
  res.json({ success: true });
});
