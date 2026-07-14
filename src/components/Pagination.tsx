import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, total);

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    if (clamped !== safePage) onPageChange(clamped);
  };

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    if (start > 1) pages.push(1, 'ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages) pages.push('ellipsis', totalPages);
    return pages;
  };

  if (total <= pageSizeOptions[0] && !onPageSizeChange) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100 select-none">
      {/* Info */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono">
        <span>第 {safePage} / {totalPages} 页，共 {total} 条</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1">
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="border border-gray-200 rounded px-1 py-0.5 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B]"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>条</span>
          </div>
        )}
      </div>

      {/* Controls */}
      {totalPages > 1 && (
        <div className="flex items-center space-x-1">
          {/* First */}
          <button
            onClick={() => goToPage(1)}
            disabled={safePage <= 1}
            className="px-1.5 py-1 text-[10px] font-bold border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="首页"
          >
            <ChevronsLeft className="w-3 h-3" />
          </button>

          {/* Previous */}
          <button
            onClick={() => goToPage(safePage - 1)}
            disabled={safePage <= 1}
            className="px-2 py-1 text-[10px] font-bold border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center space-x-0.5"
          >
            <ChevronLeft className="w-3 h-3" />
            <span className="hidden sm:inline">上一页</span>
          </button>

          {/* Page Numbers */}
          {getPageNumbers().map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e-${i}`} className="px-1 text-[10px] text-gray-400">…</span>
            ) : (
              <button
                key={p}
                onClick={() => goToPage(p)}
                className={`min-w-[28px] h-7 text-[10px] font-bold rounded transition-all ${
                  p === safePage
                    ? 'bg-[#2B3150] text-[#F2D760]'
                    : 'border border-gray-200 hover:bg-gray-100 text-gray-600'
                }`}
              >
                {p}
              </button>
            )
          )}

          {/* Next */}
          <button
            onClick={() => goToPage(safePage + 1)}
            disabled={safePage >= totalPages}
            className="px-2 py-1 text-[10px] font-bold border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center space-x-0.5"
          >
            <span className="hidden sm:inline">下一页</span>
            <ChevronRight className="w-3 h-3" />
          </button>

          {/* Last */}
          <button
            onClick={() => goToPage(totalPages)}
            disabled={safePage >= totalPages}
            className="px-1.5 py-1 text-[10px] font-bold border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="末页"
          >
            <ChevronsRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
