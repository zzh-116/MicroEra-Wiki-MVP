import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Hash } from 'lucide-react';

interface RecordProperty {
  key: string;
  value: string;
  type?: string;
}

interface RecordImage {
  url: string;
  caption?: string;
}

interface SandboxRecord {
  index: number;
  title: string;
  domain?: string;
  description?: string;
  properties: RecordProperty[];
  images: RecordImage[];
}

interface RecordCardProps {
  record: SandboxRecord;
  defaultExpanded?: boolean;
}

function renderPropertyValue(prop: RecordProperty) {
  const { value, type } = prop;

  switch (type) {
    case 'code':
      return (
        <code className="text-[11px] font-mono bg-gray-100 text-[#2B3150] px-1.5 py-0.5 rounded">
          {value}
        </code>
      );

    case 'link':
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1D70B8] hover:underline break-all"
        >
          {value}
        </a>
      );

    case 'badge':
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">
          {value}
        </span>
      );

    default:
      return <span className="text-gray-800 break-all">{value}</span>;
  }
}

export default function RecordCard({ record, defaultExpanded = true }: RecordCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { index, title, domain, description, properties, images } = record;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded bg-[#2B3150] text-white text-[10px] font-bold">
                {index}
              </span>
              <h3 className="font-bold text-sm text-[#2B3150] truncate">
                Record {index}: {title}
              </h3>
            </div>
            {domain && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F5F6E5] text-[#2B3150] border border-[#DB5F5B]/10">
                {domain}
              </span>
            )}
          </div>

          {description && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Properties */}
        {properties.length > 0 && (
          <div className="px-4 py-2">
            {!defaultExpanded && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 py-1 w-full text-left"
              >
                {expanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <span>{expanded ? '收起' : '展开'}</span>
                <span className="text-[10px] text-gray-400">
                  属性 ({properties.length})
                </span>
              </button>
            )}

            {expanded && (
              <div className="space-y-0.5">
                {properties.map((prop, i) => (
                  <div
                    key={i}
                    className="flex py-1 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-xs text-gray-500 w-32 shrink-0 font-medium">
                      {prop.key}
                    </span>
                    <div className="text-xs min-w-0">
                      {renderPropertyValue(prop)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              关联图片 ({images.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img.url}
                    alt={img.caption || `图片 ${i + 1}`}
                    className="w-24 h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:border-[#DB5F5B]/40 transition-colors"
                    onClick={() => setLightboxUrl(img.url)}
                  />
                  {img.caption && (
                    <span className="block text-[10px] text-gray-400 mt-0.5 text-center max-w-[96px] truncate">
                      {img.caption}
                    </span>
                  )}
                  <button
                    onClick={() => setLightboxUrl(img.url)}
                    className="absolute top-1 right-1 p-0.5 bg-white/80 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="查看大图"
                  >
                    <Maximize2 className="w-3 h-3 text-gray-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="预览大图"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
