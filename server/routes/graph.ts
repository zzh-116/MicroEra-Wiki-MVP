import { Router, Request, Response } from 'express';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { relationRepository } from '../../backend/repositories/relation.repository.js';
import {
  buildSeedGraphFromRelations,
  buildGlobalGraphFromRelations,
  buildFocusedGraphFromRelations,
} from '../../backend/services/graph-seed.service.js';
import { optionalAuth } from '../middleware/auth.js';

export const graphRouter = Router();

graphRouter.get('/seed', optionalAuth, async (req: Request, res: Response) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ error: 'MISSING_IDS', message: 'Provide ids like ?ids=1,2,3,4,5' });
    return;
  }
  const isInternal = (req as any).isInternal === true;
  const all = await entryRepository.findAll({ isInternal });
  const relations = await relationRepository.findByEntryIds(all.map((e) => e.id));
  res.json(buildSeedGraphFromRelations(ids, all, relations));
});

graphRouter.get('/global', optionalAuth, async (_req: Request, res: Response) => {
  const isInternal = (_req as any).isInternal === true;
  const all = await entryRepository.findAll({ isInternal });
  const relations = await relationRepository.findByEntryIds(all.map((e) => e.id));
  res.json(buildGlobalGraphFromRelations(all, relations));
});

graphRouter.get('/focused', optionalAuth, async (req: Request, res: Response) => {
  const eid = parseInt(req.query.entryId as string, 10);
  if (isNaN(eid)) { res.json({ nodes: [], edges: [] }); return; }
  const isInternal = (req as any).isInternal === true;
  const all = await entryRepository.findAll({ isInternal });
  const center = all.find((e) => e.id === eid);
  if (!center) { res.json({ nodes: [], edges: [] }); return; }
  const relations = await relationRepository.findByEntryIds(all.map((e) => e.id));
  res.json(buildFocusedGraphFromRelations(center, all, relations));
});
