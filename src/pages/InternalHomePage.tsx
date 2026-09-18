import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Sparkles, Clock, Bookmark, ArrowRight, ArrowUpRight,
  Cpu, Database, Network, FileText, BarChart3,
  TrendingUp, Star, Zap, Layers, Circle, ChevronRight,
  BookOpen, Beaker, Ruler, ClipboardList
} from 'lucide-react';
import { WikiEntry } from '../types/wiki';
import { entriesApi } from '../api/entriesApi';
import { bookmarksApi } from '../api/bookmarksApi';
import { storage } from '../lib/storage';
import EntryTypeBadge from '../components/EntryTypeBadge';

interface InternalHomePageProps {
  onNavigate: (view: string, id?: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const QUICK_QUESTIONS = [
  { text: '稳定子算法纠错结果是什么？', icon: Sparkles },
  { text: '量子计算方向节省了多少成本？', icon: TrendingUp },
  { text: '稳定子计算结果 Schema 详细规范', icon: Ruler },
  { text: '最近上传的纠错码论文有哪些？', icon: BookOpen },
];

const WORKSPACE_CARDS = [
  {
    key: 'sandbox',
    icon: Beaker,
    title: 'Sandbox 物理项目库',
    description: '记录和对比 Sandbox 多项多项式仿真过程与实验结果',
    type: 'sandbox_project' as const,
    route: '/entry/e-stabilizer-project',
    action: '进入项目',
  },
  {
    key: 'papers',
    icon: BookOpen,
    title: '学术论文文献库',
    description: '包含 Gottesman 等核心学者的纠错仿真研究白皮书',
    type: 'academic_paper' as const,
    route: '/papers',
    action: '浏览文献库',
  },
  {
    key: 'data',
    icon: Database,
    title: '研发数据规范与结构',
    description: '定义三斜晶格、纠错概率矩阵及 Hamiltonian 数据结构 Schema',
    type: 'data_standard' as const,
    route: '/data-items',
    action: '查看数据标准',
  },
  {
    key: 'templates',
    icon: ClipboardList,
    title: '研发文档与合规模板',
    description: '统一的实验日志、报告公式及复盘文档 Markdown 模版',
    type: 'template' as const,
    route: '/templates',
    action: '进入模板库',
  },
  {
    key: 'business',
    icon: BarChart3,
    title: '商业化价值与 ROI',
    description: '汇总量子计算、生物及材料算法为公司带来的资金与时间收益',
    type: 'business_material' as const,
    route: '/business-value',
    action: '查看评估',
  },
  {
    key: 'graph',
    icon: Network,
    title: '全局语义知识图谱',
    description: '全域节点交互式关联跳转，按引用、源文件及服务类型过滤',
    type: undefined,
    route: '/graph',
    action: '打开图谱',
  },
];

const SUGGESTED_SEARCHES = ['纠错码', '量子计算', '稳定子算法', 'Monte Carlo', '材料结构'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return isoString.substring(0, 10);
}

function countByType(entries: WikiEntry[], type: string): number {
  return entries.filter((e) => e.entryType === type).length;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function InternalHomePage() {
  const navigate = useNavigate();
  const [allEntries, setAllEntries] = useState<WikiEntry[]>([]);
  const [favorites, setFavorites] = useState<WikiEntry[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [favsLoading, setFavsLoading] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const list = await entriesApi.getEntries();
        setAllEntries(list);
      } catch (err) {
        console.error('Error loading entries:', err);
      }
      setEntriesLoading(false);

      try {
        const favs = await bookmarksApi.getBookmarks();
        setFavorites(favs);
      } catch {
        setFavorites([]);
      }
      setFavsLoading(false);
    };
    loadData();
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const recentEntries = useMemo(() => {
    return [...allEntries]
      .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt))
      .slice(0, 5);
  }, [allEntries]);

  const stats = useMemo(() => {
    const total = allEntries.length;
    const papers = countByType(allEntries, 'academic_paper');
    const sandbox = countByType(allEntries, 'sandbox_project');
    const dataStandards = countByType(allEntries, 'data_standard');
    const lastUpdated = allEntries.length > 0
      ? allEntries.reduce((a, b) =>
          a.latestUpdatedAt > b.latestUpdatedAt ? a : b
        ).latestUpdatedAt
      : null;
    const newThisWeek = allEntries.filter((e) => {
      const created = new Date(e.createdAt).getTime();
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return created > weekAgo;
    }).length;

    return { total, papers, sandbox, dataStandards, lastUpdated, newThisWeek };
  }, [allEntries]);

  const workspaceCounts = useMemo(() => {
    return {
      sandbox: stats.sandbox,
      papers: stats.papers,
      data: stats.dataStandards,
      templates: countByType(allEntries, 'template'),
      business: countByType(allEntries, 'business_material'),
      graph: allEntries.length, // graph nodes is a different concept, use total
    };
  }, [allEntries, stats]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      storage.setQuickQuestion(searchInput);
      navigate('/ai-query');
    }
  };

  const handleQuickQuestion = (q: string) => {
    storage.setQuickQuestion(q);
    navigate('/ai-query');
  };

  const handleSuggestedSearch = (term: string) => {
    storage.setSearchQuery(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  // ── Keyboard shortcut for search focus ────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('hero-search-input');
        input?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0" id="internal-home-panel">
      {/* ═══════════════════════════════════════════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden bg-white border-b border-gray-200"
        aria-label="Hero"
      >
        {/* Subtle top accent bar */}
        <div className="h-1 bg-gradient-to-r from-brand via-brand/60 to-transparent" />

        <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16 lg:py-20">
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand uppercase tracking-wider">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              企业研发知识工作台
            </span>
          </div>

          {/* Greeting */}
          <h1 className="text-3xl sm:text-4xl font-bold text-ink font-display tracking-tight leading-tight">
            您好，研发员。
            <span className="block text-ink/80 mt-1">今天想查阅什么？</span>
          </h1>
          <p className="mt-3 text-sm text-gray-500 max-w-2xl leading-relaxed">
            秒级检索企业知识、追溯 Sandbox 物理实验过程、查阅学术论文、或向 AI 智能体提问 — 所有知识资产，一站触达。
          </p>

          {/* AI Search Box */}
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
              {/* Search icon */}
              <span className="absolute left-4 flex items-center pointer-events-none">
                <Search
                  className={`w-5 h-5 transition-colors duration-200 ${searchFocused ? 'text-brand' : 'text-gray-400'}`}
                  aria-hidden="true"
                />
              </span>

              <input
                id="hero-search-input"
                type="text"
                className="flex-1 pl-12 pr-20 py-3.5 bg-transparent text-sm text-gray-900 placeholder-gray-400
                           focus:outline-none font-medium"
                placeholder="输入自然语言问题，向 MiQroForge Desktop / RAG 提问..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />

              {/* Keyboard shortcut hint */}
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
                           transition-all duration-150 shrink-0 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
                <span>提问</span>
              </button>
            </div>

            {/* Suggested questions */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                试试问：
              </span>
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q.text}
                  type="button"
                  onClick={() => handleQuickQuestion(q.text)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600
                             bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full
                             transition-all duration-150 hover:border-gray-300"
                >
                  <q.icon className="w-3 h-3 text-brand" aria-hidden="true" />
                  <span className="max-w-[200px] truncate">{q.text}</span>
                </button>
              ))}
            </div>
          </form>

          {/* Quick Stats Row */}
          <div className="mt-10 flex flex-wrap gap-4 sm:gap-6">
            {entriesLoading ? (
              <div className="flex gap-4 sm:gap-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-3 px-4 py-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200" />
                    <div>
                      <div className="h-5 w-12 bg-gray-200 rounded mb-1" />
                      <div className="h-3 w-16 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <StatBadge
                  icon={Layers}
                  value={stats.total}
                  label="知识条目"
                  color="navy"
                />
                <StatBadge
                  icon={BookOpen}
                  value={stats.papers}
                  label="学术论文"
                  color="coral"
                />
                <StatBadge
                  icon={Beaker}
                  value={stats.sandbox}
                  label="Sandbox 项目"
                  color="gold"
                />
                <StatBadge
                  icon={Ruler}
                  value={stats.dataStandards}
                  label="数据标准"
                  color="navy"
                />
                <StatBadge
                  icon={Clock}
                  value={stats.lastUpdated ? formatTimeAgo(stats.lastUpdated) : '—'}
                  label="最近更新"
                  color="coral"
                  isTime
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          QUICK WORKSPACE
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-cream/10"
        aria-label="快速工作区"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
              快速工作区
            </h2>
          </div>
          <p className="text-lg font-bold text-ink font-display mb-8">
            常用工作台入口
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKSPACE_CARDS.map((card) => {
              const count = card.type ? workspaceCounts[card.key as keyof typeof workspaceCounts] : undefined;
              return (
                <button
                  key={card.key}
                  onClick={() => navigate(card.route)}
                  className="group bg-white border border-gray-200 rounded-lg p-5 text-left
                             hover:border-ink/20 hover:shadow-md hover:-translate-y-0.5
                             focus:outline-none focus:ring-2 focus:ring-brand/30
                             transition-all duration-200"
                >
                  {/* Icon */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-ink/5 mb-3
                                  group-hover:bg-brand/10 transition-colors duration-200">
                    <card.icon className="w-5 h-5 text-ink group-hover:text-brand transition-colors duration-200" aria-hidden="true" />
                  </div>

                  {/* Title + Description */}
                  <h3 className="text-sm font-bold text-gray-900 mb-1 group-hover:text-ink transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">
                    {card.description}
                  </p>

                  {/* Count + Action */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    {count !== undefined ? (
                      <span className="text-[11px] font-semibold text-gray-400 font-mono">
                        {count} 个条目
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">—</span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-link
                                     group-hover:text-brand transition-colors duration-200">
                      {card.action}
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden="true" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          RECENTLY UPDATED
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-white"
        aria-label="最近更新"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
                  最近更新
                </h2>
              </div>
              <p className="text-lg font-bold text-ink font-display">
                最新知识动态
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
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 p-4 border border-gray-100 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-gray-200 rounded" />
                    <div className="h-3 w-64 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Clock className="w-10 h-10 mx-auto mb-3 text-gray-300" aria-hidden="true" />
              <p className="text-sm">暂无最近更新的知识条目</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-start gap-4 p-4 rounded-lg
                             hover:bg-gray-50/80 border border-transparent hover:border-gray-200
                             transition-all duration-150"
                >
                  {/* Type indicator dot + icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <EntryTypeIcon type={entry.entryType} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-link transition-colors">
                        {entry.title}
                      </h3>
                      <span className="shrink-0">
                        <EntryTypeBadge type={entry.entryType} />
                      </span>
                    </div>
                    {entry.summary && (
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-2">
                        {entry.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span className="font-medium text-gray-500">{entry.owner}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{formatTimeAgo(entry.latestUpdatedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{entry.visibility === 'public' ? '公开' : '内部'}</span>
                    </div>
                  </div>

                  {/* Open button */}
                  <button
                    onClick={() => navigate(`/entry/${entry.id}`)}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold
                               text-gray-400 hover:text-brand hover:bg-brand/5 rounded-md
                               transition-all duration-150 opacity-0 group-hover:opacity-100
                               focus:outline-none focus:ring-2 focus:ring-brand/30 focus:opacity-100"
                    aria-label={`打开 ${entry.title}`}
                  >
                    打开
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mobile "View all" */}
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
          BOOKMARKS
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-cream/10"
        aria-label="我的收藏"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-accent fill-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
              我的收藏
            </h2>
          </div>
          <p className="text-lg font-bold text-ink font-display mb-8">
            星标书签
          </p>

          {favsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse p-4 border border-gray-200 rounded-lg">
                  <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : favorites.length === 0 ? (
            /* Empty state */
            <div className="text-center py-12 max-w-sm mx-auto">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mx-auto mb-4">
                <Bookmark className="w-8 h-8 text-accent" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                收藏重要知识以便快速访问
              </h3>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                在知识条目详情页点击星标，即可将常用文档、项目或论文固定在此处。
              </p>
              <button
                onClick={() => navigate('/search')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-ink/90
                           text-white text-sm font-semibold rounded-md
                           border-2 border-transparent
                           focus:outline-none focus:ring-2 focus:ring-brand/40
                           transition-all duration-150"
              >
                浏览知识库
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            /* Bookmark list */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favorites.slice(0, 6).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => navigate(`/entry/${entry.id}`)}
                  className="group flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg
                             hover:border-ink/20 hover:shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-brand/30
                             transition-all duration-150 text-left"
                >
                  <Bookmark className="w-4 h-4 text-accent fill-accent shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate group-hover:text-link transition-colors">
                      {entry.title}
                    </h4>
                    {entry.summary && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {entry.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="shrink-0">
                        <EntryTypeBadge type={entry.entryType} />
                      </span>
                      <span className="text-[11px] text-gray-400">{formatTimeAgo(entry.latestUpdatedAt)}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand shrink-0 mt-1 transition-colors" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          KNOWLEDGE INSIGHTS
          ═══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-12 sm:py-16 bg-white"
        aria-label="平台动态"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-brand uppercase tracking-wider">
              平台动态
            </h2>
          </div>
          <p className="text-lg font-bold text-ink font-display mb-8">
            Knowledge Insights
          </p>

          {entriesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse p-5 border border-gray-100 rounded-lg">
                  <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <InsightTile
                  icon={Zap}
                  value={stats.newThisWeek}
                  label="本周新增条目"
                  color="coral"
                />
                <InsightTile
                  icon={BookOpen}
                  value={allEntries.filter((e) => {
                    const d = new Date(e.createdAt).getTime();
                    return d > Date.now() - 30 * 24 * 60 * 60 * 1000;
                  }).length}
                  label="本月上传"
                  color="navy"
                />
                <InsightTile
                  icon={Beaker}
                  value={allEntries.filter((e) =>
                    e.entryType === 'sandbox_project'
                  ).length}
                  label="活跃 Sandbox 项目"
                  color="gold"
                />
                <InsightTile
                  icon={Search}
                  value={allEntries.length}
                  label="可检索条目"
                  color="navy"
                />
              </div>

              {/* Trending searches */}
              <div className="bg-gray-50/80 border border-gray-100 rounded-lg p-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  热门搜索主题
                </h4>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_SEARCHES.map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSuggestedSearch(term)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                                 text-gray-600 bg-white border border-gray-200 rounded-full
                                 hover:border-brand/30 hover:text-brand
                                 transition-all duration-150"
                    >
                      <Search className="w-3 h-3" aria-hidden="true" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FOOTER NOTE
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="border-t border-gray-200 bg-gray-50/50" aria-label="页脚提示">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="font-semibold text-gray-500">💡 物理计算平台指引</span>
            {' · '}
            所有实验过程经由后台算子转化为标准 Markdown。
            如需发布新的 MCP 接口，请进入
            <button
              onClick={() => navigate('/admin/import')}
              className="text-link hover:underline mx-1 font-semibold"
            >
              知识导入
            </button>
            或联系 Xue Yue 进行权限提权。
          </p>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

/** A single stat badge for the hero row */
function StatBadge({
  icon: Icon,
  value,
  label,
  color,
  isTime,
}: {
  icon: React.FC<{ className?: string }>;
  value: string | number;
  label: string;
  color: 'navy' | 'coral' | 'gold';
  isTime?: boolean;
}) {
  const colorMap = {
    navy: { bg: 'bg-ink/5', text: 'text-ink', icon: 'text-ink/60' },
    coral: { bg: 'bg-brand/5', text: 'text-brand', icon: 'text-brand/60' },
    gold: { bg: 'bg-accent/10', text: 'text-ink', icon: 'text-accent' },
  };
  const c = colorMap[color];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg">
      <div className={`flex items-center justify-center w-9 h-9 rounded-full ${c.bg}`}>
        <Icon className={`w-4 h-4 ${c.icon}`} aria-hidden="true" />
      </div>
      <div>
        <p className={`text-lg font-bold font-mono leading-none ${c.text}`}>
          {value}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  );
}

/** Entry type icon shown in the recently updated list */
function EntryTypeIcon({ type }: { type: string }) {
  const iconMap: Record<string, React.FC<{ className?: string }>> = {
    sandbox_project: Beaker,
    academic_paper: BookOpen,
    data_standard: Ruler,
    template: ClipboardList,
    business_material: BarChart3,
    tech_doc: FileText,
    patent: Star,
    handwritten_note: FileText,
  };
  const Icon = iconMap[type] || Circle;
  const colorMap: Record<string, string> = {
    sandbox_project: 'text-amber-600 bg-amber-50',
    academic_paper: 'text-blue-600 bg-blue-50',
    data_standard: 'text-emerald-600 bg-emerald-50',
    template: 'text-purple-600 bg-purple-50',
    business_material: 'text-rose-600 bg-rose-50',
    tech_doc: 'text-indigo-600 bg-indigo-50',
    patent: 'text-yellow-600 bg-yellow-50',
    handwritten_note: 'text-gray-600 bg-gray-50',
  };
  const color = colorMap[type] || 'text-gray-400 bg-gray-50';

  return (
    <div className={`flex items-center justify-center w-9 h-9 rounded-full ${color}`}>
      <Icon className="w-4 h-4" aria-hidden="true" />
    </div>
  );
}

/** A single insight stat tile */
function InsightTile({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.FC<{ className?: string }>;
  value: number;
  label: string;
  color: 'navy' | 'coral' | 'gold';
}) {
  const colorMap = {
    navy: { bg: 'bg-ink/5', text: 'text-ink', bar: 'bg-ink' },
    coral: { bg: 'bg-brand/5', text: 'text-brand', bar: 'bg-brand' },
    gold: { bg: 'bg-accent/10', text: 'text-ink', bar: 'bg-accent' },
  };
  const c = colorMap[color];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors duration-150">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${c.bg}`}>
          <Icon className={`w-4 h-4 ${c.text}`} aria-hidden="true" />
        </div>
      </div>
      <p className={`text-2xl font-bold font-mono ${c.text}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      <div className={`h-0.5 ${c.bar}/20 rounded-full mt-3`}>
        <div className={`h-full ${c.bar}/40 rounded-full w-3/4`} />
      </div>
    </div>
  );
}
