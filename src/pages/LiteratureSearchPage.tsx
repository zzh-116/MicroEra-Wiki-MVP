import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Search, BookOpen, Download, CheckCircle, AlertCircle, Loader2,
  ExternalLink, Globe, Atom, ChevronDown, ChevronRight, FileText,
  Sparkles, TrendingUp, Clock, X, ArrowUpRight, Zap, Layers,
  Database, Cpu, Brain, ArrowRight, Bookmark, Users, Calendar
} from 'lucide-react';
import { literatureApi, LiteraturePaper, LiteratureDocument } from '../api/literatureApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaperResult extends LiteraturePaper {
  _importing?: boolean;
  _imported?: boolean;
  _importError?: string;
  _entryId?: number;
  _importStage?: string; // current import pipeline stage
}

interface ImportHistoryItem {
  id: string;
  title: string;
  source: string;
  entryId?: number;
  error?: string;
  timestamp: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CARDS = [
  {
    key: 'arxiv',
    name: 'arXiv',
    icon: Atom,
    description: '物理学、数学、计算机科学等领域的预印本论文',
    availability: '开放获取',
    speed: '< 2s',
    color: 'red' as const,
  },
  {
    key: 'crossref',
    name: 'CrossRef',
    icon: Globe,
    description: '跨出版商学术文献元数据，覆盖全学科',
    availability: '开放获取',
    speed: '< 3s',
    color: 'blue' as const,
  },
];

const TRENDING_TOPICS = [
  { label: 'Quantum Error Correction', icon: Cpu },
  { label: 'Stabilizer Codes', icon: Zap },
  { label: 'Hamiltonian Simulation', icon: Layers },
  { label: 'MOFs Synthesis', icon: Database },
  { label: 'Diffusion Models', icon: Brain },
  { label: 'Battery Materials', icon: Zap },
  { label: 'DFT Calculations', icon: Atom },
  { label: 'Machine Learning Potentials', icon: Sparkles },
];

const SUGGESTED_QUERIES = [
  'attention is all you need',
  'quantum error correction stabilizer',
  'metal organic framework synthesis',
  'density functional theory battery',
];

const IMPORT_STAGES = [
  { key: 'searching', label: '检索文献', icon: Search },
  { key: 'downloading', label: '下载元数据', icon: Download },
  { key: 'parsing', label: '解析内容', icon: FileText },
  { key: 'chunking', label: '智能分块', icon: Layers },
  { key: 'embedding', label: '向量嵌入', icon: Brain },
  { key: 'done', label: '入库完成', icon: CheckCircle },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  arxiv: { label: 'arXiv', icon: <Atom className="w-4 h-4" />, color: 'bg-red-50 text-red-700 border-red-200' },
  crossref: { label: 'CrossRef', icon: <Globe className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
};

function extractYear(paper: LiteraturePaper): string {
  if (paper.metadata?.year) return String(paper.metadata.year);
  if (paper.updatedAt) {
    const m = paper.updatedAt.match(/^(\d{4})/);
    if (m) return m[1];
  }
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiteratureSearchPage() {
  // ── Search state ──────────────────────────────────────────────────────────
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState<'all' | 'arxiv' | 'crossref'>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PaperResult[]>([]);
  const [searched, setSearched] = useState(false);

  // ── Detail state ──────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDoc, setDetailDoc] = useState<LiteratureDocument | null>(null);

  // ── Import state ──────────────────────────────────────────────────────────
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [reviewPaper, setReviewPaper] = useState<PaperResult | null>(null);
  const [reviewVisibility, setReviewVisibility] = useState<'public' | 'internal'>('internal');
  const [reviewSpace, setReviewSpace] = useState('s-papers');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importStage, setImportStage] = useState(0);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('miqro_lit_searches') || '[]'); }
    catch { return []; }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcut ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const saveRecentSearch = (q: string) => {
    const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('miqro_lit_searches', JSON.stringify(updated));
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (e?: React.FormEvent, searchKeyword?: string) => {
    e?.preventDefault();
    const q = (searchKeyword || keyword).trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    setExpandedId(null);
    setDetailDoc(null);
    if (!searchKeyword) saveRecentSearch(q);

    const sources = source === 'all' ? ['arxiv', 'crossref'] : [source];

    try {
      const allResults = await Promise.allSettled(
        sources.map((s) => literatureApi.search(s, q)),
      );

      const merged: PaperResult[] = [];
      for (const r of allResults) {
        if (r.status === 'fulfilled') {
          merged.push(...r.value.papers.map((p) => ({ ...p, _imported: false })));
        }
      }

      merged.sort((a, b) => {
        const ya = parseInt(extractYear(a)) || 0;
        const yb = parseInt(extractYear(b)) || 0;
        return yb - ya;
      });

      setResults(merged);
    } catch (err) {
      console.error('[LiteratureSearch] search error:', err);
    } finally {
      setLoading(false);
    }
  }, [keyword, source]);

  // ── Detail ────────────────────────────────────────────────────────────────
  const handleToggleDetail = useCallback(async (paper: PaperResult) => {
    if (expandedId === paper.id) {
      setExpandedId(null);
      setDetailDoc(null);
      return;
    }
    setExpandedId(paper.id);
    setDetailLoading(true);
    setDetailDoc(null);
    const src = paper.metadata?.source || 'arxiv';
    try {
      const doc = await literatureApi.detail(src, paper.id);
      setDetailDoc(doc);
    } catch { setDetailDoc(null); }
    finally { setDetailLoading(false); }
  }, [expandedId]);

  // ── Import review ─────────────────────────────────────────────────────────
  const handleOpenReview = (paper: PaperResult) => {
    setReviewPaper(paper);
    setReviewVisibility('internal');
    setReviewSpace('s-papers');
  };

  const handleConfirmImport = useCallback(async () => {
    if (!reviewPaper) return;
    const paper = reviewPaper;
    setReviewPaper(null);
    setImportingId(paper.id);
    setImportStage(0);

    // Animate through import stages
    const stageInterval = setInterval(() => {
      setImportStage((prev) => {
        if (prev >= IMPORT_STAGES.length - 2) {
          clearInterval(stageInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 400);

    const src = paper.metadata?.source || 'arxiv';
    const idx = results.findIndex((r) => r.id === paper.id);

    setResults((prev) => prev.map((r, i) =>
      i === idx ? { ...r, _importing: true, _importError: undefined, _importStage: 'searching' } : r,
    ));

    try {
      const res = await literatureApi.importPaper(src, paper.id);
      clearInterval(stageInterval);
      setImportStage(IMPORT_STAGES.length - 1);

      setTimeout(() => {
        setImportingId(null);
        setImportStage(0);
      }, 800);

      setResults((prev) =>
        prev.map((r, i) =>
          i === idx
            ? { ...r, _importing: false, _imported: !res.error, _importError: res.error, _entryId: res.entryId }
            : r,
        ),
      );

      setImportHistory((prev) => [{
        id: paper.id, title: paper.title, source: src,
        entryId: res.entryId, error: res.error, timestamp: Date.now(),
      }, ...prev.slice(0, 19)]);
    } catch (err: any) {
      clearInterval(stageInterval);
      setImportingId(null);
      setImportStage(0);
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, _importing: false, _importError: err.message || 'import failed' } : r,
        ),
      );
    }
  }, [reviewPaper, results]);

  // ── Batch import ──────────────────────────────────────────────────────────
  const handleBatchImport = useCallback(async () => {
    const unimported = results.filter((r) => !r._imported && !r._importing);
    if (unimported.length === 0) return;
    const arxivIds = unimported.filter((r) => (r.metadata?.source || 'arxiv') === 'arxiv').map((r) => r.id);
    const crossrefDois = unimported.filter((r) => r.metadata?.source === 'crossref').map((r) => r.id);

    setResults((prev) =>
      prev.map((r) => (unimported.some((u) => u.id === r.id) ? { ...r, _importing: true, _importError: undefined } : r)),
    );

    try {
      if (arxivIds.length > 0) await literatureApi.importPapers('arxiv', arxivIds);
      if (crossrefDois.length > 0) await literatureApi.importPapers('crossref', crossrefDois);
      setResults((prev) =>
        prev.map((r) => unimported.some((u) => u.id === r.id) ? { ...r, _importing: false, _imported: true } : r),
      );
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r) =>
          unimported.some((u) => u.id === r.id) ? { ...r, _importing: false, _importError: err.message } : r,
        ),
      );
    }
  }, [results]);

  const unimportedCount = results.filter((r) => !r._imported && !r._importing).length;
  const importedCount = results.filter((r) => r._imported).length;

  // ── Derived: show discovery state only before any search ──────────────────
  const showDiscovery = !searched && !loading;

  // ── Source badge helper ───────────────────────────────────────────────────
  const sourceBadge = (paper: LiteraturePaper) => {
    const src = paper.metadata?.source || 'crossref';
    const cfg = SOURCE_CONFIG[src] || SOURCE_CONFIG.crossref;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.color}`}>
        {cfg.icon}
        <span className="ml-1">{cfg.label}</span>
      </span>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0" id="literature-search-page">
      {/* ═══════════════════════════════════════════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white border-b border-gray-200" aria-label="文献检索">
        <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
          {/* Title */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10">
                <BookOpen className="w-4 h-4 text-brand" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-brand uppercase tracking-wider">
                AI-Powered Discovery
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink font-display tracking-tight">
              文献检索与导入
            </h1>
            <p className="mt-2 text-sm text-gray-500 max-w-lg mx-auto">
              搜索 arXiv 预印本与 CrossRef 学术文献，AI 辅助筛选，一键导入企业知识库
            </p>
          </div>

          {/* Search box */}
          <form onSubmit={(e) => handleSearch(e)}>
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
                <BookOpen className={`w-5 h-5 transition-colors duration-200 ${searchFocused ? 'text-brand' : 'text-gray-400'}`} aria-hidden="true" />
              </span>

              <input
                ref={searchInputRef}
                type="text"
                className="flex-1 pl-12 pr-24 py-3.5 bg-transparent text-sm text-gray-900 placeholder-gray-400
                           focus:outline-none font-medium"
                placeholder="搜索论文标题、关键词、作者，如 attention is all you need..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />

              <span className="absolute right-[98px] hidden sm:flex items-center gap-0.5 text-[10px] text-gray-400 font-mono pointer-events-none">
                <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-sans">⌘</kbd>
                <span>+</span>
                <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-sans">K</kbd>
              </span>

              <button
                type="submit"
                disabled={loading}
                className="m-1.5 px-5 py-2 bg-ink hover:bg-ink/90 text-white text-sm font-semibold
                           rounded-md border-2 border-transparent
                           focus:outline-none focus:ring-2 focus:ring-brand/40
                           transition-all duration-150 shrink-0 disabled:opacity-60"
              >
                {loading ? '搜索中...' : '搜索文献'}
              </button>
            </div>
          </form>

          {/* Suggested + Recent */}
          <div className="mt-4 space-y-3">
            {/* Suggested queries */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-400 shrink-0">试试：</span>
              {SUGGESTED_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setKeyword(q); handleSearch(undefined, q); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-500
                             bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full
                             transition-all duration-150"
                >
                  <Search className="w-3 h-3" aria-hidden="true" />
                  <span className="max-w-[200px] truncate">{q}</span>
                </button>
              ))}
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-400 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  最近：
                </span>
                {recentSearches.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setKeyword(q); handleSearch(undefined, q); }}
                    className="text-[11px] text-gray-500 hover:text-brand transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source cards */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SOURCE_CARDS.map((src) => {
              const active = source === src.key || source === 'all';
              return (
                <button
                  key={src.key}
                  onClick={() => setSource(source === src.key ? 'all' : src.key as typeof source)}
                  className={`
                    flex items-start gap-3 p-3.5 rounded-lg border-2 text-left transition-all duration-150
                    ${active
                      ? src.color === 'red'
                        ? 'border-red-200 bg-red-50/30'
                        : 'border-blue-200 bg-blue-50/30'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                    }
                  `}
                >
                  <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                    src.color === 'red' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    <src.icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{src.name}</span>
                      <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{src.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                      <span>{src.availability}</span>
                      <span aria-hidden="true">·</span>
                      <span>响应 {src.speed}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          CONTENT AREA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── Left Sidebar ───────────────────────────────────────────────── */}
          <aside className="lg:col-span-3 space-y-4">
            {/* Search stats (after search) */}
            {searched && !loading && (
              <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">检索统计</h3>
                <div className="space-y-2 text-xs">
                  <StatRow label="命中结果" value={`${results.length} 篇`} />
                  <StatRow label="已导入" value={`${importedCount} 篇`} color="emerald" />
                  <StatRow label="待导入" value={`${unimportedCount} 篇`} color="coral" />
                </div>

                {/* Batch import */}
                {unimportedCount > 0 && (
                  <button
                    onClick={handleBatchImport}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2
                               bg-brand hover:bg-brand/90 text-white text-xs font-semibold
                               rounded-md transition-all duration-150"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    一键全部导入
                  </button>
                )}

                {/* Import history */}
                {importHistory.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">导入记录</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {importHistory.slice(0, 10).map((h) => (
                        <div key={`${h.id}-${h.timestamp}`} className="flex items-start gap-1.5 text-[10px]">
                          {h.error
                            ? <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                            : <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                          }
                          <span className="text-gray-500 truncate">{h.title.slice(0, 35)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Info card (before search) */}
            {!searched && (
              <div className="bg-cream/30 border border-gray-100 rounded-lg p-4 space-y-2 text-xs text-gray-500">
                <p className="font-semibold text-gray-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                  使用说明
                </p>
                <ol className="space-y-1 list-decimal list-inside text-[11px]">
                  <li>输入关键词或论文标题搜索</li>
                  <li>展开卡片查看摘要与详情</li>
                  <li>点击"导入"选择配置后加入知识库</li>
                  <li>导入后将自动分块、嵌入，可在搜索页检索</li>
                </ol>
              </div>
            )}
          </aside>

          {/* ── Main Content ────────────────────────────────────────────────── */}
          <div className="lg:col-span-9 space-y-4">
            {/* Result header */}
            {searched && (
              <div className="flex items-center justify-between pb-2 border-b border-gray-200 text-xs">
                <span className="font-semibold text-gray-700">
                  {loading
                    ? '正在检索文献...'
                    : `检索结果：共 ${results.length} 篇`
                  }
                </span>
                <span className="text-[10px] text-gray-400 font-mono">arXiv + CrossRef</span>
              </div>
            )}

            {/* ── Discovery State ──────────────────────────────────────────── */}
            {showDiscovery && (
              <div className="space-y-6 pt-2">
                {/* Trending topics */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-brand" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-ink font-display">热门研究方向</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TRENDING_TOPICS.map((topic) => (
                      <button
                        key={topic.label}
                        onClick={() => { setKeyword(topic.label); handleSearch(undefined, topic.label); }}
                        className="group flex items-center gap-2.5 p-3 bg-white border border-gray-200 rounded-lg
                                   hover:border-ink/20 hover:shadow-sm hover:-translate-y-0.5
                                   transition-all duration-150 text-left"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50
                                        group-hover:bg-brand/10 transition-colors">
                          <topic.icon className="w-4 h-4 text-gray-400 group-hover:text-brand transition-colors" aria-hidden="true" />
                        </div>
                        <span className="text-xs font-medium text-gray-700 group-hover:text-ink transition-colors leading-tight">
                          {topic.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Quick start examples */}
                <section className="bg-cream/10 border border-gray-100 rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-ink font-display">快速开始</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    输入论文标题、DOI、作者名或关键词，系统将同时检索 arXiv 和 CrossRef 数据库。
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {['quantum computing', 'machine learning', 'materials science', 'error correction', 'neural networks'].map((t) => (
                      <button
                        key={t}
                        onClick={() => { setKeyword(t); handleSearch(undefined, t); }}
                        className="px-3 py-1.5 text-[11px] text-link bg-white border border-gray-200
                                   rounded-full hover:border-link/30 hover:bg-blue-50/50 transition-all"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* ── Loading State ────────────────────────────────────────────── */}
            {loading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="p-4 border border-gray-100 rounded-lg animate-pulse space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-5 w-5 bg-gray-200 rounded shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-gray-200 rounded" />
                        <div className="h-3 w-1/2 bg-gray-100 rounded" />
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-8">
                      <div className="h-3 w-full bg-gray-100 rounded" />
                      <div className="h-3 w-2/3 bg-gray-100 rounded" />
                    </div>
                    <div className="flex items-center gap-2 pl-8">
                      <div className="h-5 w-16 bg-gray-100 rounded-full" />
                      <div className="h-5 w-14 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Empty State ──────────────────────────────────────────────── */}
            {!loading && searched && results.length === 0 && (
              <div className="text-center py-16">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-300" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  未找到与 "{keyword}" 匹配的文献
                </h3>
                <p className="text-xs text-gray-400 mb-5 max-w-md mx-auto">
                  建议尝试不同的关键词、使用英文搜索，或切换数据源后重试。
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => { setKeyword(''); setSearched(false); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink text-white text-sm font-semibold rounded-md
                               hover:bg-ink/90 transition-all duration-150"
                  >
                    返回发现页
                  </button>
                  <span className="text-xs text-gray-400 flex items-center">或试试：</span>
                  {SUGGESTED_QUERIES.slice(0, 2).map((q) => (
                    <button
                      key={q}
                      onClick={() => { setKeyword(q); handleSearch(undefined, q); }}
                      className="px-3 py-1.5 text-xs text-link bg-white border border-gray-200 rounded-full
                                 hover:border-link/30 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Paper Result Cards ────────────────────────────────────────── */}
            {!loading && results.length > 0 && (
              <div className="space-y-2">
                {results.map((paper) => {
                  const isExpanded = expandedId === paper.id;
                  const isThisImporting = importingId === paper.id || paper._importing;
                  return (
                    <article
                      key={paper.id}
                      className={`
                        bg-white border rounded-lg transition-all duration-150
                        ${isExpanded
                          ? 'border-ink/20 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }
                      `}
                    >
                      {/* Card header */}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Expand toggle */}
                          <button
                            onClick={() => handleToggleDetail(paper)}
                            className="shrink-0 mt-0.5 text-gray-400 hover:text-brand transition-colors"
                            aria-label={isExpanded ? '收起详情' : '展开详情'}
                          >
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />
                            }
                          </button>

                          <div className="flex-1 min-w-0">
                            {/* Title */}
                            <button
                              onClick={() => handleToggleDetail(paper)}
                              className="text-sm font-bold text-link hover:text-brand transition-colors
                                         text-left leading-snug"
                            >
                              {paper.title}
                            </button>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              {sourceBadge(paper)}
                              {extractYear(paper) && (
                                <span className="text-[11px] text-gray-400 font-mono">{extractYear(paper)}</span>
                              )}
                              {paper.metadata?.journal && (
                                <span className="text-[11px] text-gray-400 truncate max-w-[200px]">
                                  {String(paper.metadata.journal)}
                                </span>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-xs text-gray-500 leading-relaxed mt-1.5 line-clamp-2">
                              {paper.description}
                            </p>

                            {/* Action bar */}
                            <div className="flex items-center gap-2 mt-3">
                              {/* Preview button */}
                              <button
                                onClick={() => handleToggleDetail(paper)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600
                                           bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-all"
                              >
                                <FileText className="w-3 h-3" aria-hidden="true" />
                                {isExpanded ? '收起' : '预览'}
                              </button>

                              {/* Import button / status */}
                              {paper._imported ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold
                                               text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
                                  <CheckCircle className="w-3 h-3" aria-hidden="true" />
                                  已导入
                                </span>
                              ) : isThisImporting ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold
                                               text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md">
                                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                  导入中...
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleOpenReview(paper); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold
                                             text-white bg-brand hover:bg-brand/90 rounded-md transition-all"
                                >
                                  <Download className="w-3 h-3" aria-hidden="true" />
                                  导入
                                </button>
                              )}
                            </div>

                            {/* Import error */}
                            {paper._importError && (
                              <div className="mt-2 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 text-[11px] text-red-600 flex items-start gap-1.5">
                                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
                                {paper._importError}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/50 rounded-b-lg">
                          {detailLoading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              加载文献详情...
                            </div>
                          ) : detailDoc ? (
                            <div className="space-y-4">
                              {/* Metadata grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                {detailDoc.author && <MetaItem label="作者" value={detailDoc.author.slice(0, 150)} />}
                                {detailDoc.metadata?.published && <MetaItem label="发表" value={String(detailDoc.metadata.published)} />}
                                {detailDoc.metadata?.journal && <MetaItem label="期刊" value={String(detailDoc.metadata.journal)} />}
                                {detailDoc.metadata?.primaryCategory && <MetaItem label="分类" value={String(detailDoc.metadata.primaryCategory)} />}
                              </div>

                              {/* Tags */}
                              {detailDoc.tags && detailDoc.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {detailDoc.tags.map((t) => (
                                    <span key={t} className="px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded-full">{t}</span>
                                  ))}
                                </div>
                              )}

                              {/* Abstract */}
                              <div>
                                <h5 className="text-[11px] font-semibold text-gray-700 mb-1.5">摘要</h5>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                  {detailDoc.content
                                    ?.split('## 摘要')[1]
                                    ?.split('## ')[0]
                                    ?.trim()
                                    || detailDoc.content?.slice(0, 500)
                                    || '暂无摘要'}
                                </p>
                              </div>

                              {/* External links */}
                              <div className="flex items-center gap-3 text-[11px] pt-1">
                                {paper.metadata?.doi && (
                                  <a href={`https://doi.org/${paper.metadata.doi}`} target="_blank" rel="noopener noreferrer"
                                     className="inline-flex items-center gap-1 text-link hover:underline">
                                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                    DOI: {paper.metadata.doi}
                                  </a>
                                )}
                                {detailDoc.attachments?.[0]?.url && (
                                  <a href={detailDoc.attachments[0].url} target="_blank" rel="noopener noreferrer"
                                     className="inline-flex items-center gap-1 text-link hover:underline">
                                    <FileText className="w-3 h-3" aria-hidden="true" />
                                    查看 PDF
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 py-4">无法加载文献详情，请重试。</p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          IMPORT REVIEW MODAL
          ═══════════════════════════════════════════════════════════════════════ */}
      {reviewPaper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setReviewPaper(null)} aria-hidden="true" />

          {/* Modal */}
          <div className="relative bg-white border border-gray-200 rounded-xl max-w-md w-full p-5 shadow-2xl animate-fade-in space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink font-display">确认导入</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">预览元数据并选择导入配置</p>
              </div>
              <button onClick={() => setReviewPaper(null)} className="p-1 rounded hover:bg-gray-100 transition-colors" aria-label="关闭">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Paper info */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-900 leading-snug">{reviewPaper.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                {sourceBadge(reviewPaper)}
                {extractYear(reviewPaper) && <span>{extractYear(reviewPaper)}</span>}
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block">可见性</label>
              <div className="flex gap-2">
                {[
                  { value: 'internal' as const, label: '内部', desc: '仅研发可见' },
                  { value: 'public' as const, label: '公开', desc: '外部可见' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setReviewVisibility(opt.value)}
                    className={`flex-1 px-3 py-2 rounded-md border-2 text-xs font-medium transition-all ${
                      reviewVisibility === opt.value
                        ? 'border-ink bg-ink/5 text-ink'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <span className="block">{opt.label}</span>
                    <span className="text-[10px] text-gray-400">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target space */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block">目标空间</label>
              <select
                value={reviewSpace}
                onChange={(e) => setReviewSpace(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-md px-3 py-2 text-xs font-medium bg-white
                           focus:outline-none focus:border-ink focus:ring-2 focus:ring-brand/20"
              >
                <option value="s-papers">学术论文</option>
                <option value="s-sandbox">Sandbox 项目</option>
                <option value="s-data">数据标准</option>
                <option value="s-business">商业资料</option>
                <option value="s-template">模板规范</option>
              </select>
            </div>

            {/* Import progress animation (when importing) */}
            {importingId === reviewPaper.id && (
              <div className="space-y-2 py-2">
                <p className="text-[11px] font-semibold text-gray-600">导入进度</p>
                <div className="space-y-1">
                  {IMPORT_STAGES.map((stage, i) => {
                    const done = i < importStage;
                    const active = i === importStage;
                    return (
                      <div key={stage.key} className="flex items-center gap-2.5 text-xs">
                        <span className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                          done ? 'bg-emerald-100 text-emerald-600' : active ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-300'
                        }`}>
                          {done ? <CheckCircle className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : <stage.icon className="w-3 h-3" />}
                        </span>
                        <span className={`${done ? 'text-emerald-700 font-medium' : active ? 'text-yellow-700 font-medium' : 'text-gray-400'}`}>
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setReviewPaper(null)}
                className="flex-1 px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200
                           rounded-md transition-all"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importingId === reviewPaper.id}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold
                           text-white bg-ink hover:bg-ink/90 rounded-md
                           transition-all disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tiny helpers
// ═══════════════════════════════════════════════════════════════════════════════

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'emerald' ? 'text-emerald-600' : color === 'coral' ? 'text-brand' : 'text-ink';
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-gray-500">{label}：</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}
