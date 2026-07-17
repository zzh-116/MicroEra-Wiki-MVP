// ContentRenderer — renders ContentBlock[] with appropriate React components.
// Never renders raw strings, base64, or placeholder text.
import React from 'react';
import type { ContentBlock } from '../utils/contentParser';
import { parseContent } from '../utils/contentParser';

interface ContentRendererProps {
  content: string;
  maxHeight?: number;
}

export default function ContentRenderer({ content, maxHeight }: ContentRendererProps) {
  const [expanded, setExpanded] = React.useState(false);
  const blocks = parseContent(content);

  if (blocks.length === 0) {
    return <p className="text-xs text-gray-400 italic">暂无正文内容</p>;
  }

  const needsCollapse = maxHeight && content.length > maxHeight;

  return (
    <div className="relative">
      <div
        className={`prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed font-sans overflow-hidden transition-all ${
          !expanded && needsCollapse ? 'max-h-[300px]' : ''
        }`}
        style={!expanded && needsCollapse ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        {blocks.map((block, i) => (
          <div key={i}><BlockRenderer block={block} /></div>
        ))}
      </div>

      {needsCollapse && !expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      )}

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center space-x-1 text-[10px] font-bold text-[#1D70B8] hover:text-[#DB5F5B] transition-colors"
        >
          {expanded ? '收起 ▲' : '展开全部 ▼'}
        </button>
      )}
    </div>
  );
}

/** Render a single ContentBlock */
function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading': {
      if (block.level <= 1) {
        return <h3 className="text-base font-extrabold text-gray-900 mt-5 mb-2">{block.text}</h3>;
      }
      if (block.level === 2) {
        return <h4 className="text-xs font-extrabold text-[#DB5F5B] uppercase tracking-wide mt-4 mb-1">{block.text}</h4>;
      }
      if (block.level === 3) {
        return <h5 className="text-xs font-bold text-gray-800 mt-3 mb-1">{block.text}</h5>;
      }
      return <h6 className="text-[11px] font-bold text-gray-700 mt-2 mb-1">{block.text}</h6>;
    }

    case 'paragraph':
      return <p className="my-1.5 text-gray-600 leading-relaxed">{block.text}</p>;

    case 'list':
      if (block.ordered) {
        return (
          <ol className="space-y-0.5 ml-4 my-1 list-decimal">
            {block.items.map((item, i) => (
              <li key={i} className="text-gray-600 pl-1">{item}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="space-y-0.5 ml-3 my-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start space-x-1.5 text-gray-600">
              <span className="text-[#DB5F5B] font-bold shrink-0 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'code':
      return (
        <pre className="my-2 p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto">
          <code className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap">
            {block.code}
          </code>
        </pre>
      );

    case 'image':
      return (
        <figure className="my-3">
          <img
            src={block.src}
            alt={block.alt}
            className="max-w-full rounded-lg border border-gray-200"
            loading="lazy"
          />
          {block.alt && block.alt !== 'Image' && (
            <figcaption className="text-[10px] text-gray-400 text-center mt-1">{block.alt}</figcaption>
          )}
        </figure>
      );

    case 'table':
      return (
        <div className="my-2 overflow-x-auto">
          <table className="min-w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {block.headers.map((h, i) => (
                  <th key={i} className="border border-gray-200 px-2 py-1 text-left font-bold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="even:bg-gray-50/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-200 px-2 py-1 text-gray-600">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'blockquote':
      return (
        <blockquote className="border-l-4 border-[#DB5F5B]/30 bg-[#F5F6E5]/30 px-3 py-1.5 my-2 text-gray-600 italic">
          {block.text}
        </blockquote>
      );

    case 'divider':
      return <hr className="my-3 border-gray-200" />;

    case 'html':
      return <div dangerouslySetInnerHTML={{ __html: block.html }} />;

    default:
      return null;
  }
}
