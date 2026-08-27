import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import G6 from '@antv/g6';
import {
  Boxes,
  CircleDot,
  Database,
  ExternalLink,
  GitBranch,
  Layers,
  Maximize2,
  Network,
  Radar,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getAuthHeaders } from '../../api/client';

interface SeedGraphMetadata {
  title: string;
  author: string;
  tags: string[];
  summary: string;
  updatedAt: string;
}

interface SeedGraphNode {
  id: string;
  label: string;
  type: string;
  metadata: SeedGraphMetadata;
}

type SeedGraphRelation =
  | 'semantic_related'
  | 'references'
  | 'produces'
  | 'belongs_to'
  | 'derived_from'
  | 'shared_tags';

interface SeedGraphEdge {
  source: string;
  target: string;
  label: SeedGraphRelation;
  relation: SeedGraphRelation;
  similarity?: number;
  relationSource: 'embedding' | 'tag' | 'manual';
}

interface SeedGraphData {
  nodes: SeedGraphNode[];
  edges: SeedGraphEdge[];
}

const MAX_GRAPH_NODES = 50;
const DEFAULT_FOCUS_LIMIT = 30;
const GLOBAL_DISPLAY_CAP = 150;
const MIN_NODE_SIZE = 10;
const MAX_NODE_SIZE = 22;
const FIXED_NODE_SIZE = 15;

const FORCE_LAYOUT: Record<string, any> = {
  type: 'force',
  preventOverlap: true,
  nodeSpacing: 60,
  linkDistance: 180,
  nodeStrength: -80,
  edgeStrength: 0.2,
  gravity: 0.03,
  collideStrength: 1,
  alpha: 0.6,
  alphaDecay: 0.03,
  alphaMin: 0.005,
};

const CIRCULAR_LAYOUT: Record<string, any> = {
  type: 'circular',
  ordering: 'degree',
  angleRatio: 1,
};

const DAGRE_LAYOUT: Record<string, any> = {
  type: 'dagre',
  rankdir: 'LR',
  align: 'UL',
  nodesep: 80,
  ranksep: 120,
  controlPoints: true,
};

function normalizeGraph(data: any): SeedGraphData {
  const rawNodes: any[] = data?.nodes || [];
  const rawEdges: any[] = data?.edges || [];
  const cleanId = (v: any) => String(v ?? '').replace(/^gn-/, '');
  const nodes: SeedGraphNode[] = [];
  for (const n of rawNodes) {
    const id = cleanId(n.id ?? n.entryId ?? n.entry_id);
    if (!id) continue;
    const label = (n.label || n.title || n.file_name || '未命名文档').trim();
    const baseMeta = n.metadata || {
      title: n.title || n.label || n.file_name || '未命名文档',
      author: n.author || '',
      tags: cleanTags(n.tags),
      summary: n.summary || n.description || '',
      updatedAt: n.updatedAt || n.updated_at || '',
    };
    nodes.push({
      id,
      label,
      type: n.type || '未分类',
      metadata: { ...baseMeta, tags: cleanTags(baseMeta.tags) },
    });
  }
  const edges: SeedGraphEdge[] = rawEdges
    .map((e): SeedGraphEdge => {
      const rawRelation = String(e.relation || e.label || 'semantic_related');
      // Keep real relation types (references / produces / …) instead of
      // flattening everything to semantic_related.
      const relation: SeedGraphRelation = RELATION_META[rawRelation]
        ? (rawRelation as SeedGraphRelation)
        : 'semantic_related';
      return {
        source: cleanId(e.source ?? e.from),
        target: cleanId(e.target ?? e.to),
        label: relation,
        relation,
        similarity: e.similarity,
        relationSource: (e.relation_source || e.relationSource || 'embedding') as SeedGraphEdge['relationSource'],
      };
    })
    .filter((e) => e.source && e.target);
  return { nodes, edges };
}

const TYPE_COLOR_MAP: Record<string, string> = {
  'Sandbox项目': '#5B8FF9',
  '学术论文': '#9270CA',
  '专利成果': '#F6BD16',
  '技术文档': '#6DC8EC',
  '数据标准': '#51A8A8',
  '模板规范': '#F6903D',
  '商业资料': '#F4664A',
  '手写笔记': '#B37BEB',
};

function shadeHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.round((num & 255) * (1 - amount))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function nodeStyleForType(type: string): Record<string, unknown> {
  const base = TYPE_COLOR_MAP[type] || '#999999';
  const dark = shadeHex(base, 0.35);
  return {
    fill: `l(90) 0:${base} 1:${dark}`,
    stroke: '#FFFFFF',
    lineWidth: 1,
    cursor: 'pointer',
    shadowColor: `${base}40`,
    shadowBlur: 4,
  };
}

function cleanTags(tags: unknown): string[] {
  return (Array.isArray(tags) ? tags : [])
    .map((t) => String(t ?? '').trim())
    .filter((t) => t && !/[?\uFFFD]/.test(t));
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Short two-line label. The full title is available in the hover tooltip. */
function formatNodeLabel(label: string, _selected: boolean): string {
  const text = (label || '').trim();
  if (!text) return '';
  const chars = Array.from(text);
  if (chars.length <= 10) return text;
  const first = chars.slice(0, 10).join('') + '...';
  const rest = chars.slice(10);
  const second = rest.length > 10 ? rest.slice(0, 10).join('') + '…' : rest.join('');
  return `${first}\n${second}`;
}

function nodeSizeForDegree(degree: number, maxDegree: number, mode: 'degree' | 'fixed'): number {
  if (mode === 'fixed') return FIXED_NODE_SIZE;
  const ratio = maxDegree > 0 ? degree / maxDegree : 0;
  return Math.min(MAX_NODE_SIZE, Math.max(MIN_NODE_SIZE, 10 + Math.min(ratio * 12, 12)));
}

function edgeWidthForScore(score?: number): number {
  const s = typeof score === 'number' ? score : 0.5;
  return Math.min(1.2, Math.max(0.8, 0.8 + s * 0.4));
}

function edgeOpacityForScore(score?: number): number {
  const s = typeof score === 'number' ? score : 0.5;
  return Math.min(0.3, Math.max(0.15, 0.15 + s * 0.15));
}

interface KeywordFilterItem {
  keyword: string;
  count: number;
}

const MOCK_GRAPH: SeedGraphData = {
  nodes: [
    { id: '1', label: '量子计算材料设计平台', type: 'Sandbox项目', metadata: { title: '量子计算材料设计平台', author: '研发中心', tags: ['材料计算', '量子'], summary: '面向客户展示公司核心材料计算 SaaS 平台的高层级分析流程和客户案例。', updatedAt: '2026-06-22' } },
    { id: '2', label: '稳定子算法纠错论文', type: '学术论文', metadata: { title: '稳定子算法纠错论文', author: 'Research Team', tags: ['量子纠错', '稳定子'], summary: 'Gottesman 1997 纠错码群论开山论文，覆盖稳定子算法的理论框架。', updatedAt: '2026-06-10' } },
    { id: '3', label: 'DeepSeekMath 论文', type: '学术论文', metadata: { title: 'DeepSeekMath', author: 'DeepSeek', tags: ['LLM', '数学推理'], summary: '面向数学推理的大模型训练方法研究。', updatedAt: '2026-06-05' } },
    { id: '4', label: '材料结构 Schema', type: '数据标准', metadata: { title: '材料结构数据条目', author: '数据组', tags: ['数据格式', '数据库架构'], summary: '晶体结构与分子材料核心研发数据字段对齐元数据。', updatedAt: '2026-06-16' } },
    { id: '5', label: '实验数据存储结构', type: '数据标准', metadata: { title: '实验数据存储结构说明', author: '数据组', tags: ['实验数据', 'SQL'], summary: '实验室表征数据 SQL 存储 schema 与维护人信息。', updatedAt: '2026-06-15' } },
    { id: '6', label: 'RAG 服务接口', type: '技术文档', metadata: { title: 'RAG 服务接口', author: '平台组', tags: ['RAG', 'LLM'], summary: '多轮 RAG 对话与流式输出服务接口。', updatedAt: '2026-06-20' } },
    { id: '7', label: 'MCP 知识插件', type: '技术文档', metadata: { title: 'MCP 知识插件', author: '平台组', tags: ['MCP', '插件'], summary: '可被 Agent 调用的知识检索与工具服务。', updatedAt: '2026-06-19' } },
    { id: '8', label: '量子计算商业价值', type: '商业资料', metadata: { title: '量子计算商业价值摘要', author: '战略部', tags: ['ROI', '量子计算'], summary: 'ROI 320%、节约 45.2 万算力、衍生专利看板。', updatedAt: '2026-06-18' } },
    { id: '9', label: 'ROI 商业看板', type: '商业资料', metadata: { title: 'ROI 商业看板', author: '战略部', tags: ['ROI', '看板'], summary: '量化项目投入产出与商业回报。', updatedAt: '2026-06-17' } },
    { id: '10', label: 'MOF 材料计算论文', type: '学术论文', metadata: { title: 'MOF 材料计算论文', author: '材料组', tags: ['MOF', 'DFT'], summary: '金属有机框架材料的高通量计算与筛选研究。', updatedAt: '2026-06-12' } },
    { id: '11', label: 'Sandbox 155 项目', type: 'Sandbox项目', metadata: { title: 'Sandbox 155 项目', author: '仿真组', tags: ['Sandbox', '仿真'], summary: '多项式仿真过程与实验结果记录。', updatedAt: '2026-06-11' } },
    { id: '12', label: '传感器数据标准', type: '数据标准', metadata: { title: '传感器数据标准', author: '数据组', tags: ['传感器', '数据'], summary: '气体传感器响应数据的标准化字段定义。', updatedAt: '2026-06-14' } },
    { id: '13', label: 'MiQi 问答服务', type: '技术文档', metadata: { title: 'MiQi 问答服务', author: '平台组', tags: ['MiQi', '问答'], summary: '企业知识问答与 Agent 工具调用服务。', updatedAt: '2026-06-13' } },
    { id: '14', label: '生物材料 ROI', type: '商业资料', metadata: { title: '生物材料 ROI', author: '战略部', tags: ['ROI', '生物'], summary: '生物质材料方向的商业回报评估。', updatedAt: '2026-06-09' } },
    { id: '15', label: '生物智能体路线', type: 'Sandbox项目', metadata: { title: '生物智能体完整路线', author: '生物组', tags: ['生物智能体', '路线'], summary: '从数据到智能体的生物制造技术路线图。', updatedAt: '2026-06-08' } },
    { id: '16', label: '木质素高值化论文', type: '学术论文', metadata: { title: '木质素高值化论文', author: '生物组', tags: ['木质素', '高值化'], summary: '木质素基材料的高值化利用研究。', updatedAt: '2026-06-07' } },
  ],
  edges: [
    { source: '1', target: '2', label: 'semantic_related', relation: 'semantic_related', similarity: 0.72, relationSource: 'embedding' },
    { source: '1', target: '10', label: 'semantic_related', relation: 'semantic_related', similarity: 0.68, relationSource: 'embedding' },
    { source: '1', target: '4', label: 'semantic_related', relation: 'semantic_related', similarity: 0.61, relationSource: 'embedding' },
    { source: '2', target: '4', label: 'semantic_related', relation: 'semantic_related', similarity: 0.55, relationSource: 'embedding' },
    { source: '2', target: '6', label: 'semantic_related', relation: 'semantic_related', similarity: 0.59, relationSource: 'embedding' },
    { source: '3', target: '6', label: 'semantic_related', relation: 'semantic_related', similarity: 0.64, relationSource: 'embedding' },
    { source: '4', target: '5', label: 'semantic_related', relation: 'semantic_related', similarity: 0.52, relationSource: 'embedding' },
    { source: '6', target: '13', label: 'semantic_related', relation: 'semantic_related', similarity: 0.57, relationSource: 'embedding' },
    { source: '7', target: '13', label: 'semantic_related', relation: 'semantic_related', similarity: 0.63, relationSource: 'embedding' },
    { source: '1', target: '8', label: 'semantic_related', relation: 'semantic_related', similarity: 0.66, relationSource: 'embedding' },
    { source: '8', target: '9', label: 'semantic_related', relation: 'semantic_related', similarity: 0.71, relationSource: 'embedding' },
    { source: '10', target: '12', label: 'semantic_related', relation: 'semantic_related', similarity: 0.49, relationSource: 'embedding' },
    { source: '10', target: '11', label: 'semantic_related', relation: 'semantic_related', similarity: 0.58, relationSource: 'embedding' },
    { source: '11', target: '4', label: 'semantic_related', relation: 'semantic_related', similarity: 0.47, relationSource: 'embedding' },
    { source: '13', target: '7', label: 'semantic_related', relation: 'semantic_related', similarity: 0.62, relationSource: 'embedding' },
    { source: '15', target: '14', label: 'semantic_related', relation: 'semantic_related', similarity: 0.54, relationSource: 'embedding' },
    { source: '15', target: '16', label: 'semantic_related', relation: 'semantic_related', similarity: 0.67, relationSource: 'embedding' },
    { source: '16', target: '14', label: 'semantic_related', relation: 'semantic_related', similarity: 0.56, relationSource: 'embedding' },
    { source: '10', target: '16', label: 'semantic_related', relation: 'semantic_related', similarity: 0.6, relationSource: 'embedding' },
  ],
};

interface LegendTypeItem {
  type: string;
  color: string;
  count: number;
}

const RELATION_META: Record<string, { text: string; color: string }> = {
  semantic_related: { text: '语义关联', color: '#1D70B8' },
  references: { text: '引用文献', color: '#DB5F5B' },
  produces: { text: '产出标准', color: '#3F7E5F' },
  belongs_to: { text: '归档模板', color: '#8B5CF6' },
  derived_from: { text: '衍生价值', color: '#C9971F' },
  shared_tags: { text: '共享标签', color: '#14B8A6' },
};

/** Edge line style encodes the relation source: solid = embedding, dashed = tag, dotted = manual. */
const LINE_DASH_BY_SOURCE: Record<string, number[]> = {
  embedding: [],
  tag: [5, 4],
  manual: [1, 3],
};

const SOURCE_META: Record<string, { text: string; color: string }> = {
  embedding: { text: '语义向量', color: '#1D70B8' },
  tag: { text: '共享标签', color: '#DB5F5B' },
  manual: { text: '人工标注', color: '#C9971F' },
};

interface RelationStat {
  label: string;
  text: string;
  color: string;
  count: number;
  percent: number;
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  typeCount: number;
  avgDegree: number;
  density: number;
  hubLabel: string;
  hubDegree: number;
  relations: RelationStat[];
  relationSources: RelationStat[];
}

const EMPTY_STATS: GraphStats = {
  nodeCount: 0,
  edgeCount: 0,
  typeCount: 0,
  avgDegree: 0,
  density: 0,
  hubLabel: '—',
  hubDegree: 0,
  relations: [],
  relationSources: [],
};

function buildLegendTypes(nodes: any[]): LegendTypeItem[] {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const type = n.type || '未分类';
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  const merged = new Map<string, LegendTypeItem>();
  for (const [type, color] of Object.entries(TYPE_COLOR_MAP)) {
    merged.set(type, { type, color, count: counts.get(type) || 0 });
  }
  for (const [type, count] of counts) {
    if (!merged.has(type)) {
      merged.set(type, { type, color: '#999999', count });
    }
  }
  return [...merged.values()];
}

function buildKeywordFilters(nodes: any[]): KeywordFilterItem[] {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    for (const keyword of cleanTags(n?.metadata?.tags)) {
      counts.set(keyword, (counts.get(keyword) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function computeStats(nodes: any[], edges: any[]): GraphStats {
  const degreeMap = new Map<string, number>();
  const relationCounts = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
    const label = (e.relation || e.label || 'semantic_related') as SeedGraphRelation;
    relationCounts.set(label, (relationCounts.get(label) || 0) + 1);
  }
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const avgDegree = nodeCount ? Number(((edgeCount * 2) / nodeCount).toFixed(1)) : 0;
  const maxPairs = (nodeCount * Math.max(0, nodeCount - 1)) / 2;
  const density = maxPairs ? Number((edgeCount / maxPairs).toFixed(3)) : 0;
  const hub = [...degreeMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const hubNode = hub ? nodes.find((n: any) => n.id === hub[0]) : null;
  const typeSet = new Set(nodes.map((n: any) => n.type || '未分类'));
  const relationLabels = [...new Set([...Object.keys(RELATION_META), ...relationCounts.keys()])];
  const relations: RelationStat[] = relationLabels.map((label) => {
    const meta = RELATION_META[label] || { text: label, color: '#64748B' };
    return {
      label,
      ...meta,
      count: relationCounts.get(label) || 0,
      percent: edgeCount ? Math.round(((relationCounts.get(label) || 0) / edgeCount) * 100) : 0,
    };
  });
  const sourceCounts = new Map<string, number>();
  for (const e of edges) {
    const src = e.relationSource || 'embedding';
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
  }
  const relationSources: RelationStat[] = [...sourceCounts.keys()].map((label) => {
    const meta = SOURCE_META[label] || { text: label, color: '#64748B' };
    return {
      label,
      ...meta,
      count: sourceCounts.get(label) || 0,
      percent: edgeCount ? Math.round(((sourceCounts.get(label) || 0) / edgeCount) * 100) : 0,
    };
  });
  return {
    nodeCount,
    edgeCount,
    typeCount: typeSet.size,
    avgDegree,
    density,
    hubLabel: hubNode?.label || '—',
    hubDegree: hub?.[1] || 0,
    relations,
    relationSources,
  };
}

function buildTooltipHtml(node: SeedGraphNode): string {
  const meta = node.metadata || { title: node.label, author: '', tags: [], summary: '', updatedAt: '' };
  const color = TYPE_COLOR_MAP[node.type] || '#999999';
  const tags = cleanTags(meta.tags).map((t) => `<span class="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 mr-1">${escapeHtml(t)}</span>`).join('');
  return `
    <div class="min-w-[180px] text-left">
      <div class="mb-1.5 flex items-center gap-1.5">
        <span class="inline-block h-2 w-2 rounded-full" style="background:${color};box-shadow:0 0 0 3px ${color}40"></span>
        <span class="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#DB5F5B]">${escapeHtml(node.type)}</span>
      </div>
      <div class="mb-1 text-[12px] font-bold leading-snug text-slate-900">${escapeHtml(meta.title || node.label)}</div>
      ${meta.author ? `<div class="mb-1 text-[10px] text-slate-500">作者：${escapeHtml(meta.author)}</div>` : ''}
      <div class="mb-1">${tags}</div>
      <div class="max-w-[220px] text-[10px] leading-snug text-slate-500">${escapeHtml(meta.summary || '')}</div>
      ${meta.updatedAt ? `<div class="mt-1.5 text-[9px] text-slate-400">更新：${escapeHtml(meta.updatedAt)}</div>` : ''}
    </div>
  `;
}

function buildEdgeTooltipHtml(model: SeedGraphEdge): string {
  const score = typeof model.similarity === 'number' ? model.similarity.toFixed(2) : '—';
  const source = model.relationSource === 'embedding' ? 'embedding' : (model.relationSource || 'embedding');
  const relMeta = RELATION_META[model.relation] || { text: String(model.relation), color: '#64748B' };
  return `
    <div class="min-w-[170px] text-left">
      <div class="mb-1.5 flex items-center gap-1.5">
        <span class="inline-block h-2 w-2 rounded-full" style="background:${relMeta.color}"></span>
        <span class="text-[12px] font-bold leading-snug text-slate-900">${escapeHtml(relMeta.text)}</span>
        <span class="font-mono text-[8px] uppercase tracking-wider text-slate-400">${escapeHtml(String(model.relation))}</span>
      </div>
      <div class="space-y-0.5 text-[10px] leading-relaxed">
        <div class="text-slate-500">相似度：<span class="font-mono font-semibold text-[#2B3150]">${escapeHtml(score)}</span></div>
        <div class="text-slate-400">来源：${escapeHtml(source)}</div>
      </div>
    </div>
  `;
}

export default function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const dataRef = useRef<SeedGraphData>(MOCK_GRAPH);
  const fullGraphDataRef = useRef<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const selectedNodeIdRef = useRef<string | null>(null);
  const pendingFitRef = useRef(false);
  const hasFittedRef = useRef(false);
  const graphSizeRef = useRef({ width: 800, height: 600 });
  const showLabelsRef = useRef(true);
  const sizeModeRef = useRef<'degree' | 'fixed'>('degree');
  const minSimilarityRef = useRef(0.5);
  const layoutModeRef = useRef<'force' | 'circular' | 'dagre'>('force');

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GraphStats>(EMPTY_STATS);
  const [selectedNode, setSelectedNode] = useState<SeedGraphNode | null>(null);
  const [selectedDegree, setSelectedDegree] = useState(0);
  const [search, setSearch] = useState('');
  const [legendTypes, setLegendTypes] = useState<LegendTypeItem[]>([]);
  const [activeType, setActiveType] = useState('');
  const [keywordFilters, setKeywordFilters] = useState<KeywordFilterItem[]>([]);
  const [activeKeyword, setActiveKeyword] = useState('');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [expanding, setExpanding] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'force' | 'circular' | 'dagre'>('force');
  const [sizeMode, setSizeMode] = useState<'degree' | 'fixed'>('degree');
  const [showLabels, setShowLabels] = useState(true);
  const [showEdgeWeight, setShowEdgeWeight] = useState(false);
  const [minSimilarity, setMinSimilarity] = useState(0.5);
  /** 'live' = data from the backend, 'mock' = bundled demo fallback. */
  const [dataSource, setDataSource] = useState<'live' | 'mock'>('live');
  /** 'focused' = local neighbourhood of a seed entry, 'global' = full topology. */
  const [viewMode, setViewMode] = useState<'focused' | 'global'>('focused');

  const setSelection = (item: any, model: SeedGraphNode | null) => {
    const graph = graphRef.current;
    if (!graph) return;
    const items = graph.getNodes();
    for (const it of items) {
      const m = it.getModel() as SeedGraphNode;
      const selected = !!model && it === item;
      graph.setItemState(it, 'selected', selected);
      if (showLabelsRef.current) {
        graph.updateItem(it, { label: formatNodeLabel(m.label, selected) });
      }
    }
    selectedNodeIdRef.current = model?.id || null;
  };

  const applyNeighborHighlight = (item: any, model: SeedGraphNode) => {
    const graph = graphRef.current;
    if (!graph) return;
    const edges = fullGraphDataRef.current.edges;
    const connected = new Set<string>([model.id]);
    for (const e of edges) {
      if (e.source === model.id) connected.add(e.target);
      if (e.target === model.id) connected.add(e.source);
    }
    for (const it of graph.getNodes()) {
      const m = it.getModel() as SeedGraphNode & { baseSize?: number };
      const isTarget = m.id === model.id;
      const isNeighbor = connected.has(m.id);
      graph.setItemState(it, 'dim', !isTarget && !isNeighbor);
      graph.setItemState(it, 'highlight', isNeighbor && !isTarget);
      const base = m.baseSize || FIXED_NODE_SIZE;
      const next = Math.round(base * (isTarget ? 1.1 : isNeighbor ? 1.05 : 1));
      graph.updateItem(it, { size: Math.min(MAX_NODE_SIZE + 4, next) });
    }
    for (const it of graph.getEdges()) {
      const e = it.getModel() as SeedGraphEdge;
      const related = connected.has(e.source) && connected.has(e.target);
      graph.setItemState(it, 'dim', !related);
    }
  };

  const resetNeighborHighlight = () => {
    const graph = graphRef.current;
    if (!graph) return;
    for (const it of graph.getNodes()) {
      const m = it.getModel() as SeedGraphNode & { baseSize?: number };
      graph.setItemState(it, 'dim', false);
      graph.setItemState(it, 'highlight', false);
      if (m.baseSize) graph.updateItem(it, { size: m.baseSize });
    }
    for (const it of graph.getEdges()) {
      graph.setItemState(it, 'dim', false);
    }
  };

  const fitGraphToView = () => {
    const graph = graphRef.current;
    if (!graph) return;
    if (hasFittedRef.current) {
      pendingFitRef.current = false;
      return;
    }
    if (graph.getNodes().length === 0) {
      pendingFitRef.current = false;
      return;
    }
    try {
      graph.fitView(60);
      const id = selectedNodeIdRef.current;
      const center = id ? graph.findById?.(id) : graph.getNodes()[0];
      if (center) graph.focusItem(center, false);
    } catch {
      // ignore fit failures on tiny or empty graphs
    }
    hasFittedRef.current = true;
    pendingFitRef.current = false;
  };

  /** Arm auto-fit for the next layout completion (data reload only). */
  const scheduleFit = () => {
    pendingFitRef.current = true;
    hasFittedRef.current = false;
  };

  const applySearch = (query: string) => {
    const graph = graphRef.current;
    if (!graph) return;
    const keyword = query.trim().toLowerCase();
    let firstMatch: any = null;
    const items = graph.getNodes();
    for (const item of items) {
      const model = item.getModel() as SeedGraphNode;
      const meta = model.metadata;
      const haystack = [
        model.label || '',
        model.type || '',
        meta.title || '',
        (meta.tags || []).join(' '),
      ].join(' ').toLowerCase();
      const matched = !keyword || haystack.includes(keyword);
      graph.setItemState(item, 'highlight', matched);
      graph.setItemState(item, 'dim', !matched);
      if (matched && !firstMatch) firstMatch = item;
    }
    if (firstMatch) {
      graph.focusItem(firstMatch, true, { duration: 600 });
    }
  };

  const clearSearch = () => {
    setSearch('');
    applySearch('');
  };

  const applyKeywordFilter = (keyword: string) => {
    setActiveKeyword(keyword);
    setSearch(keyword);
    applySearch(keyword);
  };

  const clearKeywordFilter = () => {
    setActiveKeyword('');
    setSearch('');
    applySearch('');
  };

  const handleViewEntry = () => {
    if (selectedNode) navigate(`/entry/${selectedNode.id}`);
  };

  const applyTypeFilter = (type: string) => {
    const graph = graphRef.current;
    if (!graph) return;
    const full = fullGraphDataRef.current;
    const nodes = type ? full.nodes.filter((n) => n.type === type) : full.nodes;
    const nodeIds = new Set(nodes.map((n) => n.id));
    const threshold = minSimilarityRef.current;
    const edges = full.edges.filter((e) =>
      nodeIds.has(e.source)
      && nodeIds.has(e.target)
      && (typeof e.similarity !== 'number' || e.similarity >= threshold),
    );
    graph.changeData({ nodes, edges } as any);
    graph.render();
    setStats(computeStats(nodes, edges));
    setLegendTypes(buildLegendTypes(nodes));
    setKeywordFilters(buildKeywordFilters(nodes));
    setActiveType(type);
    if (selectedNode && !nodeIds.has(selectedNode.id)) {
      setSelectedNode(null);
      setSelectedDegree(0);
      setSelection(null, null);
    }
  };

  const highlightSelected = () => {
    const graph = graphRef.current;
    const id = selectedNodeIdRef.current;
    if (!graph || !id) return;
    try {
      const item = graph.findById?.(id);
      if (item) {
        graph.setItemState(item, 'selected', true);
        const model = item.getModel() as SeedGraphNode;
        if (showLabelsRef.current) {
          graph.updateItem(item, { label: formatNodeLabel(model.label, true) });
        }
      }
    } catch {
      // ignore missing items after data replacement
    }
  };

  const renderData = () => {
    const graph = graphRef.current;
    if (!graph) return;
    const data = dataRef.current;
    const degreeMap = new Map<string, number>();
    for (const e of data.edges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
    }
    const maxDegree = Math.max(1, ...[...degreeMap.values()]);
    const nodes = data.nodes.map((n) => {
      const degree = degreeMap.get(n.id) || 0;
      const size = nodeSizeForDegree(degree, maxDegree, sizeModeRef.current);
      return {
        ...n,
        degree,
        size,
        baseSize: size,
        style: nodeStyleForType(n.type),
        label: showLabelsRef.current ? formatNodeLabel(n.label, selectedNodeIdRef.current === n.id) : '',
      };
    });
    const edges = data.edges.map((e) => ({
      ...e,
      label: '',
      relation: e.relation,
      similarity: e.similarity,
      relationSource: e.relationSource,
      style: {
        opacity: edgeOpacityForScore(e.similarity),
        lineWidth: edgeWidthForScore(e.similarity),
        stroke: RELATION_META[e.relation]?.color || '#94A3B8',
        lineDash: LINE_DASH_BY_SOURCE[e.relationSource] || [],
      },
    }));
    fullGraphDataRef.current = { nodes, edges };
    applyTypeFilter('');
    highlightSelected();
  };

  const fetchFocusedGraph = async (entryId: string, options: { depth?: number; limit?: number } = {}) => {
    const params = new URLSearchParams({ entryId });
    if (options.depth !== undefined) params.set('depth', String(options.depth));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    const res = await fetch(`/api/graph/focused?${params.toString()}`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error('FOCUSED_GRAPH_FAILED');
    return normalizeGraph(await res.json());
  };

  const applyFocusedGraph = async (entryId: string, options: { depth?: number; limit?: number }) => {
    const normalized = await fetchFocusedGraph(entryId, options);
    if (normalized.nodes.length === 0) return false;
    selectedNodeIdRef.current = null;
    dataRef.current = normalized;
    scheduleFit();
    renderData();
    const center = normalized.nodes.find((n) => n.id === String(entryId)) || normalized.nodes[0];
    if (center) {
      setSelectedNode(center);
      setSelectedDegree(
        fullGraphDataRef.current.edges.filter((e) => e.source === center.id || e.target === center.id).length,
      );
      selectedNodeIdRef.current = center.id;
      const graph = graphRef.current;
      try {
        const item = graph?.findById?.(center.id);
        if (item) {
          graph.setItemState(item, 'selected', true);
          if (showLabelsRef.current) {
            graph.updateItem(item, { label: formatNodeLabel(center.label, true) });
          }
        }
      } catch {
        // ignore selection errors on tiny graphs
      }
    }
    return true;
  };

  const expandNode = async (nodeId: string) => {
    if (expanding) return;
    setExpanding(true);
    setSearchMessage('');
    try {
      const incoming = await fetchFocusedGraph(nodeId, { depth: 1, limit: DEFAULT_FOCUS_LIMIT });
      const existing = dataRef.current;
      const nodeMap = new Map<string, SeedGraphNode>(existing.nodes.map((n) => [n.id, n]));
      for (const n of incoming.nodes) {
        if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
      }
      const nodes = [...nodeMap.values()];
      if (nodes.length > MAX_GRAPH_NODES) nodes.length = MAX_GRAPH_NODES;
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edgeMap = new Map<string, SeedGraphEdge>();
      for (const e of [...existing.edges, ...incoming.edges]) {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
          edgeMap.set(`${e.source}->${e.target}`, e);
        }
      }
      dataRef.current = { nodes, edges: [...edgeMap.values()] };
      setViewMode('focused');
      scheduleFit();
      renderData();
      setSelectedDegree(
        fullGraphDataRef.current.edges.filter((e) => e.source === nodeId || e.target === nodeId).length,
      );
      setSearchMessage(
        nodes.length >= MAX_GRAPH_NODES
          ? `已达 ${MAX_GRAPH_NODES} 节点上限，继续展开查看更多关联知识`
          : `已展开节点 #${nodeId} 的关联知识`,
      );
    } catch {
      setSearchMessage('展开关联失败，请稍后重试');
    } finally {
      setExpanding(false);
    }
  };

  const handleKnowledgeSearch = async () => {
    const q = knowledgeQuery.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchMessage('');
    try {
      const res = await fetch(`/api/graph/search?q=${encodeURIComponent(q)}`, {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error('SEARCH_FAILED');
      const hit = await res.json();
      if (!hit?.entryId) {
        setSearchMessage(`未找到与「${q}」匹配的知识条目`);
        return;
      }
      setSelectedNode(null);
      applySearch('');
      const ok = await applyFocusedGraph(String(hit.entryId), { depth: 1, limit: DEFAULT_FOCUS_LIMIT });
      setViewMode('focused');
      setSearchMessage(ok ? `已定位：${hit.title}` : `「${hit.title}」暂无关联数据`);
    } catch {
      setSearchMessage('知识搜索失败，请稍后重试');
    } finally {
      setSearching(false);
    }
  };

  /** Load the default focused neighbourhood of the seed entry. */
  const loadFocusedSeed = async () => {
    try {
      const ok = await applyFocusedGraph('1', { depth: 1, limit: DEFAULT_FOCUS_LIMIT });
      setDataSource('live');
      if (!ok) {
        // Backend reachable but no graph for the seed entry — show a real
        // empty state instead of silently keeping the demo mock.
        dataRef.current = { nodes: [], edges: [] };
        renderData();
      }
    } catch {
      // Backend unavailable: fall back to bundled demo data, clearly flagged.
      setDataSource('mock');
    }
  };

  /** Load the whole knowledge topology from /api/graph/global. */
  const loadGlobal = async () => {
    try {
      const res = await fetch('/api/graph/global', {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error('GLOBAL_FAILED');
      const data = normalizeGraph(await res.json());
      // Defensive cap: keep the highest-degree nodes so the global view stays usable.
      let { nodes, edges } = data;
      if (nodes.length > GLOBAL_DISPLAY_CAP) {
        const degree = new Map<string, number>();
        for (const e of edges) {
          degree.set(e.source, (degree.get(e.source) || 0) + 1);
          degree.set(e.target, (degree.get(e.target) || 0) + 1);
        }
        const kept = new Set(
          [...nodes]
            .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
            .slice(0, GLOBAL_DISPLAY_CAP)
            .map((n) => n.id),
        );
        nodes = nodes.filter((n) => kept.has(n.id));
        edges = edges.filter((e) => kept.has(e.source) && kept.has(e.target));
      }
      selectedNodeIdRef.current = null;
      dataRef.current = { nodes, edges };
      setViewMode('global');
      setDataSource('live');
      scheduleFit();
      renderData();
      setSearchMessage(
        nodes.length >= GLOBAL_DISPLAY_CAP
          ? `全局视图：已展示前 ${GLOBAL_DISPLAY_CAP} 个核心节点`
          : `已加载全局拓扑（${nodes.length} 节点 / ${edges.length} 连线）`,
      );
    } catch {
      setDataSource('mock');
      setSearchMessage('全局图谱加载失败，请稍后重试');
    }
  };

  /** Switch back to the focused neighbourhood view. */
  const switchToFocused = async () => {
    setViewMode('focused');
    await loadFocusedSeed();
  };

  const changeLayout = (mode: 'force' | 'circular' | 'dagre') => {
    setLayoutMode(mode);
    layoutModeRef.current = mode;
    const graph = graphRef.current;
    if (!graph) return;
    const { width, height } = graphSizeRef.current;
    if (mode === 'force') {
      graph.updateLayout({ ...FORCE_LAYOUT, center: [width / 2, height / 2] });
    } else if (mode === 'circular') {
      const count = fullGraphDataRef.current.nodes.length || 1;
      graph.updateLayout({
        ...CIRCULAR_LAYOUT,
        center: [width / 2, height / 2],
        radius: Math.max(180, count * 22),
      });
    } else {
      graph.updateLayout({ ...DAGRE_LAYOUT, center: [width / 2, height / 2] });
    }
  };

  const changeSizeMode = (mode: 'degree' | 'fixed') => {
    setSizeMode(mode);
    sizeModeRef.current = mode;
    const graph = graphRef.current;
    if (!graph) return;
    const nodes = fullGraphDataRef.current.nodes;
    const maxDegree = Math.max(1, ...nodes.map((n: any) => n.degree || 0));
    for (const it of graph.getNodes()) {
      const m = it.getModel() as SeedGraphNode & { degree?: number };
      const size = nodeSizeForDegree(m.degree || 0, maxDegree, mode);
      graph.updateItem(it, { size, baseSize: size });
    }
  };

  const toggleLabels = () => {
    const next = !showLabels;
    setShowLabels(next);
    showLabelsRef.current = next;
    const graph = graphRef.current;
    if (!graph) return;
    for (const it of graph.getNodes()) {
      const m = it.getModel() as SeedGraphNode;
      const selected = selectedNodeIdRef.current === m.id;
      graph.updateItem(it, {
        label: next ? formatNodeLabel(m.label, selected) : '',
      });
    }
  };

  const toggleEdgeWeight = () => {
    const next = !showEdgeWeight;
    setShowEdgeWeight(next);
    const graph = graphRef.current;
    if (!graph) return;
    for (const it of graph.getEdges()) {
      const m = it.getModel() as SeedGraphEdge;
      graph.updateItem(it, {
        label: next && typeof m.similarity === 'number' ? m.similarity.toFixed(2) : '',
      });
    }
  };

  const changeThreshold = (value: number) => {
    setMinSimilarity(value);
    minSimilarityRef.current = value;
    applyTypeFilter(activeType);
  };

  const zoomIn = () => {
    const graph = graphRef.current;
    if (!graph) return;
    const { width, height } = graphSizeRef.current;
    graph.zoom(1.2, { x: width / 2, y: height / 2 });
  };

  const zoomOut = () => {
    const graph = graphRef.current;
    if (!graph) return;
    const { width, height } = graphSizeRef.current;
    graph.zoom(0.8, { x: width / 2, y: height / 2 });
  };

  const centerView = () => {
    const graph = graphRef.current;
    if (!graph) return;
    try {
      graph.fitView(60, false, false);
    } catch {
      graph.refreshPositions();
    }
  };

  const resetLayout = () => {
    changeLayout(layoutModeRef.current);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const graphWidth = container.clientWidth || 800;
    const graphHeight = container.clientHeight || 600;
    graphSizeRef.current = { width: graphWidth, height: graphHeight };

    const minimap = new G6.Minimap({
      size: [120, 80],
      className: 'kg-minimap',
      type: 'delegate',
    });

    const graph = new G6.Graph({
      container,
      width: graphWidth,
      height: graphHeight,
      fitView: true,
      fitViewPadding: 60,
      animate: true,
      modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },
      plugins: [minimap],
      layout: {
        ...FORCE_LAYOUT,
        center: [graphWidth / 2, graphHeight / 2],
      },
      defaultNode: {
        type: 'circle',
        size: 14,
        style: {
          stroke: '#FFFFFF',
          lineWidth: 1,
          cursor: 'pointer',
          shadowColor: 'rgba(219, 95, 91, 0.12)',
          shadowBlur: 4,
        },
        labelCfg: {
          position: 'bottom',
          offset: 5,
          style: {
            fontSize: 11,
            fill: '#334155',
            fontWeight: 500,
            textAlign: 'center',
            lineHeight: 14,
            maxWidth: 120,
            wordWrap: true,
            stroke: 'rgba(255,255,255,0.9)',
            lineWidth: 2,
          },
        },
      },
      defaultEdge: {
        type: 'line',
        style: {
          endArrow: false,
          stroke: '#94A3B8',
          lineWidth: 1,
          opacity: 0.2,
        },
        labelCfg: {
          autoRotate: true,
          style: {
            fontSize: 8,
            fill: '#64748B',
            stroke: '#FFFFFF',
            lineWidth: 2,
          },
        },
      },
      nodeStateStyles: {
        selected: {
          style: {
            lineWidth: 2,
            stroke: '#DB5F5B',
            shadowColor: '#DB5F5B',
            shadowBlur: 8,
          },
        },
        highlight: { style: { lineWidth: 2, stroke: '#F59E0B' } },
        dim: { style: { opacity: 0.15 } },
      },
      edgeStateStyles: {
        hover: {
          style: {
            opacity: 1,
            stroke: '#DB5F5B',
            lineWidth: 1.6,
          },
        },
        dim: { style: { opacity: 0.05 } },
      },
    });
    graphRef.current = graph;

    graph.on('afterlayout', () => {
      if (pendingFitRef.current) {
        setTimeout(() => {
          if (pendingFitRef.current) fitGraphToView();
        }, 100);
      }
    });
    graph.on('layoutcomplete', () => {
      if (pendingFitRef.current) {
        setTimeout(() => {
          if (pendingFitRef.current) fitGraphToView();
        }, 100);
      }
    });

    const load = async () => {
      await loadFocusedSeed();
      if (cancelled) return;
      renderData();
      setLoading(false);
      scheduleFit();
    };

    graph.on('node:mouseenter', (evt: any) => {
      const item = evt.item;
      const model = item.getModel() as SeedGraphNode & { baseSize?: number };
      if (!selectedNodeIdRef.current && model.baseSize) {
        graph.updateItem(item, {
          size: Math.min(MAX_NODE_SIZE + 4, Math.round(model.baseSize * 1.15)),
        });
      }
      const tooltip = tooltipRef.current;
      const rect = container.getBoundingClientRect();
      const point = graph.getClientByPoint(evt.x, evt.y);
      if (tooltip && rect) {
        tooltip.innerHTML = buildTooltipHtml(model);
        tooltip.style.left = `${Math.min(point.x - rect.left + 14, rect.width - 250)}px`;
        tooltip.style.top = `${Math.min(point.y - rect.top + 14, rect.height - 130)}px`;
        tooltip.style.display = 'block';
      }
    });

    graph.on('node:mouseleave', (evt: any) => {
      const model = evt.item.getModel() as SeedGraphNode & { baseSize?: number };
      if (model.baseSize) graph.updateItem(evt.item, { size: model.baseSize });
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    graph.on('edge:mouseenter', (evt: any) => {
      const item = evt.item;
      graph.setItemState(item, 'hover', true);
      const model = item.getModel() as SeedGraphEdge;
      const tooltip = tooltipRef.current;
      const rect = container.getBoundingClientRect();
      const point = graph.getClientByPoint(evt.x, evt.y);
      if (tooltip && rect) {
        tooltip.innerHTML = buildEdgeTooltipHtml(model);
        tooltip.style.left = `${Math.min(point.x - rect.left + 14, rect.width - 250)}px`;
        tooltip.style.top = `${Math.min(point.y - rect.top + 14, rect.height - 130)}px`;
        tooltip.style.display = 'block';
      }
    });

    graph.on('edge:mouseleave', (evt: any) => {
      graph.setItemState(evt.item, 'hover', false);
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    graph.on('node:click', (evt: any) => {
      const model = evt.item.getModel() as SeedGraphNode;
      setSelection(evt.item, model);
      applyNeighborHighlight(evt.item, model);
      setSelectedNode(model);
      setSelectedDegree(
        fullGraphDataRef.current.edges.filter((e) => e.source === model.id || e.target === model.id).length,
      );
    });

    graph.on('canvas:click', () => {
      resetNeighborHighlight();
      setSelection(null, null);
      setSelectedNode(null);
      setSelectedDegree(0);
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    const handleResize = () => {
      if (graphRef.current && container) {
        graphRef.current.changeSize(container.clientWidth || 800, container.clientHeight || 600);
        graphSizeRef.current = {
          width: container.clientWidth || 800,
          height: container.clientHeight || 600,
        };
      }
    };
    window.addEventListener('resize', handleResize);

    load();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      graph.destroy();
      graphRef.current = null;
    };
  }, []);

  const visibleTypes = legendTypes.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  const typeTotal = visibleTypes.reduce((sum, item) => sum + item.count, 0);
  const typeMax = Math.max(1, ...visibleTypes.map((item) => item.count));
  const atNodeCap = stats.nodeCount >= MAX_GRAPH_NODES;
  const legendItems = visibleTypes.slice(0, 6);

  const kpis: { key: string; label: string; value: string; hint: string; icon: LucideIcon; color: string }[] = [
    { key: 'nodes', label: '文档节点', value: String(stats.nodeCount), hint: viewMode === 'global' ? '全局范围' : '局部范围', icon: Database, color: '#2B3150' },
    { key: 'edges', label: '关系连线', value: String(stats.edgeCount), hint: `平均度数 ${stats.avgDegree}`, icon: GitBranch, color: '#DB5F5B' },
    { key: 'types', label: '知识分类', value: String(stats.typeCount), hint: `密度 ${(stats.density * 100).toFixed(1)}%`, icon: Layers, color: '#F2D760' },
    { key: 'hub', label: '核心节点', value: stats.hubLabel, hint: `${stats.hubDegree} 条关联`, icon: Target, color: '#3F7E5F' },
  ];

  const toolbarItems: { key: string; label: string; icon: LucideIcon; onClick: () => void }[] = [
    { key: 'zoom-in', label: '放大', icon: ZoomIn, onClick: zoomIn },
    { key: 'zoom-out', label: '缩小', icon: ZoomOut, onClick: zoomOut },
    { key: 'center', label: '居中', icon: Maximize2, onClick: centerView },
    { key: 'reset', label: '重置布局', icon: RefreshCw, onClick: resetLayout },
  ];

  return (
    <div
      className="kg-dashboard-grid kg-panel relative overflow-hidden rounded-xl border border-slate-200 text-slate-700 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.18)]"
      id="knowledge-graph-dashboard"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#DB5F5B]/70 via-[#2B3150]/50 to-[#F2D760]/40" aria-hidden="true" />

      {/* Dashboard header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/60 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border border-[#DB5F5B]/30 bg-[#DB5F5B]/10 text-[#DB5F5B] shadow-[0_0_12px_rgba(219,95,91,0.18)]">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-sm font-bold tracking-wide text-slate-900">知识图谱分析台</h1>
              <span className="hidden rounded-md border border-[#DB5F5B]/30 bg-[#DB5F5B]/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-[#DB5F5B] sm:inline-block">
                探索模式
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#DB5F5B] shadow-[0_0_6px_rgba(219,95,91,0.5)]" aria-hidden="true" />
              semantic knowledge explorer
            </p>
          </div>
        </div>

        <div className="order-3 w-full min-w-0 sm:order-none sm:w-80 lg:w-[340px]">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <span className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 rounded-md bg-[#DB5F5B]/12 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#DB5F5B]">
                搜全库
              </span>
              <input
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleKnowledgeSearch(); }}
                placeholder="输入关键词，定位知识节点…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-[86px] pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#1D70B8]/60 focus:outline-none focus:ring-2 focus:ring-[#1D70B8]/20"
              />
            </div>
            <button
              type="button"
              onClick={handleKnowledgeSearch}
              disabled={searching || !knowledgeQuery.trim()}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-[#2B3150] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#2B3150]/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>
          {searchMessage && (
            <p className="mt-1 truncate text-[10px] font-medium text-slate-500">{searchMessage}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={switchToFocused}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${viewMode === 'focused' ? 'bg-[#2B3150] text-white' : 'text-slate-600 hover:bg-white'}`}
            >
              聚焦
            </button>
            <button
              type="button"
              onClick={loadGlobal}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${viewMode === 'global' ? 'bg-[#2B3150] text-white' : 'text-slate-600 hover:bg-white'}`}
            >
              全局
            </button>
          </div>
          {dataSource === 'mock' ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-amber-700">演示数据 · DEMO</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-600">在线 · LIVE</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[10px] font-semibold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />
            {stats.nodeCount} 节点 / {stats.edgeCount} 连线
          </span>
          <button
            type="button"
            onClick={handleViewEntry}
            disabled={!selectedNode}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DB5F5B] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#DB5F5B]/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            查看条目
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 p-3 sm:p-4 lg:grid-cols-12 lg:gap-4">
        {/* Left analytics rail */}
        <aside className="kg-panel kg-panel-left kg-scroll-thin flex flex-col gap-3 lg:col-span-3 lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto lg:pr-0.5">
          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-extrabold tracking-wide text-[#2B3150]">核心指标</h2>
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-400">overview</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {kpis.map((kpi) => (
                <div key={kpi.key} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-md" style={{ backgroundColor: `${kpi.color}1a`, color: kpi.color }}>
                      <kpi.icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span className="truncate text-[9px] font-semibold text-slate-500">{kpi.label}</span>
                  </div>
                  <div className="mt-1.5 truncate font-mono text-lg font-bold text-slate-900" title={kpi.value}>{kpi.value}</div>
                  <div className="truncate font-mono text-[8px] uppercase tracking-wider text-slate-400">{kpi.hint}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Boxes className="h-3.5 w-3.5 text-[#DB5F5B]" aria-hidden="true" />
                <h2 className="text-[11px] font-extrabold tracking-wide text-[#2B3150]">节点类型分布</h2>
              </div>
              <span className="font-mono text-[9px] font-semibold text-slate-400">{stats.typeCount} 类</span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {visibleTypes.map((item) => {
                const percent = typeTotal ? Math.round((item.count / typeTotal) * 100) : 0;
                return (
                  <li key={item.type}>
                    <button
                      type="button"
                      onClick={() => applyTypeFilter(activeType === item.type ? '' : item.type)}
                      className="group w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[10px]">
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 0 3px ${item.color}26` }} />
                          <span className={`truncate ${activeType === item.type ? 'font-bold text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>{item.type}</span>
                        </span>
                        <span className="font-mono text-[9px] font-semibold text-slate-400">{item.count} · {percent}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, (item.count / typeMax) * 100)}%`, backgroundColor: item.color }} />
                      </div>
                    </button>
                  </li>
                );
              })}
              {visibleTypes.length === 0 && (
                <li className="py-4 text-center text-[10px] text-slate-400">暂无分类数据</li>
              )}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CircleDot className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
                <h2 className="text-[11px] font-extrabold tracking-wide text-[#2B3150]">关系构成</h2>
              </div>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-slate-400">
                密度 {stats.density.toFixed(3)}
              </span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {stats.relations.map((rel) => (
                <li key={rel.label}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[10px]">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: rel.color }} />
                      <span className="truncate text-slate-600">{rel.text}</span>
                      <span className="font-mono text-[8px] uppercase tracking-wide text-slate-400">{rel.label}</span>
                    </span>
                    <span className="font-mono text-[9px] font-semibold text-slate-500">{rel.count} / {rel.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, rel.percent)}%`, backgroundColor: rel.color }} />
                  </div>
                </li>
              ))}
              {stats.relations.length === 0 && (
                <li className="py-4 text-center text-[10px] text-slate-400">暂无关系数据</li>
              )}
            </ul>

            <div className="mt-3 border-t border-slate-200 pt-2.5">
              <p className="mb-2 font-mono text-[8px] uppercase tracking-wider text-slate-400">来源构成 · by source</p>
              <ul className="space-y-1.5">
                {stats.relationSources.map((src) => (
                  <li key={src.label} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: src.color }} />
                      <span className="truncate text-slate-600">{src.text}</span>
                      <span className="font-mono text-[8px] uppercase tracking-wide text-slate-400">{src.label}</span>
                    </span>
                    <span className="font-mono text-[9px] font-semibold text-slate-500">{src.count} / {src.percent}%</span>
                  </li>
                ))}
                {stats.relationSources.length === 0 && (
                  <li className="py-2 text-center text-[10px] text-slate-400">暂无来源数据</li>
                )}
              </ul>
            </div>
          </section>
        </aside>

        {/* Center graph workspace */}
        <section className="kg-panel flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.18)] lg:col-span-6 lg:h-[calc(100vh-230px)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#DB5F5B] shadow-[0_0_8px_rgba(219,95,91,0.35)]" aria-hidden="true" />
              <h2 className="text-xs font-extrabold tracking-wide text-[#2B3150]">关系网络视图</h2>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400 sm:inline">
                {layoutMode === 'force' ? 'force layout' : layoutMode === 'circular' ? 'circular layout' : 'dagre layout'}
              </span>
            </div>
            <div className="relative w-full sm:w-64">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 rounded-md bg-[#1D70B8]/12 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#1D70B8]">
                筛当前
              </span>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); applySearch(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') applySearch(search); }}
                placeholder="高亮当前视图匹配节点"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-[64px] pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#1D70B8]/60 focus:outline-none focus:ring-2 focus:ring-[#1D70B8]/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="清空筛选"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {!loading && (
            <div className="kg-scroll-thin flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50/60 px-3 py-2">
              <button
                type="button"
                onClick={() => applyTypeFilter('')}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold ring-1 transition ${activeType === '' ? 'bg-[#2B3150] text-white ring-[#2B3150]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
              >
                全部
                <span className="font-mono text-[9px] opacity-80">{stats.nodeCount}</span>
              </button>
              {visibleTypes.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => applyTypeFilter(activeType === item.type ? '' : item.type)}
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold ring-1 transition ${activeType === item.type ? 'bg-[#2B3150] text-white ring-[#2B3150]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.type}
                  <span className="font-mono text-[9px] opacity-80">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="kg-graph-stage relative min-h-0 flex-1">
            <div ref={containerRef} className="h-full w-full" />
            <div
              ref={tooltipRef}
              data-testid="graph-tooltip"
              className="pointer-events-none absolute z-20 hidden rounded-lg border border-slate-200 bg-white/95 px-3 py-2.5 text-slate-700 shadow-xl shadow-slate-900/10 backdrop-blur"
              style={{ maxWidth: 260 }}
            />

            {/* Left toolbar */}
            <div className="kg-graph-toolbar flex flex-col gap-1.5">
              {toolbarItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  title={item.label}
                  aria-label={item.label}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition hover:bg-[#2B3150] hover:text-white active:scale-95"
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="kg-legend-panel pointer-events-none max-w-[220px] rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 shadow-sm backdrop-blur">
              <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                <CircleDot className="h-3 w-3 text-[#DB5F5B]" aria-hidden="true" />
                图例
              </div>
              <div className="space-y-1">
                {legendItems.map((item) => (
                  <div key={item.type} className="flex items-center gap-1.5 text-[9px] text-slate-600">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.type}</span>
                    <span className="ml-auto font-mono text-slate-400">{item.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-[8px] text-slate-400">
                节点大小=关联数 · 线粗=相似度 · 实线/虚线/点线=向量/标签/人工
              </div>
            </div>

            {viewMode === 'focused' && atNodeCap && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1 text-[10px] font-semibold text-amber-700 shadow-sm">
                已达 {MAX_GRAPH_NODES} 节点上限，继续展开查看更多关联知识
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/10">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#DB5F5B] border-t-transparent" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-500">正在加载图谱数据...</span>
                </div>
              </div>
            )}

            {!loading && dataSource === 'live' && stats.nodeCount === 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 backdrop-blur-[1px]">
                <div className="max-w-xs px-6 text-center">
                  <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
                    <Network className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-bold text-slate-700">图谱暂无关联数据</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">上传文档并重建语义关系后，这里会展示知识关联拓扑。</p>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/import')}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#2B3150] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#2B3150]/90 active:scale-[0.98]"
                  >
                    <Database className="h-3.5 w-3.5" aria-hidden="true" />
                    去知识导入
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right action rail */}
        <aside className="kg-panel kg-panel-right kg-scroll-thin flex flex-col gap-3 lg:col-span-3 lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto lg:pr-0.5">
          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <h2 className="text-[11px] font-extrabold tracking-wide text-[#2B3150]">图谱设置</h2>
              </div>
              <span className="font-mono text-[8px] uppercase tracking-widest text-slate-400">graph view</span>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <p className="mb-1.5 text-[10px] font-bold text-slate-600">布局模式</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['force', '力导向'],
                    ['circular', '环形'],
                    ['dagre', '层级'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changeLayout(mode)}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-bold ring-1 transition ${layoutMode === mode ? 'bg-[#2B3150] text-white ring-[#2B3150]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-bold text-slate-600">节点大小</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    ['degree', '按关联度'],
                    ['fixed', '固定大小'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changeSizeMode(mode)}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-bold ring-1 transition ${sizeMode === mode ? 'bg-[#1D70B8] text-white ring-[#1D70B8]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={toggleLabels}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-left"
                >
                  <span className="text-[10px] font-bold text-slate-600">节点标签</span>
                  <span className={`relative h-4 w-8 rounded-full transition ${showLabels ? 'bg-[#DB5F5B]' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition ${showLabels ? 'left-4.5' : 'left-0.5'}`} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleEdgeWeight}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-left"
                >
                  <span className="text-[10px] font-bold text-slate-600">边权重显示</span>
                  <span className={`relative h-4 w-8 rounded-full transition ${showEdgeWeight ? 'bg-[#DB5F5B]' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition ${showEdgeWeight ? 'left-4.5' : 'left-0.5'}`} />
                  </span>
                </button>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-600">最小关联阈值</p>
                  <span className="font-mono text-[10px] font-bold text-[#DB5F5B]">{minSimilarity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minSimilarity}
                  onChange={(e) => changeThreshold(Number(e.target.value))}
                  className="w-full accent-[#1D70B8]"
                />
                <div className="mt-0.5 flex justify-between font-mono text-[8px] text-slate-400">
                  <span>0</span>
                  <span>低于阈值隐藏边</span>
                  <span>1</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[11px] font-extrabold tracking-wide text-[#2B3150]">关键词筛选</h2>
                <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-400">tag filter</p>
              </div>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-slate-400">
                {keywordFilters.length} 个标签
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={clearKeywordFilter}
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${activeKeyword === '' ? 'bg-[#2B3150] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                全部
              </button>
              {keywordFilters.map((item) => (
                <button
                  key={item.keyword}
                  type="button"
                  onClick={() => applyKeywordFilter(item.keyword)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${activeKeyword === item.keyword ? 'bg-[#DB5F5B] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-[#DB5F5B]/40 hover:bg-[#DB5F5B]/10 hover:text-[#DB5F5B]'}`}
                >
                  {item.keyword}
                  <span className="ml-1 font-mono text-[9px] opacity-70">{item.count}</span>
                </button>
              ))}
              {keywordFilters.length === 0 && (
                <p className="py-4 text-center text-[10px] text-slate-400">暂无标签数据</p>
              )}
            </div>
          </section>

          <section className="flex min-h-[280px] flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h2 className="text-[11px] font-extrabold tracking-wide text-[#2B3150]">节点分析</h2>
                <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-400">node inspector</p>
              </div>
              {selectedNode && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLOR_MAP[selectedNode.type] || '#999999' }} />
                  N-{selectedNode.id}
                </span>
              )}
            </div>
            {selectedNode ? (
              <div className="mt-3 flex flex-1 flex-col">
                <h3 className="text-[13px] font-extrabold leading-snug text-slate-900">{selectedNode.label}</h3>
                <span
                  className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold"
                  style={{
                    color: TYPE_COLOR_MAP[selectedNode.type] || '#666666',
                    backgroundColor: `${TYPE_COLOR_MAP[selectedNode.type] || '#999999'}15`,
                    boxShadow: `inset 0 0 0 1px ${TYPE_COLOR_MAP[selectedNode.type] || '#999999'}35`,
                  }}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLOR_MAP[selectedNode.type] || '#999999' }} />
                  {selectedNode.type}
                </span>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">{selectedNode.metadata?.summary || '暂无描述'}</p>
                <dl className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-[10px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-400">编号</dt>
                    <dd className="font-mono font-semibold text-slate-600">{selectedNode.id}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-400">关联数</dt>
                    <dd className="font-mono font-semibold text-slate-600">{selectedDegree}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-400">更新时间</dt>
                    <dd className="text-slate-600">{selectedNode.metadata?.updatedAt || '—'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="mt-0.5 text-slate-400">标签</dt>
                    <dd className="flex flex-wrap justify-end gap-1">
                      {(selectedNode.metadata?.tags || []).map((tag) => (
                        <span key={tag} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600">{tag}</span>
                      ))}
                      {(selectedNode.metadata?.tags || []).length === 0 && <span className="text-slate-400">—</span>}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-col gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => expandNode(selectedNode.id)}
                    disabled={expanding}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2B3150] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#2B3150]/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                    {expanding ? '展开中...' : '展开关联知识'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/entry/${selectedNode.id}`)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#DB5F5B]/40 bg-[#DB5F5B]/10 px-3 py-2 text-xs font-bold text-[#DB5F5B] transition hover:bg-[#DB5F5B]/15 active:scale-[0.99]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    查看知识条目
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
                  <Radar className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <p className="text-xs text-slate-400">未选中节点</p>
                <p className="max-w-[180px] font-mono text-[9px] uppercase tracking-wider text-slate-400">node inspector</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
