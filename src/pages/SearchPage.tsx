import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchApi, SearchResult } from '../api/searchApi';
import { storage } from '../lib/storage';
import { Search, CornerDownRight, Filter, Calendar, Shield, ArrowRight, ExternalLink } from 'lucide-react';
import EntryTypeBadge from '../components/EntryTypeBadge';
import VisibilityBadge from '../components/VisibilityBadge';
import Pagination from '../components/Pagination';

export default function SearchPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters state
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  // Pagination from URL
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10));

  const updateUrlParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v && v !== 'all' && v !== '1' && v !== '10') next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  // Run search
  const executeSearch = async (currentQuery: string, currentType: string, currentPage: number, currentPageSize: number) => {
    setLoading(true);
    try {
      const data = await searchApi.search(currentQuery, currentType, 'nlp', currentPage, currentPageSize);
      setResults(data.results);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error during search:', err);
    } finally {
      setLoading(false);
    }
  };

  const doSearch = (newPage?: number, newPageSize?: number) => {
    const p = newPage ?? page;
    const ps = newPageSize ?? pageSize;
    updateUrlParams({ q: query, type: typeFilter, page: String(p), pageSize: ps !== 10 ? String(ps) : '' });
    executeSearch(query, typeFilter, p, ps);
  };

  // Initial load
  useEffect(() => {
    const storedQuery = storage.getSearchQuery() || storage.getQuickQuestion();
    let q = query;
    if (storedQuery) {
      q = storedQuery;
      setQuery(storedQuery);
      storage.removeSearchQuery();
      storage.removeQuickQuestion();
    }
    executeSearch(q, typeFilter, page, pageSize);
  }, [isLoggedIn]);

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(1);
  };

  const handleClearFilters = () => {
    setTypeFilter('all');
    setVisibilityFilter('all');
    setTimeFilter('all');
    setQuery('');
    setSearchParams({}, { replace: true });
    executeSearch('', 'all', 1, pageSize);
  };

  const handleTypeChange = (newType: string) => {
    setTypeFilter(newType);
    updateUrlParams({ type: newType, page: '' });
    executeSearch(query, newType, 1, pageSize);
  };

  const handlePageChange = (p: number) => doSearch(p);
  const handlePageSizeChange = (ps: number) => doSearch(1, ps);

  // Client-side filters (visibility + time)
  const filteredResults = results.filter((res) => {
    if (visibilityFilter !== 'all' && res.visibility !== visibilityFilter) return false;
    if (timeFilter !== 'all') {
      const resDate = new Date(res.updatedAt);
      const currentDate = new Date('2026-07-01');
      const diffDays = Math.ceil(Math.abs(currentDate.getTime() - resDate.getTime()) / (1000 * 60 * 60 * 24));
      if (timeFilter === '7days' && diffDays > 7) return false;
      if (timeFilter === '30days' && diffDays > 30) return false;
      if (timeFilter === '90days' && diffDays > 90) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" id="search-page-panel">
      
      {/* Search page title & context */}
      <div className="border-b border-gray-200 pb-4 select-none">
        <h1 className="text-2xl font-extrabold text-[#2B3150] font-sans">
          搜索企业知识 (Search Enterprise Knowledge)
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          检索范围涵盖纠错仿真项目过程、量子算法模型、学者引用文献、数据定义标准以及活性服务包。
        </p>
      </div>

      {/* Main Grid: Left sidebar (Filters), Right side (Search input + Results) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Filters Panel */}
        <div className="lg:col-span-3 space-y-6 select-none" id="search-filters-sidebar">
          
          <div className="flex items-center justify-between pb-2 border-b border-gray-200">
            <span className="text-xs font-extrabold text-gray-800 flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1 text-gray-500" />
              <span>筛选条件 (Filters)</span>
            </span>
            <button 
              onClick={handleClearFilters}
              className="text-[10px] text-blue-700 hover:underline font-bold"
            >
              重置
            </button>
          </div>

          {/* Type Filter */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-extrabold text-gray-900 uppercase tracking-wide">
              内容类型 (Content Type)
            </h4>
            <div className="space-y-1.5 text-xs text-gray-700">
              {[
                { value: 'all', label: '全部内容' },
              { value: 'sandbox_project', label: 'Sandbox项目' },
              { value: 'academic_paper', label: '学术论文' },
              { value: 'data_standard', label: '数据标准' },
              { value: 'template', label: '模板规范' },
              { value: 'business_material', label: '商业资料' },
                { value: 'patent', label: '专利成果' },
              { value: 'tech_doc', label: '技术文档' },
              { value: 'handwritten_note', label: '手写笔记' }
              ].map((opt) => (
                <label key={opt.value} className="flex items-center space-x-2 cursor-pointer py-0.5">
                  <input
                    type="radio"
                    name="typeFilter"
                    checked={typeFilter === opt.value}
                    onChange={() => handleTypeChange(opt.value)}
                    className="h-3.5 w-3.5 text-[#DB5F5B] focus:ring-[#DB5F5B]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Visibility Filter */}
          <div className="space-y-2 pt-2 border-t border-gray-150">
            <h4 className="text-[11px] font-extrabold text-gray-900 uppercase tracking-wide flex items-center">
              <Shield className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <span>可见范围 (Scope)</span>
            </h4>
            <div className="space-y-1.5 text-xs text-gray-700">
              {[
                { value: 'all', label: '全部范围' },
                { value: 'public', label: '公开 (Public)' },
                { value: 'internal', label: '内部 (Internal)' }
              ].map((opt) => (
                <label key={opt.value} className="flex items-center space-x-2 cursor-pointer py-0.5">
                  <input
                    type="radio"
                    name="visibilityFilter"
                    checked={visibilityFilter === opt.value}
                    onChange={() => setVisibilityFilter(opt.value)}
                    disabled={opt.value === 'internal' && !isLoggedIn}
                    className="h-3.5 w-3.5 text-[#DB5F5B] focus:ring-[#DB5F5B] disabled:opacity-50"
                  />
                  <span className={opt.value === 'internal' && !isLoggedIn ? 'text-gray-400' : ''}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Time Filter */}
          <div className="space-y-2 pt-2 border-t border-gray-150">
            <h4 className="text-[11px] font-extrabold text-gray-900 uppercase tracking-wide flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
              <span>更新时间 (Last Updated)</span>
            </h4>
            <div className="space-y-1.5 text-xs text-gray-700">
              {[
                { value: 'all', label: '全部时间' },
                { value: '7days', label: '最近 7 天' },
                { value: '30days', label: '最近 30 天' },
                { value: '90days', label: '最近 90 天' }
              ].map((opt) => (
                <label key={opt.value} className="flex items-center space-x-2 cursor-pointer py-0.5">
                  <input
                    type="radio"
                    name="timeFilter"
                    checked={timeFilter === opt.value}
                    onChange={() => setTimeFilter(opt.value)}
                    className="h-3.5 w-3.5 text-[#DB5F5B] focus:ring-[#DB5F5B]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Search Box & List of Results */}
        <div className="lg:col-span-9 space-y-5">
          
          {/* Plain Input Form */}
          <form onSubmit={handleSearchFormSubmit} className="flex select-none">
            <div className="relative flex-grow">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </span>
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border-2 border-gray-900 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B] text-xs font-sans placeholder-gray-400 font-medium"
                placeholder="搜索知识、项目、论文、数据条目或直接提问……"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-xs px-6 py-2 border-2 border-l-0 border-gray-900 transition-all shrink-0"
            >
              搜索
            </button>
          </form>

          {/* Results Summary Info */}
          <div className="flex items-center justify-between pb-1.5 border-b-2 border-gray-900 text-xs select-none">
            <span className="font-bold text-gray-800">
              {loading ? '正在对齐知识库语料...' : `检索结果：共 ${total} 条`}
            </span>
            <span className="text-[10px] text-gray-400 font-mono">
              {!isLoggedIn && '* 登录后可解锁机密(Internal)知识。'}
            </span>
          </div>

          {/* Results List */}
          {loading ? (
            <div className="py-16 space-y-3 max-w-sm mx-auto text-center">
              <div className="flex items-center justify-center space-x-2 text-[#DB5F5B] text-xs font-bold animate-pulse">
                <span className="animate-spin h-4 w-4 border-2 border-[#DB5F5B] border-t-transparent rounded-full" />
                <span>知识矩阵检索中 (Retrieval Grounding)...</span>
              </div>
              <div className="h-1 bg-gray-100 rounded animate-pulse" />
              <div className="h-1 bg-gray-100 rounded animate-pulse w-5/6 mx-auto" />
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-16 text-gray-400 italic bg-white border border-gray-200 p-6 rounded">
              未在库中找到与 “{query || '空关键字'}” 匹配的技术成果或实验日志。建议调整过滤条件或登录。
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredResults.map((res) => (
                <div key={res.id} className="py-4 space-y-2 font-sans first:pt-0">
                  
                  {/* Title Link */}
                  <div className="flex items-start justify-between gap-4">
                    <button
                      onClick={() => navigate(`/entry/${res.id}`)}
                      className="text-base font-bold text-[#1D70B8] hover:underline hover:text-blue-800 text-left leading-snug"
                    >
                      {res.title}
                    </button>
                    <div className="flex items-center space-x-1 shrink-0 mt-1 select-none">
                      <EntryTypeBadge type={res.type} />
                      <VisibilityBadge visibility={res.visibility} />
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {res.summary}
                  </p>

                  {/* Dynamic Match Reason */}
                  <div className="bg-[#F5F6E5]/45 border-l-2 border-[#DB5F5B] p-2 rounded-r text-[11px] text-gray-700 flex items-start select-none">
                    <CornerDownRight className="w-3.5 h-3.5 mr-1.5 text-[#DB5F5B] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#2B3150]">匹配原因：</span>
                      <span>{res.matchReason}</span>
                    </div>
                  </div>

                  {/* Reference indicator */}
                  {res.referenceSource && (
                    <div className="text-[10px] text-gray-400 flex items-center select-none font-mono">
                      <span className="font-bold text-gray-500 mr-1">引用来源:</span>
                      <span>{res.referenceSource}</span>
                    </div>
                  )}

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center justify-between text-[10px] text-gray-400 select-none pt-1">
                    <div className="flex items-center space-x-3">
                      <span>负责人：{res.owner}</span>
                      <span>•</span>
                      <span>更新时间：{res.updatedAt}</span>
                    </div>
                    
                    <button
                      onClick={() => navigate(`/entry/${res.id}`)}
                      className="text-[#1D70B8] hover:underline font-bold flex items-center text-[11px]"
                    >
                      <span>阅读条目全文</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
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
  )}
