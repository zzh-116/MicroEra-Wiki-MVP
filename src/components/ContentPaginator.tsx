// ContentPaginator — paginated content reader with page navigation, progress bar,
// URL sync, and TOC integration. Renders ContentBlock[] pages, never raw Markdown.

import { Fragment, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ContentBlock } from '../utils/contentParser';
import { paginateContent, findPageByHeading } from '../utils/contentPaginator';
import type { Page } from '../utils/contentPaginator';
import { findKeywordLinks, type KeywordIndex } from '../utils/keywordLinker';

// Internal BlockRenderer (same as ContentRenderer but standalone here for self-containment)
function renderInline(text: string, keywordIndex?: KeywordIndex, currentEntryId?: string) {
  if (!keywordIndex || keywordIndex.maxLen === 0) return text;
  const parts = findKeywordLinks(text, keywordIndex, currentEntryId);
  return parts.map((part, i) =>
    part.type === 'link' ? (
      <Link
        key={i}
        to={`/entry/${part.entryId}`}
        title={part.title}
        className="text-[#1D70B8] hover:text-[#DB5F5B] hover:underline font-medium"
      >
        {part.title}
      </Link>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    ),
  );
}

function PageBlockRenderer({
  block,
  keywordIndex,
  currentEntryId,
}: {
  block: ContentBlock;
  keywordIndex?: KeywordIndex;
  currentEntryId?: string;
}) {
  switch (block.type) {
    case 'heading': {
      if (block.level <= 1) return <h2 id={`h-${block.text.slice(0, 20)}`} className="text-xl font-bold text-gray-900 font-display mt-10 mb-3 leading-snug">{block.text}</h2>;
      if (block.level === 2) return <h3 id={`h-${block.text.slice(0, 20)}`} className="text-base font-semibold text-gray-800 mt-8 mb-2 leading-snug">{block.text}</h3>;
      return <h4 id={`h-${block.text.slice(0, 20)}`} className="text-sm font-semibold text-gray-700 mt-6 mb-1.5 leading-snug">{block.text}</h4>;
    }
    case 'paragraph': return <p className="my-3 text-sm text-gray-700 leading-relaxed">{renderInline(block.text, keywordIndex, currentEntryId)}</p>;
    case 'list':
      if (block.ordered) return <ol className="space-y-1 ml-5 my-3 list-decimal text-sm text-gray-700 leading-relaxed">{block.items.map((item, i) => <li key={i} className="pl-1">{renderInline(item, keywordIndex, currentEntryId)}</li>)}</ol>;
      return <ul className="space-y-1 ml-4 my-3 text-sm text-gray-700 leading-relaxed">{block.items.map((item, i) => <li key={i} className="flex items-start gap-2"><span className="text-[#DB5F5B] font-bold shrink-0 mt-[3px]">•</span><span>{renderInline(item, keywordIndex, currentEntryId)}</span></li>)}</ul>;
    case 'code': return (
      <div className="my-4 rounded-lg overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-100 border-b border-gray-200">
          <span className="text-[10px] text-gray-400 font-mono font-semibold uppercase tracking-wide">Code</span>
          <span className="text-[10px] text-gray-400">{block.code.split('\n').length} lines</span>
        </div>
        <pre className="p-4 bg-[#1e1e2e] overflow-x-auto"><code className="text-xs font-mono text-[#cdd6f4] whitespace-pre-wrap leading-relaxed">{block.code}</code></pre>
      </div>
    );
    case 'image': return (
      <figure className="my-6">
        <img src={block.src} alt={block.alt} className="max-w-full rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition-shadow" loading="lazy" onClick={(e) => { const el = e.currentTarget; el.classList.toggle('max-w-full'); el.classList.toggle('max-w-[200%]'); }} />
        {block.alt && block.alt !== 'Image' && <figcaption className="text-xs text-gray-400 text-center mt-2">{block.alt}</figcaption>}
      </figure>
    );
    case 'table': return (
      <div className="my-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {block.headers.map((h, i) => <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className={`border-b border-gray-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-gray-700 leading-relaxed">{renderInline(cell, keywordIndex, currentEntryId)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    case 'blockquote': return <blockquote className="border-l-[3px] border-[#DB5F5B]/40 bg-[#F5F6E5]/20 px-4 py-2.5 my-4 text-sm text-gray-600 italic leading-relaxed rounded-r">{renderInline(block.text, keywordIndex, currentEntryId)}</blockquote>;
    case 'divider': return <hr className="my-8 border-gray-200" />;
    default: return null;
  }
}

// ---- Component Props ----

interface ContentPaginatorProps {
  content: string;
  /** Entry title -> entry id index used to turn keywords into Wiki links */
  keywordIndex?: KeywordIndex;
  /** Current entry id: matching the current entry's own title is skipped */
  currentEntryId?: string;
  /** Current page number (1-based, URL-controlled) */
  currentPage?: number;
  /** Called when page changes (to update URL) */
  onPageChange?: (page: number) => void;
  /** Called with headings extracted from content (for external TOC) */
  onHeadings?: (headings: Array<{ text: string; page: number; level: number }>) => void;
  /** Heading to navigate to (from TOC click) */
  scrollToHeading?: string | null;
  /** Clear scrollToHeading after navigating */
  onNavigated?: () => void;
  className?: string;
}

export default function ContentPaginator({
  content,
  keywordIndex,
  currentEntryId,
  currentPage = 1,
  onPageChange,
  onHeadings,
  scrollToHeading,
  onNavigated,
  className = '',
}: ContentPaginatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Async pagination state
  const [pages, setPages] = useState<Page[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [headings, setHeadings] = useState<Array<{ text: string; page: number; level: number }>>([]);
  const [loading, setLoading] = useState(true);

  // Load and paginate content asynchronously
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    paginateContent(content).then((result) => {
      if (cancelled) return;
      setPages(result.pages);
      setTotalPages(result.totalPages);

      // Extract headings with their page numbers
      const hds: Array<{ text: string; page: number; level: number }> = [];
      result.pages.forEach((page) => {
        page.blocks.forEach((block) => {
          if (block.type === 'heading') {
            hds.push({ text: block.text, page: page.index + 1, level: block.level });
          }
        });
      });
      setHeadings(hds);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [content]);

  // Notify parent of headings
  useEffect(() => {
    onHeadings?.(headings);
  }, [headings, onHeadings]);

  // Navigate to heading
  useEffect(() => {
    if (scrollToHeading && pages.length > 0) {
      const page = findPageByHeading(pages, scrollToHeading);
      if (page !== currentPage) {
        onPageChange?.(page);
      }
      onNavigated?.();
    }
  }, [scrollToHeading, pages, currentPage, onPageChange, onNavigated]);

  const safePage = Math.min(currentPage, totalPages) || 1;
  const page = pages[safePage - 1];

  const goTo = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    if (clamped !== currentPage) onPageChange?.(clamped);
  }, [currentPage, totalPages, onPageChange]);

  // Loading state
  if (loading) {
    return (
      <div ref={containerRef} className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-sm text-gray-400 animate-pulse font-medium">
            <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" />
            正在解析文档内容...
          </div>
        </div>
      </div>
    );
  }

  // Don't show paginator if content is short
  if (totalPages <= 1 && (!page || page.estimatedHeight < 800)) {
    return (
      <div ref={containerRef} className={`prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed font-sans ${className}`}>
        {page ? page.blocks.map((block, i) => <div key={i}><PageBlockRenderer block={block as ContentBlock} keywordIndex={keywordIndex} currentEntryId={currentEntryId} /></div>) : (
          <p className="text-xs text-gray-400 italic">暂无正文内容</p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`space-y-4 ${className}`}>
      {/* Progress bar */}
      <div className="flex items-center justify-between text-[11px] text-gray-500 select-none bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
        <span className="font-bold text-gray-700">
          第 {safePage} / {totalPages} 页
        </span>
        <div className="flex items-center gap-1">
          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#DB5F5B] rounded-full transition-all duration-300"
              style={{ width: `${(safePage / totalPages) * 100}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] text-gray-400">
          {page?.heading || '正文'}
        </span>
      </div>

      {/* Page content */}
      <div className="min-h-[400px]">
        {page ? page.blocks.map((block, i) => (
          <div key={i}><PageBlockRenderer block={block as ContentBlock} keywordIndex={keywordIndex} currentEntryId={currentEntryId} /></div>
        )) : (
          <p className="text-xs text-gray-400 italic">暂无正文内容</p>
        )}
      </div>

      {/* Page navigator */}
      <div className="flex items-center justify-center gap-1 pt-3 border-t border-gray-100 select-none">
        <button
          onClick={() => goTo(safePage - 1)}
          disabled={safePage <= 1}
          className="px-2 py-1 text-xs font-bold text-gray-600 hover:text-[#DB5F5B] disabled:opacity-30 disabled:cursor-default transition-colors flex items-center gap-0.5"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">上一页</span>
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-0.5">
          {generatePageNumbers(safePage, totalPages).map((p, i) =>
            p === '...' ? (
              <span key={`dot-${i}`} className="w-6 text-center text-gray-400 text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => goTo(p as number)}
                className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                  p === safePage
                    ? 'bg-[#2B3150] text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          onClick={() => goTo(safePage + 1)}
          disabled={safePage >= totalPages}
          className="px-2 py-1 text-xs font-bold text-gray-600 hover:text-[#DB5F5B] disabled:opacity-30 disabled:cursor-default transition-colors flex items-center gap-0.5"
        >
          <span className="hidden sm:inline">下一页</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mobile swipe hint */}
      <p className="text-[10px] text-gray-400 text-center sm:hidden">
        ← 左右滑动翻页 →
      </p>

      {/* Back to top */}
      <button
        onClick={() => containerRef.current?.scrollIntoView({ behavior: 'smooth' })}
        className="fixed bottom-4 right-4 p-2 bg-white border border-gray-200 rounded-full shadow-md hover:shadow-lg transition-shadow z-10"
        title="回到顶部"
      >
        <ChevronUp className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  );
}

/** Generate smart page number list: [1, ..., 4, 5, 6, ..., 20] */
function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const result: (number | '...')[] = [1];

  if (current > 3) result.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    result.push(i);
  }

  if (current < total - 2) result.push('...');

  result.push(total);
  return result;
}
