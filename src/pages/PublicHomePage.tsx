import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ChevronRight, ArrowUpRight, Clock, Layers,
  BookOpen, Beaker, Ruler, TrendingUp, Sparkles, Zap,
  FileText, ArrowRight
} from 'lucide-react';
import { WikiEntry } from '../types/wiki';
import { entriesApi } from '../api/entriesApi';

// ─── Constants ────────────────────────────────────────────────────────────────
const FEATURED_LINKS = [
  { label: '稳定子算法 Sandbox 项目', route: '/entry/e-stabilizer-project' },
  { label: '量子计算论文库', route: '/papers' },
  { label: '数据条目与标准', route: '/data-items' },
  { label: 'AI 知识查询服务', route: '/ai-query' },
  { label: '项目复盘模板', route: '/templates' },
  { label: '知识导入流程', route: '/admin/import' },
];

const QUICK_NAV = [
  { label: '所有知识条目', route: '/search' },
  { label: 'Sandbox 项目', route: '/search' },
  { label: '学术论文', route: '/papers' },
  { label: '数据条目', route: '/data-items' },
  { label: '模板文件', route: '/templates' },
  { label: '知识服务', route: '/ai-query' },
  { label: '知识图谱', route: '/graph' },
  { label: '系统版本', route: '/system-version' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(isoString: string): string {
  return isoString?.substring(0, 10) || '—';
}

function countByType(entries: WikiEntry[], type: string): number {
  return entries.filter((e) => e.entryType === type).length;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PublicHomePage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [allEntries, setAllEntries] = useState<WikiEntry[]>([]);
  const [statsData, setStatsData] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const publicEntries = useMemo(
    () => allEntries.filter((e) => e.visibility === 'public'),
    [allEntries],
  );

  useEffect(() => {
    const fetchEntries = async () => {
      setEntriesLoading(true);
      try {
        const data = await entriesApi.getEntries();
        setAllEntries(data);
      } catch {
        setAllEntries([]);
      }
      try {
        const stats = await entriesApi.getStats();
        setStatsData(stats);
      } catch {
        setStatsData(null);
      }
      setEntriesLoading(false);
    };
    fetchEntries();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput)}`);
    }
  };

  const handleQuickNav = (query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = statsData?.total ?? allEntries.length;
    const papers = statsData?.byType['academic_paper'] ?? countByType(allEntries, 'academic_paper');
    const sandbox = statsData?.byType['sandbox_project'] ?? countByType(allEntries, 'sandbox_project');
    const dataStandards = statsData?.byType['data_standard'] ?? countByType(allEntries, 'data_standard');
    const lastUpdated = allEntries.length > 0
      ? allEntries.reduce((a, b) =>
          a.latestUpdatedAt > b.latestUpdatedAt ? a : b
        ).latestUpdatedAt
      : null;

    return { total, papers, sandbox, dataStandards, lastUpdated };
  }, [allEntries, statsData]);

  const featuredEntries = useMemo(() => {
    return [...publicEntries]
      .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt))
      .slice(0, 3);
  }, [publicEntries]);

  // ── Keyboard shortcut ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('public-hero-search');
        input?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0" id="public-home-panel">
      {/* ═══════════════════════════════════════════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden bg-white border-b border-gray-200"
        aria-label="Hero"
      >
        <div className="h-1 bg-gradient-to-r from-ink via-brand/60 to-transparent" />

        <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16 lg:py-20">
          {/* Brand */}
          <div className="inline-flex items-center gap-2 mb-5">
            <span className="flex items-center justify-center w-8 h-8 rounded bg-ink">
              <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-ink uppercase tracking-wider font-mono">
              微观纪元
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-ink font-display tracking-tight leading-tight">
            企业知识资产目录
            <span className="block text-ink/70 font-normal mt-1">与 AI 知识平台</span>
          </h1>
          <p className="mt-4 text-sm text-gray-500 max-w-xl leading-relaxed">
            连接 Sandbox 项目过程、实验结果、引用文献、数据条目与 MiQroForge Desktop 知识服务 —
            搜索、查阅、提问，企业知识一站触达。
          </p>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="mt-8 max-w-2xl">
            <div
              className={`
                relative flex items-center bg-white border-2 rounded-lg transition-all duration-200
                ${searchFocused
                  ? 'border-brand shadow-[0_0_0_4px_rgba(219,95,91,0.12)]'
                  : 'border-gray-300 hover:border-gray-400'
                }
              `}
            >
              <span className="absolute left-4 flex items-center pointer-events-none">
                <Search
                  className={`w-5 h-5 transition-colors duration-200 ${searchFocused ? 'text-brand' : 'text-gray-400'}`}
                  aria-hidden="true"
                />
              </span>

              <input
                id="public-hero-search"
                type="text"
                className="flex-1 pl-12 pr-20 py-3.5 bg-transparent text-sm text-gray-900 placeholder-gray-400
                           focus:outline-none font-medium"
                placeholder="搜索知识、项目、论文、数据条目或服务..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />

              <span className="absolute right-[88px] hidden sm:flex items-center gap-0.5 text-[10px] text-gray-400 font-mono pointer-events-none">
                <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-sans">
                  {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                </kbd>
                <span>+</span>
                <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-sans">K</kbd>
              </span>

              <button
                type="submit"
                className="m-1.5 px-5 py-2 bg-ink hover:bg-ink/90 text-white text-sm font-semibold
                           rounded-md border-2 border-transparent
                           focus:outline-none focus:ring-2 focus:ring-brand/40
                           transition-all duration-150 shrink-0"
              >
                搜索
              </button>
            </div>

            {/* Quick links */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {FEATURED_LINKS.slice(0, 4).map((link) => (
                <button
                  key={link.label}
                  onClick={() => navigate(link.route)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-link
                             hover:underline hover:text-brand transition-colors"
                >
                  {link.label}
                  <ChevronRight className="w-3 h-3 text-gray-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          </form>

          {/* Stats */}
          <div className="mt-10 flex flex-wrap gap-4 sm:gap-6">
            {entriesLoading ? (
              <div className="flex gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-3 px-4 py-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200" />
                    <div className="space-y-1">
                      <div className="h-4 w-10 bg-gray-200 rounded" />
                      <div className="h-2.5 w-14 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <PublicStatBadge icon={Layers} value={stats.total} label="知识条目" />
                <PublicStatBadge icon={BookOpen} value={stats.papers} label="学术论文" />
                <PublicStatBadge icon={Beaker} value={stats.sandbox} label="Sandbox 项目" />
                <PublicStatBadge icon={Ruler} value={stats.dataStandards} label="数据标准" />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FEATURED CONTENT
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-cream/10"
        aria-label="重点推荐"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
              重点推荐
            </h2>
          </div>
          <p className="text-lg font-bold text-ink font-display mb-8">
            探索平台核心能力
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Sandbox Project */}
            <button
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="group bg-white border border-gray-200 rounded-lg p-5 text-left
                         hover:border-ink/20 hover:shadow-md hover:-translate-y-0.5
                         focus:outline-none focus:ring-2 focus:ring-brand/30
                         transition-all duration-200"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-50 mb-3
                              group-hover:bg-amber-100 transition-colors">
                <Beaker className="w-5 h-5 text-amber-600" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 group-hover:text-ink transition-colors">
                稳定子算法 Sandbox 计算项目
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">
                查看完整仿真过程记录、结果文件、物理模型引用文献、知识图谱及 MCP 知识工具包。
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-link
                               group-hover:text-brand transition-colors">
                查看详情
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </button>

            {/* Card 2: Papers */}
            <button
              onClick={() => navigate('/papers')}
              className="group bg-white border border-gray-200 rounded-lg p-5 text-left
                         hover:border-ink/20 hover:shadow-md hover:-translate-y-0.5
                         focus:outline-none focus:ring-2 focus:ring-brand/30
                         transition-all duration-200"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 mb-3
                              group-hover:bg-blue-100 transition-colors">
                <BookOpen className="w-5 h-5 text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 group-hover:text-ink transition-colors">
                论文知识库：量子计算方向
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">
                收录 Gottesman 及团队前沿论文，支持 PDF 入库、公式自动提取和知识图谱节点关联。
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-link
                               group-hover:text-brand transition-colors">
                浏览论文库
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </button>

            {/* Card 3: Knowledge Service */}
            <button
              onClick={() => navigate('/ai-query')}
              className="group bg-white border border-gray-200 rounded-lg p-5 text-left
                         hover:border-ink/20 hover:shadow-md hover:-translate-y-0.5
                         focus:outline-none focus:ring-2 focus:ring-brand/30
                         transition-all duration-200"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-50 mb-3
                              group-hover:bg-purple-100 transition-colors">
                <Sparkles className="w-5 h-5 text-purple-600" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5 group-hover:text-ink transition-colors">
                项目知识服务化流程
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">
                了解研发人员如何将冷数据一键打包，在 MiQroForge Desktop 智能体内进行免配置、可追溯的安全调用。
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-link
                               group-hover:text-brand transition-colors">
                AI 查询
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          LATEST PUBLIC ENTRIES
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-white"
        aria-label="最新公开条目"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
                  最新公开条目
                </h2>
              </div>
              <p className="text-lg font-bold text-ink font-display">
                公开知识资产
              </p>
            </div>
            <button
              onClick={() => navigate('/search')}
              className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-gray-500
                         hover:text-ink transition-colors"
            >
              查看全部
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {entriesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse p-4 border border-gray-100 rounded-lg space-y-2">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : publicEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" aria-hidden="true" />
              <p className="text-sm">暂无公开知识条目</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {publicEntries.slice(0, 6).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => navigate(`/entry/${entry.id}`)}
                  className="group flex flex-col p-4 bg-white border border-gray-200 rounded-lg text-left
                             hover:border-ink/20 hover:shadow-sm hover:-translate-y-0.5
                             focus:outline-none focus:ring-2 focus:ring-brand/30
                             transition-all duration-200"
                >
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-link transition-colors leading-snug">
                    {entry.title}
                  </h3>
                  {entry.summary && (
                    <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed flex-1">
                      {entry.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
                    <span className="font-medium text-gray-500">{entry.owner}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(entry.latestUpdatedAt)}</span>
                    <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => navigate('/search')}
            className="sm:hidden mt-4 w-full text-center text-xs font-semibold text-gray-500
                       hover:text-ink transition-colors py-2"
          >
            查看全部 →
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          MORE ON MICROERA WIKI
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-cream/10"
        aria-label="更多内容"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
              更多内容
            </h2>
          </div>
          <p className="text-lg font-bold text-ink font-display mb-6">
            探索 MicroEra Wiki
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {QUICK_NAV.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.route)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-link
                           hover:text-brand hover:bg-white rounded-md border border-transparent
                           hover:border-gray-200 transition-all duration-150 text-left"
              >
                {link.label}
                <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FOOTER NOTE — Latest Activity Timeline
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-10 bg-white border-t border-gray-200"
        aria-label="最新知识活动"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              最新知识活动
            </h2>
          </div>

          <div className="space-y-3 max-w-2xl">
            {[
              {
                date: '2026-07-02',
                entry: '稳定子算法 Sandbox 计算项目',
                route: '/entry/e-stabilizer-project',
                detail: '更新了结果文件及 Monte Carlo 仿真伪阈值折线图',
                isLatest: true,
              },
              {
                date: '2026-07-01',
                entry: '材料结构数据条目',
                route: '/data-items',
                detail: '物理 JSON Schema 数据结构更新至 v0.2，补充三斜胞体矩阵约束',
                isLatest: false,
              },
              {
                date: '2026-06-30',
                entry: 'Quantum Error Correction with Stabilizer Codes',
                route: '/papers',
                detail: '新增文献，由 MarkItDown 工具链自动提取并建立图谱关联',
                isLatest: false,
              },
              {
                date: '2026-06-29',
                entry: '项目复盘报告模板',
                route: '/templates',
                detail: '格式提纲更新至 v1.3，规范了物理引用标识的书写位置',
                isLatest: false,
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4 pl-4 relative">
                {/* Timeline dot + line */}
                <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-brand"
                     style={item.isLatest ? {} : { backgroundColor: '#D1D5DB' }} />
                {i < 3 && <div className="absolute left-[4px] top-4 bottom-0 w-0.5 bg-gray-200" />}

                <div className="flex-1 min-w-0 pb-4">
                  <span className="text-[11px] text-gray-400 font-mono font-semibold block mb-0.5">
                    {item.date}
                  </span>
                  <div className="text-xs leading-relaxed">
                    <button
                      onClick={() => navigate(item.route)}
                      className="text-link hover:underline font-semibold inline"
                    >
                      {item.entry}
                    </button>
                    <span className="text-gray-500"> — {item.detail}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

/** Stat badge for the public hero */
function PublicStatBadge({
  icon: Icon,
  value,
  label,
}: {
  icon: React.FC<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg">
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-ink/5">
        <Icon className="w-4 h-4 text-ink/60" aria-hidden="true" />
      </div>
      <div>
        <p className="text-lg font-bold text-ink font-mono leading-none">
          {value.toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  );
}
