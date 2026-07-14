import React from 'react';
import { ExternalLink, Link2 } from 'lucide-react';

interface ReferenceItem {
  index: number;
  label: string;
  doi?: string;
  url?: string;
  description?: string;
  type: string;
}

interface ReferenceViewProps {
  references: ReferenceItem[];
}

const TYPE_ICONS: Record<string, string> = {
  citation: '📄',  // 📄
  paper: '📄',      // 📄
  dataset: '📊',    // 📊
  project: '📁',    // 📁
  file: '📎',       // 📎
  link: '🔗',       // 🔗
};

const TYPE_LABELS: Record<string, string> = {
  citation: '引用文献',
  paper: '学术论文',
  dataset: '数据集',
  project: '项目',
  file: '文件',
  link: '外部链接',
};

export default function ReferenceView({ references }: ReferenceViewProps) {
  if (!references || references.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-2">
        暂无引用信息
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-bold text-[#2B3150] mb-3 pb-2 border-b border-gray-100 flex items-center gap-1.5">
        <Link2 className="w-3.5 h-3.5 text-[#DB5F5B]" />
        参考文献与引用
        <span className="text-[10px] text-gray-400 font-normal">
          ({references.length})
        </span>
      </h3>

      <div className="space-y-2">
        {references.map((ref, idx) => {
          const icon = TYPE_ICONS[ref.type] || '🔗';
          const typeLabel = TYPE_LABELS[ref.type] || ref.type;

          return (
            <div
              key={idx}
              className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50/50 border border-gray-100 hover:border-[#DB5F5B]/20 transition-colors"
            >
              {/* Index badge */}
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded bg-[#2B3150] text-white text-[10px] font-bold mt-0.5">
                {idx + 1}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Type icon */}
                  <span className="text-sm shrink-0" title={typeLabel}>
                    {icon}
                  </span>

                  {/* Label */}
                  {ref.url ? (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[#1D70B8] hover:underline inline-flex items-center gap-1"
                    >
                      {ref.label}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-[#2B3150]">
                      {ref.label}
                    </span>
                  )}

                  {/* DOI badge */}
                  {ref.doi && (
                    <a
                      href={`https://doi.org/${ref.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-[#1D70B8] bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                    >
                      DOI: {ref.doi}
                    </a>
                  )}

                  {/* Type label */}
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#F5F6E5] text-[#2B3150] border border-[#DB5F5B]/10">
                    {typeLabel}
                  </span>
                </div>

                {/* Description */}
                {ref.description && (
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                    {ref.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
