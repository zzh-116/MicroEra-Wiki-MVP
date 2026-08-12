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

export type SeedGraphRelation = 'semantic_related';

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
    label: 'semantic_related',
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

/** Focused graph: one center entry plus its persisted neighbors. */
export function buildFocusedGraphFromRelations(
  center: Entry,
  entries: Entry[],
  relations: EntryRelationRow[],
): SeedGraphData {
  const centerId = center.id;
  const related = relations.filter(
    (r) => r.sourceEntryId === centerId || r.targetEntryId === centerId,
  );
  const nodeIds = new Set<number>([centerId]);
  for (const r of related) {
    nodeIds.add(r.sourceEntryId);
    nodeIds.add(r.targetEntryId);
  }

  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const nodes: SeedGraphNode[] = [];
  for (const id of nodeIds) {
    const entry = entryMap.get(id);
    if (entry) nodes.push(nodeFor(entry));
  }
  const edges = related
    .map(edgeFromRelation)
    .filter((e) => nodeIds.has(Number(e.source)) && nodeIds.has(Number(e.target)));

  return {
    nodes: nodes.slice(0, 60),
    edges: edges.slice(0, 200),
  };
}
