import { Router, Request, Response } from 'express';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { buildGlobalGraph, buildSeedGraph, resolveLabel, toChineseType } from '../../backend/services/graph-seed.service.js';
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
  const graph = await buildSeedGraph(ids, isInternal);
  res.json(graph);
});

graphRouter.get('/global', optionalAuth, async (_req: Request, res: Response) => {
  const isInternal = (_req as any).isInternal === true;
  const all = await entryRepository.findAllDistinctByTitle({ isInternal });
  res.json(buildGlobalGraph(all));
});

graphRouter.get('/focused', optionalAuth, async (req: Request, res: Response) => {
  const eid = parseInt(req.query.entryId as string, 10);
  if (isNaN(eid)) { res.json({ nodes: [], edges: [] }); return; }
  const isInternal = (req as any).isInternal === true;
  const all = await entryRepository.findAllDistinctByTitle({ isInternal });
  const center = all.find((e) => e.id === eid);
  if (!center) { res.json({ nodes: [], edges: [] }); return; }
  const cn = String(center.id);
  const nodes = [{ id: cn, label: resolveLabel(center), type: toChineseType(center.entry_type), metadata: { title: resolveLabel(center), author: '', tags: center.tags || [], summary: center.summary, updatedAt: center.updated_at } }];
  const edges: Array<{ id: string; source: string; target: string; relation: string; description: string }> = [];
  for (const e of all) {
    if (e.id === center.id) continue;
    const shared = center.tags.filter((t) => e.tags.includes(t));
    if (shared.length > 0) {
      nodes.push({ id: String(e.id), label: resolveLabel(e), type: toChineseType(e.entry_type), metadata: { title: resolveLabel(e), author: '', tags: e.tags || [], summary: e.summary, updatedAt: e.updated_at } });
      edges.push({ id: `ge-${center.id}-${e.id}`, source: cn, target: String(e.id), relation: 'shared_tags', label: 'shared_tags', description: `共享标签: ${shared.slice(0, 3).join(', ')}` });
    }
  }
  res.json({ nodes, edges });
});
