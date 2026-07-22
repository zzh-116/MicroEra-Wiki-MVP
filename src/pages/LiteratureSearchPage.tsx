import React, { useState, useCallback } from 'react';
import { Search, BookOpen, Download, CheckCircle, AlertCircle, Loader2, ExternalLink, Globe, Atom, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { literatureApi, LiteraturePaper, LiteratureDocument } from '../api/literatureApi';

// ---- Types ----

interface PaperResult extends LiteraturePaper {
  _importing?: boolean;
  _imported?: boolean;
  _importError?: string;
  _entryId?: number;
}

interface ImportHistoryItem {
  id: string;
  title: string;
  source: string;
  entryId?: number;
  error?: string;
  timestamp: number;
}

// ---- Helpers ----

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

// ---- Component ----

export default function LiteratureSearchPage() {
  // Search state
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState<'all' | 'arxiv' | 'crossref'>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PaperResult[]>([]);
  const [searched, setSearched] = useState(false);

  // Detail preview state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDoc, setDetailDoc] = useState<LiteratureDocument | null>(null);

  // Import history
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);

  // ---- Search ----

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = keyword.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    setExpandedId(null);
    setDetailDoc(null);

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

      // Sort by year desc (newer first)
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

  // ---- Detail Preview ----

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
    } catch {
      setDetailDoc(null);
    } finally {
      setDetailLoading(false);
    }
  }, [expandedId]);

  // ---- Import ----

  const handleImport = useCallback(async (paper: PaperResult) => {
    const src = paper.metadata?.source || 'arxiv';
    const idx = results.findIndex((r) => r.id === paper.id);
    if (idx === -1) return;

    // Mark as importing
    setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, _importing: true, _importError: undefined } : r)));

    try {
      const res = await literatureApi.importPaper(src, paper.id);
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx
            ? { ...r, _importing: false, _imported: !res.error, _importError: res.error, _entryId: res.entryId }
            : r,
        ),
      );

      setImportHistory((prev) => [
        {
          id: paper.id,
          title: paper.title,
          source: src,
          entryId: res.entryId,
          error: res.error,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 19),
      ]);
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, _importing: false, _importError: err.message || 'import failed' } : r,
        ),
      );
    }
  }, [results]);

  // ---- Batch import ----

  const handleBatchImport = useCallback(async () => {
    const unimported = results.filter((r) => !r._imported && !r._importing);
    if (unimported.length === 0) return;

    const arxivIds = unimported.filter((r) => (r.metadata?.source || 'arxiv') === 'arxiv').map((r) => r.id);
    const crossrefDois = unimported.filter((r) => r.metadata?.source === 'crossref').map((r) => r.id);

    // Mark all as importing
    setResults((prev) =>
      prev.map((r) => (unimported.some((u) => u.id === r.id) ? { ...r, _importing: true, _importError: undefined } : r)),
    );

    try {
      if (arxivIds.length > 0) {
        await literatureApi.importPapers('arxiv', arxivIds);
      }
      if (crossrefDois.length > 0) {
        await literatureApi.importPapers('crossref', crossrefDois);
      }
      setResults((prev) =>
        prev.map((r) =>
          unimported.some((u) => u.id === r.id) ? { ...r, _importing: false, _imported: true } : r,
        ),
      );
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r) =>
          unimported.some((u) => u.id === r.id)
            ? { ...r, _importing: false, _importError: err.message }
            : r,
        ),
      );
    }
  }, [results]);

  const unimportedCount = results.filter((r) => !r._imported && !r._importing).length;
  const importedCount = results.filter((r) => r._imported).length;

  // ---- Render helpers ----

  const sourceBadge = (paper: LiteraturePaper) => {
    const src = paper.metadata?.source || 'crossref';
    const cfg = SOURCE_CONFIG[src] || SOURCE_CONFIG.crossref;
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${cfg.color}`}>
        {cfg.icon}
        <span className="ml-1">{cfg.label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6" id="literature-search-page">
      {/* Page Header */}
      <div className="border-b border-gray-200 pb-4 select-none">
        <h1 className="text-2xl font-extrabold text-[#2B3150] font-sans">
          文献检索与导入 (Literature Import)
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          搜索 arXiv 预印本和 CrossRef 学术文献，一键导入到企业知识库。覆盖 AI、物理、数学、生物等领域。
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: Source & Stats */}
        <div className="lg:col-span-3 space-y-5 select-none" id="lit-search-sidebar">
          {/* Source Selector */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-extrabold text-gray-900 uppercase tracking-wide">
              数据源 (Source)
            </h4>
            <div className="space-y-1.5 text-xs text-gray-700">
              {[
                { value: 'all', label: '全部来源', icon: <Search className="w-3.5 h-3.5" /> },
                { value: 'arxiv', label: 'arXiv 预印本', icon: <Atom className="w-3.5 h-3.5" /> },
                { value: 'crossref', label: 'CrossRef 学术文献', icon: <Globe className="w-3.5 h-3.5" /> },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center space-x-2 cursor-pointer py-1">
                  <input
                    type="radio"
                    name="sourceFilter"
                    checked={source === opt.value}
                    onChange={() => setSource(opt.value as typeof source)}
                    className="h-3.5 w-3.5 text-[#DB5F5B] focus:ring-[#DB5F5B]"
                  />
                  <span className="flex items-center space-x-1.5">
                    {opt.icon}
                    <span>{opt.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Results Summary (after search) */}
          {searched && !loading && (
            <div className="space-y-2 pt-3 border-t border-gray-200">
              <h4 className="text-[11px] font-extrabold text-gray-900 uppercase tracking-wide">
                检索统计
              </h4>
              <div className="text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>命中结果</span>
                  <span className="font-bold text-[#2B3150]">{results.length} 篇</span>
                </div>
                <div className="flex justify-between">
                  <span>已导入</span>
                  <span className="font-bold text-emerald-600">{importedCount} 篇</span>
                </div>
                <div className="flex justify-between">
                  <span>待导入</span>
                  <span className="font-bold text-[#DB5F5B]">{unimportedCount} 篇</span>
                </div>

                {importHistory.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-gray-150">
                    <h5 className="text-[10px] font-extrabold text-gray-500 uppercase mb-1.5">导入记录</h5>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {importHistory.map((h, i) => (
                        <div key={`${h.id}-${h.timestamp}`} className="text-[10px] flex items-start space-x-1">
                          {h.error ? (
                            <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                          <span className="text-gray-500 truncate">{h.title.slice(0, 40)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info Card */}
          <div className="bg-[#F5F6E5]/40 border border-gray-200 rounded p-3 text-[10px] text-gray-500 leading-relaxed">
            <p className="font-bold text-gray-700 mb-1">使用说明</p>
            <p>1. 输入关键词搜索文献</p>
            <p>2. 展开查看摘要与详情</p>
            <p>3. 点击"导入"加入知识库</p>
            <p className="mt-1">导入后将自动分块、嵌入，可在搜索页面检索。</p>
          </div>
        </div>

        {/* Right Main: Search + Results */}
        <div className="lg:col-span-9 space-y-5">
          {/* Search Input */}
          <form onSubmit={handleSearch} className="flex select-none">
            <div className="relative flex-grow">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <BookOpen className="h-4 w-4 text-gray-400" />
              </span>
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border-2 border-gray-900 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B] text-xs font-sans placeholder-gray-400 font-medium"
                placeholder="搜索论文标题、关键词、作者，如: attention is all you need..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-xs px-6 py-2 border-2 border-l-0 border-gray-900 transition-all shrink-0 disabled:opacity-60"
            >
              {loading ? '搜索中...' : '搜索文献'}
            </button>
          </form>

          {/* Batch Import Bar */}
          {unimportedCount > 0 && (
            <div className="flex items-center justify-between bg-[#F5F6E5]/60 border border-[#DB5F5B]/20 rounded px-4 py-2 text-xs select-none">
              <span className="text-gray-600">
                <span className="font-bold text-[#DB5F5B]">{unimportedCount}</span> 篇文献可导入
              </span>
              <button
                onClick={handleBatchImport}
                className="bg-[#DB5F5B] hover:bg-[#DB5F5B]/90 text-white font-bold px-4 py-1.5 rounded text-xs transition-all flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>一键全部导入</span>
              </button>
            </div>
          )}

          {/* Results Summary */}
          <div className="flex items-center justify-between pb-1.5 border-b-2 border-gray-900 text-xs select-none">
            <span className="font-bold text-gray-800">
              {loading
                ? '正在检索文献...'
                : searched
                  ? `检索结果：共 ${results.length} 篇`
                  : '输入关键词开始检索'}
            </span>
            {searched && !loading && (
              <span className="text-[10px] text-gray-400 font-mono">
                arXiv + CrossRef
              </span>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-16 space-y-3 max-w-sm mx-auto text-center">
              <div className="flex items-center justify-center space-x-2 text-[#DB5F5B] text-xs font-bold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>检索外部文献库中...</span>
              </div>
              <div className="h-1 bg-gray-100 rounded animate-pulse" />
              <div className="h-1 bg-gray-100 rounded animate-pulse w-5/6 mx-auto" />
            </div>
          )}

          {/* Empty State */}
          {!loading && searched && results.length === 0 && (
            <div className="text-center py-16 text-gray-400 italic bg-white border border-gray-200 p-6 rounded">
              未找到与 "{keyword}" 匹配的文献。请尝试其他关键词或切换数据源。
            </div>
          )}

          {/* Results List */}
          {!loading && results.length > 0 && (
            <div className="divide-y divide-gray-200">
              {results.map((paper) => (
                <div key={paper.id} className="py-4 space-y-2 font-sans first:pt-0">
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => handleToggleDetail(paper)}
                      className="text-base font-bold text-[#1D70B8] hover:underline hover:text-blue-800 text-left leading-snug flex items-start space-x-2"
                    >
                      {expandedId === paper.id ? (
                        <ChevronDown className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{paper.title}</span>
                    </button>

                    <div className="flex items-center space-x-2 shrink-0 mt-0.5">
                      {sourceBadge(paper)}
                      {/* Import Status */}
                      {paper._importing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : paper._imported ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleImport(paper); }}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#DB5F5B] text-white hover:bg-[#DB5F5B]/90 transition-all"
                        >
                          <Download className="w-3 h-3" />
                          <span>导入</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {paper.description}
                    {extractYear(paper) && (
                      <span className="text-gray-400 ml-1">({extractYear(paper)})</span>
                    )}
                  </p>

                  {/* Import Error */}
                  {paper._importError && (
                    <div className="bg-red-50 border-l-2 border-red-400 p-2 rounded-r text-[10px] text-red-600">
                      <AlertCircle className="w-3 h-3 inline mr-1" />
                      {paper._importError}
                    </div>
                  )}

                  {/* Import Success */}
                  {paper._imported && paper._entryId && (
                    <div className="bg-emerald-50 border-l-2 border-emerald-400 p-2 rounded-r text-[10px] text-emerald-700">
                      <CheckCircle className="w-3 h-3 inline mr-1" />
                      已导入知识库 (Entry #{paper._entryId})
                    </div>
                  )}

                  {/* Expanded Detail Preview */}
                  {expandedId === paper.id && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4 mt-2 space-y-3">
                      {detailLoading ? (
                        <div className="flex items-center space-x-2 text-xs text-gray-400 py-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>加载文献详情...</span>
                        </div>
                      ) : detailDoc ? (
                        <>
                          {/* Metadata */}
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                            {detailDoc.author && (
                              <div>
                                <span className="font-bold text-gray-500">作者：</span>
                                {detailDoc.author.slice(0, 120)}
                              </div>
                            )}
                            {detailDoc.metadata?.published && (
                              <div>
                                <span className="font-bold text-gray-500">发表：</span>
                                {String(detailDoc.metadata.published)}
                              </div>
                            )}
                            {detailDoc.metadata?.journal && (
                              <div>
                                <span className="font-bold text-gray-500">期刊：</span>
                                {String(detailDoc.metadata.journal)}
                              </div>
                            )}
                            {detailDoc.metadata?.primaryCategory && (
                              <div>
                                <span className="font-bold text-gray-500">分类：</span>
                                {String(detailDoc.metadata.primaryCategory)}
                              </div>
                            )}
                            {detailDoc.tags && detailDoc.tags.length > 0 && (
                              <div className="col-span-2 flex flex-wrap gap-1">
                                {detailDoc.tags.map((t) => (
                                  <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Abstract Preview */}
                          <div className="border-t border-gray-100 pt-3">
                            <h5 className="text-[11px] font-extrabold text-gray-700 mb-1">摘要预览</h5>
                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-6">
                              {detailDoc.content
                                ?.split('## 摘要')[1]
                                ?.split('## ')[0]
                                ?.trim()
                                || detailDoc.content?.slice(0, 500)
                                || '暂无摘要'}
                            </p>
                          </div>

                          {/* External Links */}
                          <div className="flex items-center space-x-3 text-[10px] pt-1">
                            {paper.metadata?.doi && (
                              <a
                                href={`https://doi.org/${paper.metadata.doi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-1 text-[#1D70B8] hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>DOI: {paper.metadata.doi}</span>
                              </a>
                            )}
                            {detailDoc.attachments?.[0]?.url && (
                              <a
                                href={detailDoc.attachments[0].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-1 text-[#1D70B8] hover:underline"
                              >
                                <FileText className="w-3 h-3" />
                                <span>查看 PDF</span>
                              </a>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400 py-2">无法加载文献详情，请重试。</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
