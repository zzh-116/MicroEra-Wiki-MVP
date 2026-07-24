// ContentPaginator — paginated content reader with page navigation, progress bar,
// URL sync, and TOC integration. Renders ContentBlock[] pages, never raw Markdown.

import { useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ContentBlock } from '../utils/contentParser';
import { paginateContent, findPageByHeading } from '../utils/contentPaginator';

// Internal BlockRenderer (same as ContentRenderer but standalone here for self-containment)
function PageBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading': {
      if (block.level <= 1) return <h3 id={`h-${block.text.slice(0,20)}`} className="text-base font-extrabold text-gray-900 mt-5 mb-2">{block.text}</h3>;
      if (block.level === 2) return <h4 id={`h-${block.text.slice(0,20)}`} className="text-xs font-extrabold text-[#DB5F5B] uppercase tracking-wide mt-4 mb-1">{block.text}</h4>;
      return <h5 id={`h-${block.text.slice(0,20)}`} className="text-xs font-bold text-gray-800 mt-3 mb-1">{block.text}</h5>;
    }
    case 'paragraph': return <p className="my-1.5 text-gray-600 leading-relaxed">{block.text}</p>;
    case 'list':
      if (block.ordered) return <ol className="space-y-0.5 ml-4 my-1 list-decimal">{block.items.map((item, i) => <li key={i} className="text-gray-600 pl-1">{item}</li>)}</ol>;
      return <ul className="space-y-0.5 ml-3 my-1">{block.items.map((item, i) => <li key={i} className="flex items-start space-x-1.5 text-gray-600"><span className="text-[#DB5F5B] font-bold shrink-0 mt-0.5">•</span><span>{item}</span></li>)}</ul>;
    case 'code': return <pre className="my-2 p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto"><code className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap">{block.code}</code></pre>;
    case 'image': return <figure className="my-3"><img src={block.src} alt={block.alt} className="max-w-full rounded-lg border border-gray-200 cursor-pointer" loading="lazy" onClick={(e) => { const el = e.currentTarget; el.classList.toggle('max-w-full'); el.classList.toggle('max-w-[200%]'); }} />{block.alt && block.alt !== 'Image' && <figcaption className="text-[10px] text-gray-400 text-center mt-1">{block.alt}</figcaption>}</figure>;
    case 'table': return <div className="my-2 overflow-x-auto"><table className="min-w-full text-[11px] border-collapse"><thead><tr className="bg-gray-50">{block.headers.map((h, i) => <th key={i} className="border border-gray-200 px-2 py-1 text-left font-bold text-gray-700">{h}</th>)}</tr></thead><tbody>{block.rows.map((row, ri) => <tr key={ri} className="even:bg-gray-50/50">{row.map((cell, ci) => <td key={ci} className="border border-gray-200 px-2 py-1 text-gray-600">{cell}</td>)}</tr>)}</tbody></table></div>;
    case 'blockquote': return <blockquote className="border-l-4 border-[#DB5F5B]/30 bg-[#F5F6E5]/30 px-3 py-1.5 my-2 text-gray-600 italic">{block.text}</blockquote>;
    case 'divider': return <hr className="my-3 border-gray-200" />;
    default: return null;
  }
}

// ---- Component Props ----

interface ContentPaginatorProps {
  content: string;
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
  currentPage = 1,
  onPageChange,
  onHeadings,
  scrollToHeading,
  onNavigated,
  className = '',
}: ContentPaginatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse + paginate (memoized — only runs when content changes)
  const { pages, totalPages, headings } = useMemo(() => {
    const result = paginateContent(content);
    // Extract headings with their page numbers
    const hds: Array<{ text: string; page: number; level: number }> = [];
    result.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        if (block.type === 'heading') {
          hds.push({ text: block.text, page: page.index + 1, level: block.level });
        }
      });
    });
    return { pages: result.pages, totalPages: result.totalPages, headings: hds };
  }, [content]);

  // Notify parent of headings
  useEffect(() => {
    onHeadings?.(headings);
  }, [headings, onHeadings]);

  // Navigate to heading
  useEffect(() => {
    if (scrollToHeading) {
      const page = findPageByHeading(pages, scrollToHeading);
      if (page !== currentPage) {
        onPageChange?.(page);
      }
      onNavigated?.();
    }
  }, [scrollToHeading]);

  const safePage = Math.min(currentPage, totalPages) || 1;
  const page = pages[safePage - 1];

  const goTo = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    if (clamped !== currentPage) onPageChange?.(clamped);
  }, [currentPage, totalPages, onPageChange]);

  // Don't show paginator if content is short
  if (totalPages <= 1 && (!page || page.estimatedHeight < 800)) {
    return (
      <div ref={containerRef} className={`prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed font-sans ${className}`}>
        {page ? page.blocks.map((block, i) => <div key={i}><PageBlockRenderer block={block as ContentBlock} /></div>) : (
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
          <div key={i}><PageBlockRenderer block={block as ContentBlock} /></div>
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
