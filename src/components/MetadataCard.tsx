import React from 'react';
import { ExternalLink } from 'lucide-react';

interface MetadataItem {
  key: string;
  value: string;
  type?: 'text' | 'link' | 'code' | 'badge';
}

interface MetadataCardProps {
  items: MetadataItem[];
  title?: string;
}

function renderValue(item: MetadataItem) {
  const { value, type } = item;

  switch (type) {
    case 'code':
      return (
        <code className="text-[11px] font-mono bg-gray-100 text-[#2B3150] px-1.5 py-0.5 rounded">
          {value}
        </code>
      );

    case 'badge':
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">
          {value}
        </span>
      );

    case 'link':
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1D70B8] hover:underline inline-flex items-center gap-1"
        >
          <span className="break-all">{value}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      );

    default:
      return <span className="text-gray-800 break-all">{value}</span>;
  }
}

export default function MetadataCard({ items, title = '基本信息' }: MetadataCardProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-2">
        暂无元数据信息
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-bold text-[#2B3150] mb-3 pb-2 border-b border-gray-100">
        {title}
      </h3>
      <div className="space-y-0.5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex py-1.5 border-b border-gray-50 last:border-0"
          >
            <span className="text-xs text-gray-500 w-32 shrink-0 font-medium">
              {item.key}
            </span>
            <div className="text-xs min-w-0">
              {renderValue(item)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
