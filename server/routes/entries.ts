import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';

export const entriesRouter = Router();

entriesRouter.get('/', optionalAuth, async (req: Request, res: Response) => {
  const params = req.query as Record<string, string | undefined>;
  // Use findAll by default (backward-compatible: returns all entries for callers
  // that don't pass page/pageSize). Only paginate when explicitly requested.
  const hasPagination = 'page' in params || 'pageSize' in params;
  if (hasPagination) {
    const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize || '10', 10) || 10));
    const result = await entryRepository.findMany({
      keyword: params.keyword,
      entry_type: params.entry_type,
      visibility: params.visibility,
      category_id: params.category_id,
      tag: params.tag,
      isInternal: req.isInternal,
      page,
      pageSize,
    });
    res.json({ entries: result.entries, total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages });
  } else {
    const entries = await entryRepository.findAll({
      keyword: params.keyword,
      entry_type: params.entry_type,
      visibility: params.visibility,
      category_id: params.category_id,
      tag: params.tag,
      isInternal: req.isInternal,
    });
    res.json(entries);
  }
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
