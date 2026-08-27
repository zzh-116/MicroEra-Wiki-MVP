// Knowledge graph assembly - builds G6-compatible graph data from persisted
// entry_relations rows. No semantic search runs per request anymore.
import type { Entry } from '../types.js';
import type { EntryRelationRow } from '../repositories/relation.repository.js';

export type SeedNodeType = string;

export interface SeedGraphNode {
  id: string;
  label: string;
  type: SeedNodeType;
  metadata: {
    title: string;
    author: string;
    tags: string[];
    summary: string;
    updatedAt: string;
  };
}

export type SeedGraphRelation =
  | 'semantic_related'
  | 'references'
  | 'produces'
  | 'belongs_to'
  | 'derived_from'
  | 'shared_tags';

export interface SeedGraphEdge {
  source: string;
  target: string;
  label: SeedGraphRelation;
  relation: SeedGraphRelation;
  similarity?: number;
  relationSource: 'embedding' | 'tag' | 'manual';
}

export interface SeedGraphData {
  nodes: SeedGraphNode[];
  edges: SeedGraphEdge[];
}

const CHINESE_TYPE_MAP: Record<string, string> = {
  sandbox_project: 'Sandbox项目',
  academic_paper: '学术论文',
  patent: '专利成果',
  tech_doc: '技术文档',
  data_standard: '数据标准',
  data_item: '数据标准',
  template: '模板规范',
  business_material: '商业资料',
  handwritten_note: '手写笔记',
  product: 'Sandbox项目',
  tech: '技术文档',
  asset: '商业资料',
};

export function toChineseType(entryType: string): string {
  return CHINESE_TYPE_MAP[entryType] || entryType;
}

export function resolveLabel(entry: Entry): string {
  const title = (entry.title || '').trim();
  if (title) return title;

  const fileName = (entry.file_name || '').trim();
  if (fileName) {
    const cleaned = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (cleaned) return cleaned;
    return fileName;
  }
  return '未命名文档';
}

function nodeFor(entry: Entry): SeedGraphNode {
  const label = resolveLabel(entry);
  return {
    id: String(entry.id),
    label,
    type: toChineseType(entry.entry_type),
    metadata: {
      title: label,
      author: '',
      tags: entry.tags || [],
      summary: entry.summary,
      updatedAt: entry.updated_at,
    },
  };
}

function edgeFromRelation(rel: EntryRelationRow): SeedGraphEdge {
  const relation = (rel.relationType === 'semantic_related'
    ? 'semantic_related'
    : rel.relationType) as SeedGraphRelation;
  const relationSource = (['embedding', 'tag', 'manual'].includes(rel.relationSource)
    ? rel.relationSource
    : 'embedding') as SeedGraphEdge['relationSource'];
  const edge: SeedGraphEdge = {
    source: String(rel.sourceEntryId),
    target: String(rel.targetEntryId),
    label: relation,
    relation,
    relationSource,
  };
  if (typeof rel.similarity === 'number') edge.similarity = rel.similarity;
  return edge;
}

/** Seed graph: seed entries plus every persisted relation touching a seed. */
export function buildSeedGraphFromRelations(
  ids: number[],
  entries: Entry[],
  relations: EntryRelationRow[],
): SeedGraphData {
  const idSet = new Set(ids);
  const seeds = entries.filter((e) => idSet.has(e.id));
  if (seeds.length === 0) return { nodes: [], edges: [] };

  const related = relations.filter(
    (r) => idSet.has(r.sourceEntryId) || idSet.has(r.targetEntryId),
  );
  const nodeIds = new Set<number>(ids);
  for (const r of related) {
    nodeIds.add(r.sourceEntryId);
    nodeIds.add(r.targetEntryId);
  }

  const nodeMap = new Map<string, SeedGraphNode>();
  for (const entry of entries) {
    if (nodeIds.has(entry.id)) nodeMap.set(String(entry.id), nodeFor(entry));
  }
  const edges = related
    .map(edgeFromRelation)
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target));

  return {
    nodes: [...nodeMap.values()].slice(0, 40),
    edges: edges.slice(0, 120),
  };
}

/** Global graph: every visible entry, edges only between visible entries. */
export function buildGlobalGraphFromRelations(
  entries: Entry[],
  relations: EntryRelationRow[],
): SeedGraphData {
  const entryIds = new Set(entries.map((e) => e.id));
  return {
    nodes: entries.map(nodeFor).slice(0, 1000),
    edges: relations
      .filter((r) => entryIds.has(r.sourceEntryId) && entryIds.has(r.targetEntryId))
      .map(edgeFromRelation)
      .slice(0, 3000),
  };
}

/** Focused graph: BFS from the center over persisted relations only.
 *  depth=1 returns center + first-degree neighbors, depth=2 adds second-degree.
 *  limit caps the total number of returned nodes.
 */
export function buildFocusedGraphFromRelations(
  center: Entry,
  entries: Entry[],
  relations: EntryRelationRow[],
  options: { depth?: number; limit?: number } = {},
): SeedGraphData {
  const depth = Math.min(Math.max(1, Math.floor(options.depth ?? 1)), 4);
  const limit = Math.min(Math.max(1, Math.floor(options.limit ?? 30)), 50);
  const centerId = center.id;

  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const adjacency = new Map<number, Map<number, EntryRelationRow>>();
  for (const rel of relations) {
    if (!adjacency.has(rel.sourceEntryId)) adjacency.set(rel.sourceEntryId, new Map());
    if (!adjacency.has(rel.targetEntryId)) adjacency.set(rel.targetEntryId, new Map());
    adjacency.get(rel.sourceEntryId)!.set(rel.targetEntryId, rel);
    adjacency.get(rel.targetEntryId)!.set(rel.sourceEntryId, rel);
  }

  const visited = new Set<number>([centerId]);
  let frontier = [centerId];

  for (let d = 0; d < depth && frontier.length > 0 && visited.size < limit; d++) {
    const next: number[] = [];
    for (const nodeId of frontier) {
      const neighbors = adjacency.get(nodeId);
      if (!neighbors) continue;
      for (const [neighborId, rel] of neighbors) {
        if (visited.size >= limit) break;
        if (visited.has(neighborId)) continue;
        if (!entryMap.has(neighborId)) continue;
        visited.add(neighborId);
        next.push(neighborId);
      }
    }
    frontier = next;
  }

  // Include every persisted edge whose endpoints are both visited so the
  // local subgraph stays connected and shows cross-links inside the view.
  const edges = relations
    .filter((r) => visited.has(r.sourceEntryId) && visited.has(r.targetEntryId))
    .map(edgeFromRelation)
    .slice(0, Math.max(limit * 4, 200));

  const nodes: SeedGraphNode[] = [];
  for (const id of visited) {
    const entry = entryMap.get(id);
    if (entry) nodes.push(nodeFor(entry));
  }

  return {
    nodes: nodes.slice(0, limit),
    edges,
  };
}
