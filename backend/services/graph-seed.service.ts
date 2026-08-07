// Seed knowledge graph — G6-compatible graph data built from a few core
// documents plus their pgvector-similar neighbors.
import { entryRepository } from '../repositories/entry.repository.js';
import { searchService } from './search.service.js';
import type { Entry } from '../types.js';

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

export interface SeedGraphEdge {
  source: string;
  target: string;
  label: 'references' | 'produces' | 'belongs_to' | 'derived_from';
  similarity?: number;
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

function relationFor(targetType: string): SeedGraphEdge['label'] {
  switch (targetType) {
    case '学术论文':
    case '专利成果':
      return 'references';
    case '数据标准':
      return 'belongs_to';
    case '商业资料':
      return 'derived_from';
    default: return 'produces';
  }
}

export async function buildSeedGraph(ids: number[], isInternal: boolean): Promise<SeedGraphData> {
  const all = await entryRepository.findAllDistinctByTitle({ isInternal });
  const seeds = all.filter((e) => ids.includes(e.id));
  if (seeds.length === 0) return { nodes: [], edges: [] };

  const nodeMap = new Map<string, SeedGraphNode>();
  const edgeMap = new Map<string, SeedGraphEdge>();
  const seenTitles = new Set<string>();
  const addNode = (entry: Entry) => {
    const node = nodeFor(entry);
    // Dedupe by raw title: keep only the first (highest-similarity) record per title.
    const key = (entry.title || '').trim().toLowerCase() || node.label.toLowerCase();
    if (seenTitles.has(key)) return;
    seenTitles.add(key);
    nodeMap.set(String(entry.id), node);
  };
  const addEdge = (sourceId: number, targetId: number, label: SeedGraphEdge['label'], similarity?: number) => {
    const key = `${sourceId}->${targetId}`;
    if (!edgeMap.has(key)) {
      const edge: SeedGraphEdge = { source: String(sourceId), target: String(targetId), label };
      if (similarity !== undefined) edge.similarity = similarity;
      edgeMap.set(key, edge);
    }
  };

  for (const seed of seeds) addNode(seed);

  await Promise.all(seeds.map(async (seed) => {
    let relatedResults: Array<{ entry: Entry; score?: number }> = [];
    try {
      const results = await searchService.semanticSearch(seed.title, isInternal, 3);
      relatedResults = results
        .filter((r) => r.entry && r.entry.id !== seed.id)
        .slice(0, 3)
        .map((r) => ({ entry: r.entry as Entry, score: r.score }));
    } catch {
      relatedResults = [];
    }
    if (relatedResults.length === 0) {
      relatedResults = all
        .filter((e) => e.id !== seed.id && e.tags.some((t) => seed.tags.includes(t)))
        .slice(0, 3)
        .map((e) => ({ entry: e }));
    }
    for (const { entry, score } of relatedResults) {
      addNode(entry);
      addEdge(seed.id, entry.id, relationFor(toChineseType(entry.entry_type)), score);
    }
  }));

  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      if (seeds[i].tags.some((t) => seeds[j].tags.includes(t))) {
        addEdge(seeds[i].id, seeds[j].id, 'references');
      }
    }
  }

  return {
    nodes: [...nodeMap.values()].slice(0, 40),
    edges: [...edgeMap.values()].slice(0, 120),
  };
}

/** Build a full graph from every entry, deduped by title and linked by shared tags. */
export function buildGlobalGraph(entries: Entry[]): SeedGraphData {
  const byTitle = new Map<string, Entry>();
  for (const entry of entries) {
    const key = (entry.title || '').trim().toLowerCase() || String(entry.id);
    const existing = byTitle.get(key);
    if (!existing || (entry.updated_at || '') > (existing.updated_at || '')) {
      byTitle.set(key, entry);
    }
  }

  const unique = [...byTitle.values()];
  const nodeMap = new Map<string, SeedGraphNode>();
  for (const entry of unique) {
    nodeMap.set(String(entry.id), nodeFor(entry));
  }

  const edgeMap = new Map<string, SeedGraphEdge>();
  const addEdge = (sourceId: number, targetId: number, label: SeedGraphEdge['label']) => {
    const key = `${sourceId}->${targetId}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { source: String(sourceId), target: String(targetId), label });
    }
  };

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];
      if (a.tags.some((t) => b.tags.includes(t))) {
        addEdge(a.id, b.id, relationFor(toChineseType(b.entry_type)));
      }
    }
  }

  return {
    nodes: [...nodeMap.values()].slice(0, 1000),
    edges: [...edgeMap.values()].slice(0, 3000),
  };
}
