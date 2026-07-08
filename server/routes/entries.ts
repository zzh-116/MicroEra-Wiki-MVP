import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';

export const entriesRouter = Router();

entriesRouter.get('/', optionalAuth, async (req: Request, res: Response) => {
  const params = req.query as Record<string, string | undefined>;
  const result = await entryRepository.findMany({
    keyword: params.keyword,
    entry_type: params.entry_type,
    visibility: params.visibility,
    category_id: params.category_id,
    tag: params.tag,
    isInternal: req.isInternal,
  });
  res.json(result);
});

entriesRouter.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const entry = await entryRepository.findById(Number(req.params.id));
  if (!entry) { res.status(404).json({ error: 'ENTRY_NOT_FOUND', message: '条目不存在' }); return; }
  if (entry.visibility === 'internal' && !req.isInternal) {
    res.status(403).json({ error: 'UNAUTHORIZED_INTERNAL_VIEW', message: '无权查看内部条目' }); return;
  }
  res.json(entry);
});

entriesRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const entry = await entryRepository.create({ ...req.body, created_by: req.user?.userId });
  res.status(201).json(entry);
});

entriesRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await entryRepository.update(Number(req.params.id), req.body));
  } catch {
    res.status(404).json({ error: 'ENTRY_NOT_FOUND', message: '条目不存在' });
  }
});

entriesRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  await entryRepository.softDelete(Number(req.params.id));
  res.json({ success: true });
});
