import { Router, Request, Response } from 'express';
import { metadataStore } from '../../backend/metadata/store.js';
import { optionalAuth } from '../middleware/auth.js';

export const graphRouter = Router();

/**
 * GET /api/graph/global
 * Build a knowledge graph from entries: each entry is a node,
 * edges are formed by shared tags.
 */
graphRouter.get('/global', optionalAuth, (_req: Request, res: Response) => {
  const isInternal = (_req as any).isInternal === true;
  const entries = metadataStore.getEntries({}, isInternal);

  const nodes = entries.map((e) => ({
    id: `gn-${e.id}`,
    label: e.title,
    type: e.entry_type,
    entryId: String(e.id),
    description: e.summary,
  }));

  // Build edges from shared tags between entries
  const edges: Array<{
    id: string;
    source: string;
    target: string;
    relation: string;
    description: string;
  }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const sharedTags = entries[i].tags.filter((t) => entries[j].tags.includes(t));
      if (sharedTags.length > 0) {
        const key = `${entries[i].id}-${entries[j].id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            id: `ge-${entries[i].id}-${entries[j].id}`,
            source: `gn-${entries[i].id}`,
            target: `gn-${entries[j].id}`,
            relation: 'shared_tags',
            description: `共享标签: ${sharedTags.slice(0, 3).join(', ')}`,
          });
        }
      }
    }
  }

  res.json({ nodes, edges });
});

/**
 * GET /api/graph/focused?entryId=X
 * Returns a 1-hop subgraph centered on the given entry.
 */
graphRouter.get('/focused', optionalAuth, (req: Request, res: Response) => {
  const entryId = parseInt(req.query.entryId as string, 10);
  if (isNaN(entryId)) {
    res.json({ nodes: [], edges: [] });
    return;
  }

  const isInternal = (req as any).isInternal === true;
  const entries = metadataStore.getEntries({}, isInternal);
  const center = entries.find((e) => e.id === entryId);
  if (!center) {
    res.json({ nodes: [], edges: [] });
    return;
  }

  const centerNodeId = `gn-${center.id}`;
  const nodes = [{ id: centerNodeId, label: center.title, type: center.entry_type, entryId: String(center.id), description: center.summary }];
  const edges: Array<{ id: string; source: string; target: string; relation: string; description: string }> = [];

  // Find connected entries via shared tags
  for (const e of entries) {
    if (e.id === center.id) continue;
    const shared = center.tags.filter((t) => e.tags.includes(t));
    if (shared.length > 0) {
      const nodeId = `gn-${e.id}`;
      nodes.push({ id: nodeId, label: e.title, type: e.entry_type, entryId: String(e.id), description: e.summary });
      edges.push({
        id: `ge-${center.id}-${e.id}`,
        source: centerNodeId,
        target: nodeId,
        relation: 'shared_tags',
        description: `共享标签: ${shared.slice(0, 3).join(', ')}`,
      });
    }
  }

  res.json({ nodes, edges });
});
