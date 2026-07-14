// KnowledgeCard — renders KnowledgeDocument as a clean, readable card.
// Replaces raw JSON rendering. Properties as Key-Value, Tags as Badges,
// References as linked items. Raw JSON hidden behind debug toggle.

import React, { useState } from 'react';
import { Database, Tag, Link2, ChevronDown, ChevronRight, Bug } from 'lucide-react';

// Mirrors backend KnowledgeDocument type (simplified for frontend)
export interface KnowledgeCardProps {
  title: string;
  type: string;
  abstract: string;
  body?: string;
  properties?: Array<{ key: string; value: string; group?: string; type?: string }>;
  references?: Array<{ label: string; type: string; target?: string; description?: string }>;
  tags?: string[];
  attachments?: Array<{ name: string; url?: string; mimeType?: string; size?: number }>;
  author?: string;
  updatedAt?: string;
  metadata?: {
    source: string;
    sourceId: string;
    sourceType: string;
    projectName?: string;
    unresolvedIds: string[];
  };
}

/** Type display names */
const TYPE_LABELS: Record<string, string> = {
  project: '项目',
  paper: '论文',
  dataset: '数据集',
  operator: '算子',
  module: '模块',
  other: '其他',
};

/** Reference type icons */
const REF_ICONS: Record<string, string> = {
  project: '📁',
  paper: '📄',
  dataset: '📊',
  task: '📋',
  file: '📎',
  link: '🔗',
};

export default function KnowledgeCard(props: KnowledgeCardProps) {
  const {
    title, type, abstract, body, properties = [], references = [],
    tags = [], attachments = [], author, updatedAt, metadata,
  } = props;

  const [showDebug, setShowDebug] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Group properties
  const grouped = new Map<string, typeof properties>();
  for (const p of properties) {
    const g = p.group || 'General';
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(p);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm text-gray-900 leading-snug break-all">
              {title}
            </h3>
            {abstract && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{abstract}</p>
            )}
          </div>
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-[#2B3150] text-white uppercase">
            {TYPE_LABELS[type] || type}
          </span>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <Tag className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
            {tags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 bg-[#F5F6E5] text-[#2B3150] border border-[#DB5F5B]/10 rounded font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Properties — grouped Key-Value tables */}
      {grouped.size > 0 && (
        <div className="px-4 py-2 space-y-1">
          {[...grouped.entries()].map(([group, props]) => (
            <div key={group}>
              <button
                onClick={() => toggleGroup(group)}
                className="flex items-center space-x-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 py-1 w-full text-left"
              >
                {expandedGroups[group] ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{group}</span>
                <span className="text-[10px] text-gray-400">({props.length})</span>
              </button>
              {expandedGroups[group] && (
                <div className="ml-4 mb-2 text-xs">
                  {props.map((p, i) => (
                    <div key={i} className="flex py-0.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500 w-32 shrink-0 font-medium">{p.key}</span>
                      <span className={`text-gray-800 break-all ${p.type === 'code' ? 'font-mono text-[11px]' : ''}`}>
                        {p.type === 'link' ? (
                          <a href={p.value} target="_blank" rel="noopener noreferrer" className="text-[#1D70B8] hover:underline">
                            {p.value.length > 60 ? p.value.slice(0, 60) + '…' : p.value}
                          </a>
                        ) : p.type === 'json' ? (
                          <code className="text-[10px] bg-gray-100 px-1 rounded">{p.value}</code>
                        ) : (
                          p.value
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Body (Markdown rendered by parent) */}
      {body && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="prose prose-sm max-w-none text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {body}
          </div>
        </div>
      )}

      {/* References */}
      {references.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center">
            <Link2 className="w-3 h-3 mr-1" />
            关联引用
          </h4>
          <div className="space-y-0.5 text-xs">
            {references.map((ref, i) => (
              <div key={i} className="flex items-start space-x-1.5 text-gray-700">
                <span className="text-[10px]">{REF_ICONS[ref.type] || '📌'}</span>
                <span className="font-medium">{ref.label}</span>
                {ref.description && (
                  <span className="text-gray-400">— {ref.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between text-[10px] text-gray-400">
        <div className="flex items-center space-x-3">
          {author && <span>👤 {author}</span>}
          {updatedAt && <span>🕐 {updatedAt}</span>}
          {metadata?.source && (
            <span className="flex items-center">
              <Database className="w-3 h-3 mr-0.5" />
              {metadata.source}
            </span>
          )}
        </div>

        {/* Debug toggle (dev mode) */}
        {metadata && (
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center space-x-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="开发者调试信息"
          >
            <Bug className="w-3 h-3" />
            <span>{showDebug ? '隐藏' : '调试'}</span>
          </button>
        )}
      </div>

      {/* Debug panel (collapsed by default) */}
      {showDebug && metadata && (
        <div className="px-4 py-2 border-t border-dashed border-gray-200 bg-gray-50">
          <pre className="text-[10px] font-mono text-gray-500 whitespace-pre-wrap overflow-x-auto max-h-48">
            {JSON.stringify({
              source: metadata.source,
              sourceId: metadata.sourceId,
              sourceType: metadata.sourceType,
              unresolvedIds: metadata.unresolvedIds,
              projectName: metadata.projectName,
            }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
