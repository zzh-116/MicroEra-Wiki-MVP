import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchApi, SearchResult } from '../api/searchApi';
import { entriesApi } from '../api/entriesApi';
import { WikiEntry } from '../types/wiki';
import { storage } from '../lib/storage';
import {
  Search, Clock, TrendingUp, X, Filter, ChevronDown, ChevronRight,
  ArrowUpRight, Calendar, Shield, Sparkles, BookOpen, Beaker,
  Database, FileText, Briefcase, FileSignature, Key, HelpCircle,
  RotateCcw, Zap, ArrowRight, SlidersHorizontal
} from 'lucide-react';
import EntryTypeBadge from '../components/EntryTypeBadge';
import VisibilityBadge from '../components/VisibilityBadge';
import Pagination from '../components/Pagination';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'sandbox_project', label: 'Sandbox 项目' },
  { value: 'academic_paper', label: '学术论文' },
  { value: 'data_standard', label: '数据标准' },
  { value: 'template', label: '模板规范' },
  { value: 'business_material', label: '商业资料' },
  { value: 'patent', label: '专利成果' },
  { value: 'tech_doc', label: '技术文档' },
  { value: 'handwritten_note', label: '手写笔记' },
];

const TIME_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: '7days', label: '最近 7 天' },
  { value: '30days', label: '最近 30 天' },
  { value: '90days', label: '最近 90 天' },
];

const VISIBILITY_OPTIONS = [
  { value: 'all', label: '全部范围' },
  { value: 'public', label: '公开' },
  { value: 'internal', label: '内部' },
];

const SUGGESTED_SEARCHES = [
  '稳定子算法纠错结果',
  '量子计算 Monte Carlo',
  'Gottesman 纠错码',
  '材料结构 Schema',
  'Sandbox 项目过程',
  'RAG 服务接口',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(isoString: string): string {
  if (!isoString) return '';
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

/** Highlight matched keywords in text — wraps them in <mark> tags */
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const terms = query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (terms.length === 0) return text;

  const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="bg-accent/40 text-gray-900 font-semibold rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  );
  // Reset lastIndex after test
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Core state ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [allEntries, setAllEntries] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  // ── Search mode ────────────────────────────────────────────────────────────
  // nlp = 智能（动态意图，默认）; title = 按标题/文件名; keyword = 按内容
  const [searchMode, setSearchMode] = useState<'nlp' | 'keyword' | 'title'>('nlp');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchFocused, setSearchFocused] = useState(false);
  const [typeExpanded, setTypeExpanded] = useState(true);
  const [timeExpanded, setTimeExpanded] = useState(true);
  const [visibilityExpanded, setVisibilityExpanded] = useState(true);

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10));

  // ── Recent searches (from localStorage) ───────────────────────────────────
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('miqro_recent_searches') || '[]');
    } catch { return []; }
  });

  const saveRecentSearch = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('miqro_recent_searches', JSON.stringify(updated));
  };

  // ── URL params sync ──────────────────────────────────────────────────────
  const updateUrlParams = useCallback((updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v && v !== 'all' && v !== '1' && v !== '10') next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Execute search ───────────────────────────────────────────────────────
  const executeSearch = useCallback(async (
    currentQuery: string,
    currentType: string,
    currentVisibility: string,
    currentMode: 'nlp' | 'keyword' | 'title',
    currentPage: number,
    currentPageSize: number,
  ) => {
    setLoading(true);
    try {
      const data = await searchApi.search(
        currentQuery, currentType, currentMode, currentPage, currentPageSize, currentVisibility,
      );
      setResults(data.results);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const doSearch = useCallback((newPage?: number, newPageSize?: number) => {
    const p = newPage ?? page;
    const ps = newPageSize ?? pageSize;
    updateUrlParams({ q: query, type: typeFilter, page: String(p), pageSize: ps !== 10 ? String(ps) : '' });
    executeSearch(query, typeFilter, visibilityFilter, searchMode, p, ps);
    if (query.trim()) saveRecentSearch(query.trim());
  }, [query, typeFilter, visibilityFilter, searchMode, page, pageSize, updateUrlParams, executeSearch]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    const storedQuery = storage.getSearchQuery() || storage.getQuickQuestion();
    let q = query;
    if (storedQuery) {
      q = storedQuery;
      setQuery(storedQuery);
      storage.removeSearchQuery();
      storage.removeQuickQuestion();
    }
    executeSearch(q, typeFilter, visibilityFilter, searchMode, page, pageSize);
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the full visible knowledge base once so type-filter counts match the
  // actual totals instead of only counting the current search result page.
  useEffect(() => {
    let cancelled = false;
    entriesApi.getEntries()
      .then((list) => { if (!cancelled) setAllEntries(list); })
      .catch((err) => console.error('Error loading entry counts:', err));
    return () => { cancelled = true; };
  }, [isLoggedIn]);

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

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(1);
  };

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    updateUrlParams({ type: value, page: '' });
    executeSearch(query, value, visibilityFilter, searchMode, 1, pageSize);
  };

  const handleVisibilityChange = (value: string) => {
    setVisibilityFilter(value);
    executeSearch(query, typeFilter, value, searchMode, 1, pageSize);
  };

  const handleTimeChange = (value: string) => {
    setTimeFilter(value);
  };

  const handleModeChange = (mode: 'nlp' | 'keyword' | 'title') => {
    setSearchMode(mode);
    executeSearch(query, typeFilter, visibilityFilter, mode, 1, pageSize);
  };

  const handleClearFilters = () => {
    setTypeFilter('all');
    setVisibilityFilter('all');
    setTimeFilter('all');
    setQuery('');
    setSearchParams({}, { replace: true });
    executeSearch('', 'all', 'all', searchMode, 1, pageSize);
  };

  const handlePageChange = (p: number) => doSearch(p);
  const handlePageSizeChange = (ps: number) => doSearch(1, ps);

  const handleSuggestedSearch = (term: string) => {
    setQuery(term);
    updateUrlParams({ q: term, page: '' });
    executeSearch(term, typeFilter, visibilityFilter, searchMode, 1, pageSize);
    saveRecentSearch(term);
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
    updateUrlParams({ q: term, page: '' });
    executeSearch(term, typeFilter, visibilityFilter, searchMode, 1, pageSize);
  };

  const handleRemoveRecent = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter((s) => s !== term);
    setRecentSearches(updated);
    localStorage.setItem('miqro_recent_searches', JSON.stringify(updated));
  };

  // ── Client-side filtering ────────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    return results.filter((res) => {
      if (visibilityFilter !== 'all' && res.visibility !== visibilityFilter) return false;
      if (timeFilter !== 'all') {
        const resDate = new Date(res.updatedAt);
        const diffDays = Math.ceil(Math.abs(Date.now() - resDate.getTime()) / (1000 * 60 * 60 * 24));
        if (timeFilter === '7days' && diffDays > 7) return false;
        if (timeFilter === '30days' && diffDays > 30) return false;
        if (timeFilter === '90days' && diffDays > 90) return false;
      }
      return true;
    });
  }, [results, visibilityFilter, timeFilter]);

  // ── Active filters for chip display ──────────────────────────────────────
  const activeFilters = useMemo(() => {
    const filters: { key: string; label: string; onRemove: () => void }[] = [];
    if (typeFilter !== 'all') {
      const opt = TYPE_OPTIONS.find((o) => o.value === typeFilter);
      filters.push({ key: 'type', label: opt?.label || typeFilter, onRemove: () => handleTypeChange('all') });
    }
    if (visibilityFilter !== 'all') {
      const opt = VISIBILITY_OPTIONS.find((o) => o.value === visibilityFilter);
      filters.push({ key: 'vis', label: opt?.label || visibilityFilter, onRemove: () => handleVisibilityChange('all') });
    }
    if (timeFilter !== 'all') {
      const opt = TIME_OPTIONS.find((o) => o.value === timeFilter);
      filters.push({ key: 'time', label: opt?.label || timeFilter, onRemove: () => handleTimeChange('all') });
    }
    return filters;
  }, [typeFilter, visibilityFilter, timeFilter]);

  // ── Type counts for filter badges ────────────────────────────────────────
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allEntries.length };
    for (const opt of TYPE_OPTIONS) {
      if (opt.value === 'all') continue;
      counts[opt.value] = allEntries.filter((e) => e.entryType === opt.value).length;
    }
    return counts;
  }, [allEntries]);

  const hasSearched = total > 0 || loading || query || typeFilter !== 'all' || visibilityFilter !== 'all';
  const showHeroSuggestions = !hasSearched && !loading;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0" id="search-page-panel">
      {/* ═══════════════════════════════════════════════════════════════════════
          HERO SEARCH BAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white border-b border-gray-200" aria-label="搜索">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          {/* Title (shown when no active search) */}
          {!hasSearched && (
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-ink font-display tracking-tight">
                企业知识搜索
              </h1>
              <p className="mt-2 text-sm text-gray-500 max-w-lg mx-auto">
                AI 驱动的全库检索 — 论文、项目、数据、服务，秒级定位
              </p>
            </div>
          )}

          {/* Compact title when results are showing */}
          {hasSearched && (
            <div className="mb-4">
              <h1 className="text-lg font-bold text-ink font-display">
                搜索企业知识
              </h1>
            </div>
          )}

          {/* Search input */}
          <form onSubmit={handleSearchSubmit}>
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
                ref={searchInputRef}
                type="text"
                className="flex-1 pl-12 pr-24 py-3.5 bg-transparent text-sm text-gray-900 placeholder-gray-400
                           focus:outline-none font-medium"
                placeholder="搜索知识、项目、论文、数据条目或直接提问..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />

              {/* Keyboard shortcut + clear */}
              <span className="absolute right-[92px] flex items-center gap-2">
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="p-1 rounded hover:bg-gray-100 transition-colors"
                    aria-label="清除搜索"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                  </button>
                )}
                <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-gray-400 font-mono pointer-events-none">
                  <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-sans">
                    {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                  </kbd>
                  <span>+</span>
                  <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-sans">K</kbd>
                </span>
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
          </form>

          {/* Search mode selector */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <span className="text-[11px] text-gray-400 shrink-0">搜索模式：</span>
            <div className="inline-flex rounded-lg bg-gray-100 p-1">
              {([
                { value: 'nlp', label: '智能', icon: Sparkles },
                { value: 'title', label: '按标题/文件名', icon: FileText },
                { value: 'keyword', label: '按内容', icon: BookOpen },
              ] as const).map((m) => {
                const Icon = m.icon;
                const active = searchMode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleModeChange(m.value)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 ${
                      active
                        ? 'bg-white text-ink shadow-sm border border-gray-200'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${m.value === 'nlp' ? 'text-brand' : active ? 'text-ink' : 'text-gray-400'}`}
                      aria-hidden="true"
                    />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent & Suggested searches (only when no active search) */}
          {showHeroSuggestions && (
            <div className="mt-5 space-y-4">
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    最近搜索
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => handleRecentClick(term)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600
                                   bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full
                                   transition-all duration-150 group"
                      >
                        <Clock className="w-3 h-3 text-gray-400" aria-hidden="true" />
                        <span className="max-w-[160px] truncate">{term}</span>
                        <span
                          onClick={(e) => handleRemoveRecent(term, e)}
                          className="ml-0.5 p-0.5 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`删除 ${term}`}
                        >
                          <X className="w-2.5 h-2.5 text-gray-400" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested searches */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" aria-hidden="true" />
                  试试搜索
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_SEARCHES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleSuggestedSearch(term)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-link
                                 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-full
                                 transition-all duration-150"
                    >
                      <Search className="w-3 h-3" aria-hidden="true" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          RESULTS AREA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── Left: Filter Sidebar ──────────────────────────────────────── */}
          <aside className="lg:col-span-3 space-y-3 select-none" id="search-filters-sidebar">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
                筛选条件
              </span>
              {activeFilters.length > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="text-[10px] text-brand hover:underline font-semibold flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  重置
                </button>
              )}
            </div>

            {/* ── Type Filter ─────────────────────────────────────────────── */}
            <FilterGroup
              title="内容类型"
              expanded={typeExpanded}
              onToggle={() => setTypeExpanded(!typeExpanded)}
            >
              <div className="space-y-0.5">
                {TYPE_OPTIONS.map((opt) => (
                  <React.Fragment key={opt.value}>
                    <FilterChip
                      label={opt.label}
                      count={typeCounts[opt.value]}
                      active={typeFilter === opt.value}
                      onClick={() => handleTypeChange(opt.value)}
                    />
                  </React.Fragment>
                ))}
              </div>
            </FilterGroup>

            {/* ── Visibility Filter ────────────────────────────────────────── */}
            <FilterGroup
              title="可见范围"
              icon={<Shield className="w-3 h-3" />}
              expanded={visibilityExpanded}
              onToggle={() => setVisibilityExpanded(!visibilityExpanded)}
            >
              <div className="space-y-0.5">
                {VISIBILITY_OPTIONS.map((opt) => (
                  <React.Fragment key={opt.value}>
                    <FilterChip
                      label={opt.label}
                      active={visibilityFilter === opt.value}
                      disabled={opt.value === 'internal' && !isLoggedIn}
                      onClick={() => handleVisibilityChange(opt.value)}
                    />
                  </React.Fragment>
                ))}
              </div>
            </FilterGroup>

            {/* ── Time Filter ──────────────────────────────────────────────── */}
            <FilterGroup
              title="更新时间"
              icon={<Calendar className="w-3 h-3" />}
              expanded={timeExpanded}
              onToggle={() => setTimeExpanded(!timeExpanded)}
            >
              <div className="space-y-0.5">
                {TIME_OPTIONS.map((opt) => (
                  <React.Fragment key={opt.value}>
                    <FilterChip
                      label={opt.label}
                      active={timeFilter === opt.value}
                      onClick={() => handleTimeChange(opt.value)}
                    />
                  </React.Fragment>
                ))}
              </div>
            </FilterGroup>
          </aside>

          {/* ── Right: Results ────────────────────────────────────────────── */}
          <div className="lg:col-span-9 space-y-4">
            {/* Active filter chips */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100">
                <span className="text-[11px] font-semibold text-gray-400 shrink-0">当前筛选：</span>
                {activeFilters.map((f) => (
                  <span
                    key={f.key}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium
                               bg-ink/5 text-ink rounded-full"
                  >
                    {f.label}
                    <button onClick={f.onRemove} className="hover:text-brand transition-colors" aria-label={`取消 ${f.label} 筛选`}>
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={handleClearFilters}
                  className="text-[10px] text-gray-400 hover:text-brand transition-colors ml-1"
                >
                  清除全部
                </button>
              </div>
            )}

            {/* Results count */}
            {hasSearched && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      正在检索...
                    </span>
                  ) : (
                    <>
                      共 <span className="font-bold text-ink font-mono">{total}</span> 条结果
                      {filteredResults.length !== total && (
                        <span className="text-gray-400 ml-1">（筛选后 {filteredResults.length} 条）</span>
                      )}
                    </>
                  )}
                </span>
                {!isLoggedIn && (
                  <span className="text-[11px] text-gray-400">登录后可查看内部知识</span>
                )}
              </div>
            )}

            {/* ── Skeleton Loading ────────────────────────────────────────── */}
            {loading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="p-4 border border-gray-100 rounded-lg animate-pulse space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-48 bg-gray-200 rounded" />
                      <div className="h-4 w-20 bg-gray-100 rounded" />
                      <div className="h-4 w-16 bg-gray-100 rounded" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-full bg-gray-100 rounded" />
                      <div className="h-3.5 w-3/4 bg-gray-100 rounded" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-24 bg-gray-100 rounded" />
                      <div className="h-3 w-16 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Empty State ──────────────────────────────────────────────── */}
            {!loading && hasSearched && filteredResults.length === 0 && (
              <div className="text-center py-16">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-300" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  {query ? `未找到与 "${query}" 匹配的结果` : '未找到匹配的知识条目'}
                </h3>
                <p className="text-xs text-gray-400 mb-5 max-w-md mx-auto leading-relaxed">
                  建议调整筛选条件、使用不同的关键词，或登录后查看内部知识。
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleClearFilters}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-ink/90
                               text-white text-sm font-semibold rounded-md
                               border-2 border-transparent transition-all duration-150"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    清除筛选
                  </button>
                  <span className="text-xs text-gray-400">或试试：</span>
                  {SUGGESTED_SEARCHES.slice(0, 3).map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSuggestedSearch(term)}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs text-link
                                 bg-white border border-gray-200 rounded-full hover:border-link/30
                                 transition-all duration-150"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Result Cards ─────────────────────────────────────────────── */}
            {!loading && filteredResults.length > 0 && (
              <div className="space-y-2">
                {filteredResults.map((res) => (
                  <article
                    key={res.id}
                    className="group p-4 bg-white border border-gray-200 rounded-lg
                               hover:border-ink/20 hover:shadow-sm hover:-translate-y-0.5
                               focus-within:ring-2 focus-within:ring-brand/30
                               transition-all duration-150 cursor-pointer"
                    onClick={() => navigate(`/entry/${res.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/entry/${res.id}`); }}
                    role="link"
                    aria-label={`打开 ${res.title}`}
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-sm font-bold text-link group-hover:text-brand transition-colors leading-snug">
                        {res.title}
                      </h3>
                      <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ArrowUpRight className="w-4 h-4 text-brand" aria-hidden="true" />
                      </span>
                    </div>

                    {/* Summary with keyword highlighting */}
                    {res.summary && (
                      <p className="text-xs text-gray-600 leading-relaxed mb-3 line-clamp-2">
                        {highlightMatches(res.summary, query)}
                      </p>
                    )}

                    {/* Match reason snippet */}
                    {res.matchReason && (
                      <div className="text-[11px] text-gray-500 mb-3 flex items-start gap-1.5">
                        <Sparkles className="w-3 h-3 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          <span className="font-semibold text-gray-600">匹配：</span>
                          {highlightMatches(res.matchReason, query)}
                        </span>
                      </div>
                    )}

                    {/* Single-row metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      <EntryTypeBadge type={res.type} />
                      <span aria-hidden="true" className="text-gray-300">·</span>
                      <VisibilityBadge visibility={res.visibility} />
                      <span aria-hidden="true" className="text-gray-300">·</span>
                      {res.owner && (
                        <>
                          <span className="font-medium text-gray-500">{res.owner}</span>
                          <span aria-hidden="true" className="text-gray-300">·</span>
                        </>
                      )}
                      <span className="font-mono">{formatTimeAgo(res.updatedAt) || res.updatedAt}</span>

                      {/* Reference source */}
                      {res.referenceSource && (
                        <>
                          <span aria-hidden="true" className="text-gray-300">·</span>
                          <span className="text-gray-400 font-mono">来源：{res.referenceSource}</span>
                        </>
                      )}

                      {/* Quick open button */}
                      <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-link font-semibold
                                       opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        打开
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* ── Pagination ────────────────────────────────────────────────── */}
            {!loading && total > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

/** A single filter option as a clickable chip */
function FilterChip({
  label,
  count,
  active,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-all duration-150 text-left
        ${active
          ? 'bg-ink/5 text-ink font-semibold border border-ink/10'
          : 'text-gray-600 hover:bg-gray-50 border border-transparent'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-[10px] font-mono ${active ? 'text-ink/60' : 'text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/** Collapsible filter group */
function FilterGroup({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide hover:text-ink transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
        }
      </button>
      {expanded && <div className="pb-1">{children}</div>}
    </div>
  );
}
