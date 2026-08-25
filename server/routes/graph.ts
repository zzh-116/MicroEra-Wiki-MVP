import { Router, Request, Response } from 'express';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { relationRepository } from '../../backend/repositories/relation.repository.js';
import type { EntryRelationRow } from '../../backend/repositories/relation.repository.js';
import {
  buildSeedGraphFromRelations,
  buildGlobalGraphFromRelations,
  buildFocusedGraphFromRelations,
  toChineseType,
} from '../../backend/services/graph-seed.service.js';
import { searchService } from '../../backend/services/search.service.js';
import { optionalAuth } from '../middleware/auth.js';

export const graphRouter = Router();

/**
 * TEST/COMPAT interface: fixed seed graph kept for compatibility.
 * The interactive page should use /api/graph/search + /api/graph/focused.
 */
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
  const relations = await relationRepository.findByEntryIds(all.map((e) => e.id), 120);
  res.json(buildSeedGraphFromRelations(ids, all, relations));
});

/** Search entries by keyword and return the best matching knowledge node. */
graphRouter.get('/search', optionalAuth, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'MISSING_QUERY', message: 'Provide q=keyword' });
    return;
  }
  const isInternal = (req as any).isInternal === true;
  try {
    const results = await searchService.semanticSearch(q, isInternal, 5);
    const best = results.find((r) => r.entry);
    if (!best?.entry) {
      res.json({ entryId: null, title: '', summary: '', type: '' });
      return;
    }
    res.json({
      entryId: best.entry.id,
      title: best.entry.title,
      summary: best.entry.summary,
      type: toChineseType(best.entry.entry_type),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'SEARCH_FAILED', message: err.message });
  }
});

graphRouter.get('/global', optionalAuth, async (_req: Request, res: Response) => {
  const isInternal = (_req as any).isInternal === true;
  const all = await entryRepository.findAll({ isInternal });
  // Bound the fetch: the global builder already slices to 3000 edges / 1000 nodes.
  const relations = await relationRepository.findByEntryIds(all.map((e) => e.id), 3000);
  res.json(buildGlobalGraphFromRelations(all, relations));
});

graphRouter.get('/focused', optionalAuth, async (req: Request, res: Response) => {
  const eid = parseInt(req.query.entryId as string, 10);
  if (isNaN(eid)) { res.json({ nodes: [], edges: [] }); return; }
  const isInternal = (req as any).isInternal === true;
  const depth = Math.min(Math.max(1, parseInt(req.query.depth as string || '1', 10) || 1), 4);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit as string || '30', 10) || 30), 50);

  const center = await entryRepository.findById(eid);
  if (!center) { res.json({ nodes: [], edges: [] }); return; }
  // External visitors must not see internal entries inside the graph.
  if (!isInternal && center.visibility !== 'public') { res.json({ nodes: [], edges: [] }); return; }

  // SQL-bounded BFS over persisted relations — no full-table scan per request.
  const visitedIds = new Set<number>([eid]);
  let frontier: number[] = [eid];
  const relations: EntryRelationRow[] = [];
  const seenRelations = new Set<number>();

  for (let d = 0; d < depth && frontier.length > 0 && visitedIds.size < limit; d++) {
    const touched = await relationRepository.findTouching(frontier, Math.max(limit * 4, 200));
    const next: number[] = [];
    for (const rel of touched) {
      if (!seenRelations.has(rel.id)) { seenRelations.add(rel.id); relations.push(rel); }
      for (const id of [rel.sourceEntryId, rel.targetEntryId]) {
        if (!visitedIds.has(id) && visitedIds.size < limit) { visitedIds.add(id); next.push(id); }
      }
    }
    frontier = next;
  }

  // Cross-links inside the visited subgraph so the local view stays connected.
  const within = await relationRepository.findWithin([...visitedIds], Math.max(limit * 6, 300));
  for (const rel of within) {
    if (!seenRelations.has(rel.id)) { seenRelations.add(rel.id); relations.push(rel); }
  }

  let entries = await entryRepository.findByIds([...visitedIds]);
  if (!isInternal) {
    entries = entries.filter((e) => e.visibility === 'public');
    const visibleIds = new Set(entries.map((e) => e.id));
    const visibleRelations = relations.filter(
      (r) => visibleIds.has(r.sourceEntryId) && visibleIds.has(r.targetEntryId),
    );
    res.json(buildFocusedGraphFromRelations(center, entries, visibleRelations, { depth, limit }));
    return;
  }
  res.json(buildFocusedGraphFromRelations(center, entries, relations, { depth, limit }));
});
