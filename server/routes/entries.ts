import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { metadataStore } from '../../backend/metadata/store.js';

export const entriesRouter = Router();

entriesRouter.get('/', optionalAuth, (req: Request, res: Response) => {
  const params = req.query as Record<string, string | undefined>;
  res.json(metadataStore.getEntries(params, req.isInternal));
});

entriesRouter.get('/:id', optionalAuth, (req: Request, res: Response) => {
  const entry = metadataStore.getEntryById(Number(req.params.id));
  if (!entry) { res.status(404).json({ error: 'ENTRY_NOT_FOUND', message: '条目不存在' }); return; }
  if (entry.visibility === 'internal' && !req.isInternal) {
    res.status(403).json({ error: 'UNAUTHORIZED_INTERNAL_VIEW', message: '无权查看内部条目' }); return;
  }
  res.json(entry);
});

entriesRouter.post('/', requireAuth, (req: Request, res: Response) => {
  res.status(201).json(metadataStore.createEntry(req.body));
});

entriesRouter.put('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    res.json(metadataStore.updateEntry(Number(req.params.id), req.body));
  } catch {
    res.status(404).json({ error: 'ENTRY_NOT_FOUND', message: '条目不存在' });
  }
});

entriesRouter.delete('/:id', requireAuth, (req: Request, res: Response) => {
  metadataStore.deleteEntry(Number(req.params.id));
  res.json({ success: true });
});
