import React, { useState } from 'react';
import { Search, Sparkles, Filter, Database, BookOpen, Settings } from 'lucide-react';

interface SearchBoxProps {
  onSearch: (query: string, type: string, mode: 'keyword' | 'nlp' | 'title') => void;
  initialQuery?: string;
}

export default function SearchBox({ onSearch, initialQuery = '' }: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchMode, setSearchMode] = useState<'keyword' | 'nlp' | 'title'>('nlp'); // Default to AI-NLP!

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query, typeFilter, searchMode);
  };

  const handleQuickTagClick = (tag: string) => {
    setQuery(tag);
    onSearch(tag, typeFilter, searchMode);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm" id="search-box-panel">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Search input row */}
        <div className="relative">
          <input
            type="text"
            className="w-full pl-10 pr-24 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B]/30 focus:border-[#DB5F5B] text-xs font-sans transition-all shadow-inner"
            placeholder={
              searchMode === 'nlp'
                ? "输入自然语言提问（如：稳定子计算结果是什么？或 投资回报率是多少？）..."
                : "输入关键词、文件哈希、项目号等..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            id="search-main-input"
          />
          <div className="absolute left-3.5 top-3 text-gray-400">
            {searchMode === 'nlp' ? (
              <Sparkles className="w-4 h-4 text-[#DB5F5B] animate-pulse" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </div>
          
          <button
            type="submit"
            className="absolute right-2 top-1.5 px-4 py-1.5 bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-semibold rounded-md text-xs transition-all flex items-center space-x-1"
          >
            {searchMode === 'nlp' && <Sparkles className="w-3 h-3 text-[#F2D760]" />}
            <span>检索</span>
          </button>
        </div>

        {/* Filters and Config row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-gray-100 text-xs">
          {/* Mode Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-400 font-medium">搜索模式:</span>
            <div className="inline-flex rounded-md bg-gray-50 p-0.5 border border-gray-150">
              <button
                type="button"
                onClick={() => setSearchMode('nlp')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center space-x-1 transition-all ${
                  searchMode === 'nlp'
                    ? 'bg-[#2B3150] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Sparkles className="w-3 h-3 text-[#F2D760]" />
                <span>AI 自然语言问答</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('keyword')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  searchMode === 'keyword'
                    ? 'bg-[#2B3150] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>全文关键词</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('title')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  searchMode === 'title'
                    ? 'bg-[#2B3150] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>仅限标题</span>
              </button>
            </div>
          </div>

          {/* Type Filter */}
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              className="border border-gray-200 rounded px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-gray-600"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              id="search-type-filter"
            >
              <option value="all">全库类型过滤</option>
              <option value="project">Sandbox 项目</option>
              <option value="paper">前沿论文文献</option>
              <option value="data_item">研发数据结构</option>
              <option value="template">标准模板文件</option>
              <option value="service">活性知识服务</option>
            </select>
          </div>
        </div>
      </form>

      {/* Suggested / Hot searches */}
      <div className="mt-3 flex items-center space-x-2 text-[10px] text-gray-400 select-none">
        <span className="font-bold">热门检索:</span>
        <div className="flex flex-wrap gap-1.5">
          {['稳定子算法', 'SB-8849-QC', 'Gottesman', '计算结果数据结构', '复盘报告模板'].map((term) => (
            <button
              key={term}
              onClick={() => handleQuickTagClick(term)}
              className="bg-gray-50 hover:bg-[#F5F6E5] text-gray-600 border border-gray-150 rounded px-1.5 py-0.5 hover:text-[#DB5F5B] hover:border-[#DB5F5B]/30 transition-all"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
