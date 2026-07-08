import { Router, Request, Response } from 'express';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { optionalAuth } from '../middleware/auth.js';
export const graphRouter = Router();

graphRouter.get('/global', optionalAuth, async (_req: Request, res: Response) => {
  const isInternal = (_req as any).isInternal === true;
  const all = await entryRepository.findMany({ isInternal });
  const nodes = all.map((e) => ({ id: `gn-${e.id}`, label: e.title, type: e.entry_type, entryId: String(e.id), description: e.summary }));
  const edges: Array<{ id: string; source: string; target: string; relation: string; description: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const shared = all[i].tags.filter((t) => all[j].tags.includes(t));
      if (shared.length > 0) {
        const key = `${all[i].id}-${all[j].id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ id: `ge-${all[i].id}-${all[j].id}`, source: `gn-${all[i].id}`, target: `gn-${all[j].id}`, relation: 'shared_tags', description: `共享标签: ${shared.slice(0, 3).join(', ')}` });
        }
      }
    }
  }
  res.json({ nodes, edges });
});

graphRouter.get('/focused', optionalAuth, async (req: Request, res: Response) => {
  const eid = parseInt(req.query.entryId as string, 10);
  if (isNaN(eid)) { res.json({ nodes: [], edges: [] }); return; }
  const isInternal = (req as any).isInternal === true;
  const all = await entryRepository.findMany({ isInternal });
  const center = all.find((e) => e.id === eid);
  if (!center) { res.json({ nodes: [], edges: [] }); return; }
  const cn = `gn-${center.id}`;
  const nodes = [{ id: cn, label: center.title, type: center.entry_type, entryId: String(center.id), description: center.summary }];
  const edges: Array<{ id: string; source: string; target: string; relation: string; description: string }> = [];
  for (const e of all) {
    if (e.id === center.id) continue;
    const shared = center.tags.filter((t) => e.tags.includes(t));
    if (shared.length > 0) {
      nodes.push({ id: `gn-${e.id}`, label: e.title, type: e.entry_type, entryId: String(e.id), description: e.summary });
      edges.push({ id: `ge-${center.id}-${e.id}`, source: cn, target: `gn-${e.id}`, relation: 'shared_tags', description: `共享标签: ${shared.slice(0, 3).join(', ')}` });
    }
  }
  res.json({ nodes, edges });
});
