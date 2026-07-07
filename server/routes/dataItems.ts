import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { metadataStore } from '../../backend/metadata/store.js';

export const dataItemsRouter = Router();
dataItemsRouter.use(requireAuth);

dataItemsRouter.get('/', (req: Request, res: Response) => {
  const entryId = req.query.entry_id ? Number(req.query.entry_id) : undefined;
  if (entryId) {
    res.json(metadataStore.getDataItemByEntryId(entryId) || null);
    return;
  }
  res.json(metadataStore.getDataItems());
});

dataItemsRouter.put('/', (req: Request, res: Response) => {
  res.json(metadataStore.saveDataItem(req.body));
});

dataItemsRouter.delete('/:id', (req: Request, res: Response) => {
  metadataStore.deleteDataItem(Number(req.params.id));
  res.json({ success: true });
});
