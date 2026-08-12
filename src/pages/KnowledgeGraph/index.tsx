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
  Network,
  Radar,
  Search,
  Target,
  X,
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

type SeedGraphRelation = 'semantic_related';

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
      const relation = ['references', 'produces', 'belongs_to', 'derived_from', 'shared_tags'].includes(rawRelation)
        ? 'semantic_related'
        : rawRelation;
      return {
        source: cleanId(e.source ?? e.from),
        target: cleanId(e.target ?? e.to),
        label: 'semantic_related',
        relation: relation as SeedGraphRelation,
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
    lineWidth: 2,
    cursor: 'pointer',
    shadowColor: `${base}66`,
    shadowBlur: 18,
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

// Initial seed documents. Override via VITE_GRAPH_SEED_IDS when needed.
const SEED_IDS = [1, 2, 3, 4, 5];

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
  semantic_related: { text: '语义关联', color: '#22D3EE' },
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
  const relations: RelationStat[] = (Object.keys(RELATION_META) as SeedGraphEdge['label'][]).map((label) => ({
    label,
    ...RELATION_META[label],
    count: relationCounts.get(label) || 0,
    percent: edgeCount ? Math.round(((relationCounts.get(label) || 0) / edgeCount) * 100) : 0,
  }));
  return {
    nodeCount,
    edgeCount,
    typeCount: typeSet.size,
    avgDegree,
    density,
    hubLabel: hubNode?.label || '—',
    hubDegree: hub?.[1] || 0,
    relations,
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
        <span class="font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-600">${escapeHtml(node.type)}</span>
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
  const similarity = typeof model.similarity === 'number' ? model.similarity.toFixed(2) : null;
  const sourceText = model.relationSource === 'tag' ? '标签关联' : '向量相似度';
  const simText = similarity !== null
    ? similarity
    : (model.relationSource === 'tag' ? '无（标签关联）' : '—');
  return `
    <div class="min-w-[160px] text-left">
      <div class="mb-1 text-[12px] font-bold leading-snug text-slate-900">语义关联</div>
      <div class="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-600">semantic_related</div>
      <div class="text-[10px] text-slate-500">相似度：${escapeHtml(simText)}</div>
      <div class="text-[10px] text-slate-400">来源：${escapeHtml(sourceText)}</div>
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

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GraphStats>(EMPTY_STATS);
  const [selectedNode, setSelectedNode] = useState<SeedGraphNode | null>(null);
  const [selectedDegree, setSelectedDegree] = useState(0);
  const [search, setSearch] = useState('');
  const [legendTypes, setLegendTypes] = useState<LegendTypeItem[]>([]);
  const [activeType, setActiveType] = useState('');
  const [keywordFilters, setKeywordFilters] = useState<KeywordFilterItem[]>([]);
  const [activeKeyword, setActiveKeyword] = useState('');

  const setSelection = (item: any, model: SeedGraphNode | null) => {
    const graph = graphRef.current;
    if (!graph) return;
    const items = graph.getNodes();
    for (const it of items) {
      graph.setItemState(it, 'selected', !!model && it === item);
    }
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
    const edges = full.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const graphWidth = container.clientWidth || 800;
    const graphHeight = container.clientHeight || 600;
    const graph = new G6.Graph({
      container,
      width: graphWidth,
      height: graphHeight,
      fitView: true,
      fitViewPadding: 40,
      animate: true,
      modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },
      layout: {
        type: 'force',
        center: [graphWidth / 2, graphHeight / 2],
        preventOverlap: true,
        nodeSize: (d: any) => (d.size || 44) / 2 + 12,
        nodeSpacing: 8,
        linkDistance: (edge: any) => Math.min(240, 170 / Math.max(0.08, edge.similarity || 0.5)),
        edgeStrength: 0.8,
        nodeStrength: -420,
        alpha: 0.6,
        alphaDecay: 0.018,
        alphaMin: 0.001,
        collideStrength: 1,
      },
      defaultNode: {
        type: 'circle',
        size: 44,
        style: {
          stroke: '#FFFFFF',
          lineWidth: 2,
          cursor: 'pointer',
          shadowColor: 'rgba(34, 211, 238, 0.25)',
          shadowBlur: 12,
        },
        labelCfg: {
          position: 'bottom',
          offset: 8,
          style: { fontSize: 11, fill: '#1F2430', fontWeight: 600, wordWrap: true, maxWidth: 70, textAlign: 'center', lineHeight: 15 },
        },
      },
      defaultEdge: {
        type: 'line',
        style: { endArrow: false, lineWidth: 1.2, stroke: '#CBD5E1' },
      },
      nodeStateStyles: {
        selected: {
          style: {
            lineWidth: 3,
            stroke: '#0EA5E9',
            shadowColor: '#0EA5E9',
            shadowBlur: 16,
          },
        },
        highlight: { style: { lineWidth: 4, stroke: '#F59E0B' } },
        dim: { style: { opacity: 0.25 } },
      },
    });
    graphRef.current = graph;

    const load = async () => {
      try {
        const res = await fetch(`/api/graph/seed?ids=${SEED_IDS.join(',')}`, {
          headers: getAuthHeaders(),
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          const data = await res.json();
          const normalized = normalizeGraph(data);
          if (normalized.nodes.length > 0) dataRef.current = normalized;
        }
      } catch {
        // Fall through to seed data when the backend is unavailable.
      }
      if (cancelled) return;

      const data = dataRef.current;

      const graphData = {
        nodes: data.nodes.map((n) => ({
          ...n,
          size: 44,
          style: nodeStyleForType(n.type),
        })),
        edges: data.edges.map((e) => ({
          ...e,
          label: '',
          relation: e.relation,
          similarity: e.similarity,
          relationSource: e.relationSource,
        })),
      };
      fullGraphDataRef.current = graphData;
      applyTypeFilter('');
      setLoading(false);
    };

    graph.on('node:mouseenter', (evt: any) => {
      const item = evt.item;
      const model = item.getModel() as SeedGraphNode;
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

    graph.on('node:mouseleave', () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    graph.on('edge:mouseenter', (evt: any) => {
      const model = evt.item.getModel() as SeedGraphEdge;
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

    graph.on('edge:mouseleave', () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    graph.on('node:click', (evt: any) => {
      const model = evt.item.getModel() as SeedGraphNode;
      setSelection(evt.item, model);
      setSelectedNode(model);
      setSelectedDegree(
        fullGraphDataRef.current.edges.filter((e) => e.source === model.id || e.target === model.id).length,
      );
    });

    graph.on('canvas:click', () => {
      setSelection(null, null);
      setSelectedNode(null);
      setSelectedDegree(0);
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    const handleResize = () => {
      if (graphRef.current && container) {
        graphRef.current.changeSize(container.clientWidth || 800, container.clientHeight || 600);
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

  const kpis: { key: string; label: string; value: string; hint: string; icon: LucideIcon; color: string }[] = [
    { key: 'nodes', label: '文档节点', value: String(stats.nodeCount), hint: '精选范围', icon: Database, color: '#22D3EE' },
    { key: 'edges', label: '关系连线', value: String(stats.edgeCount), hint: `平均度数 ${stats.avgDegree}`, icon: GitBranch, color: '#A78BFA' },
    { key: 'types', label: '知识分类', value: String(stats.typeCount), hint: `密度 ${(stats.density * 100).toFixed(1)}%`, icon: Layers, color: '#FBBF24' },
    { key: 'hub', label: '核心节点', value: stats.hubLabel, hint: `${stats.hubDegree} 条关联`, icon: Target, color: '#34D399' },
  ];

  return (
    <div
      className="kg-dashboard-grid kg-panel relative overflow-hidden rounded-xl border border-slate-200 text-slate-700 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.18)]"
      id="knowledge-graph-dashboard"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/70 via-violet-400/50 to-amber-300/40" aria-hidden="true" />

      {/* Dashboard header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/60 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-600 shadow-[0_0_12px_rgba(34,211,238,0.18)]">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-sm font-bold tracking-wide text-slate-900">知识图谱分析台</h1>
              <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-slate-500 sm:inline-block">
                seed 5
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(34,211,238,0.5)]" aria-hidden="true" />
              knowledge graph analytics
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-600">在线</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[10px] font-semibold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />
            {stats.nodeCount} 节点 / {stats.edgeCount} 连线
          </span>
          <button
            type="button"
            onClick={handleViewEntry}
            disabled={!selectedNode}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-cyan-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
              <h2 className="text-[11px] font-extrabold tracking-wide text-slate-800">核心指标</h2>
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
                <Boxes className="h-3.5 w-3.5 text-cyan-600" aria-hidden="true" />
                <h2 className="text-[11px] font-extrabold tracking-wide text-slate-800">节点类型分布</h2>
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
                <h2 className="text-[11px] font-extrabold tracking-wide text-slate-800">关系构成</h2>
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
          </section>
        </aside>

        {/* Center graph workspace */}
        <section className="kg-panel flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.18)] lg:col-span-6 lg:h-[calc(100vh-230px)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.35)]" aria-hidden="true" />
              <h2 className="text-xs font-extrabold tracking-wide text-slate-800">关系网络视图</h2>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400 sm:inline">force layout</span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); applySearch(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') applySearch(search); }}
                placeholder="搜索节点关键词"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="清空搜索"
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
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold ring-1 transition ${activeType === '' ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
              >
                全部
                <span className="font-mono text-[9px] opacity-80">{stats.nodeCount}</span>
              </button>
              {visibleTypes.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => applyTypeFilter(activeType === item.type ? '' : item.type)}
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold ring-1 transition ${activeType === item.type ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
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
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/10">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-500">正在加载图谱数据...</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right action rail */}
        <aside className="kg-panel kg-panel-right kg-scroll-thin flex flex-col gap-3 lg:col-span-3 lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto lg:pr-0.5">
          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[11px] font-extrabold tracking-wide text-slate-800">关键词筛选</h2>
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
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${activeKeyword === '' ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                全部
              </button>
              {keywordFilters.map((item) => (
                <button
                  key={item.keyword}
                  type="button"
                  onClick={() => applyKeywordFilter(item.keyword)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${activeKeyword === item.keyword ? 'bg-cyan-500 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700'}`}
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
                <h2 className="text-[11px] font-extrabold tracking-wide text-slate-800">节点分析</h2>
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
                <button
                  type="button"
                  onClick={() => navigate(`/entry/${selectedNode.id}`)}
                  className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700 transition hover:bg-cyan-100 active:scale-[0.99]"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  查看知识条目
                </button>
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
