import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ExpandableContentProps {
  content: string;
  maxHeight?: number;
}

/**
 * Parses markdown-like text into React nodes.
 * Supports: # h3, ## h4, - bullet, paragraph breaks
 */
function parseContent(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let paragraphBuffer: string[] = [];
  let key = 0;

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      nodes.push(
        <p key={key++} className="text-xs text-gray-700 leading-relaxed mb-2 last:mb-0">
          {paragraphBuffer.join(' ')}
        </p>
      );
      paragraphBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Empty line flushes paragraph
    if (line === '') {
      flushParagraph();
      continue;
    }

    // Heading level 1 → h3
    if (line.startsWith('# ')) {
      flushParagraph();
      nodes.push(
        <h3 key={key++} className="text-sm font-bold text-[#2B3150] mt-3 mb-1.5">
          {line.slice(2)}
        </h3>
      );
      continue;
    }

    // Heading level 2 → h4
    if (line.startsWith('## ')) {
      flushParagraph();
      nodes.push(
        <h4 key={key++} className="text-xs font-bold text-[#2B3150] mt-2.5 mb-1">
          {line.slice(3)}
        </h4>
      );
      continue;
    }

    // Bullet point
    if (/^[-*]\s/.test(line)) {
      flushParagraph();
      nodes.push(
        <div key={key++} className="flex items-start gap-1.5 ml-2 text-xs text-gray-700 mb-0.5">
          <span className="text-gray-400 shrink-0 mt-1">&#8226;</span>
          <span className="leading-relaxed">{line.replace(/^[-*]\s/, '')}</span>
        </div>
      );
      continue;
    }

    // Regular text line — accumulate into paragraph
    paragraphBuffer.push(line);
  }

  flushParagraph();

  return nodes;
}

export default function ExpandableContent({ content, maxHeight = 300 }: ExpandableContentProps) {
  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const actualHeight = contentRef.current.scrollHeight;
      setNeedsCollapse(actualHeight > maxHeight + 10);
    }
  }, [content, maxHeight]);

  if (!content) {
    return (
      <div className="text-sm text-gray-400 italic py-2">
        暂无内容
      </div>
    );
  }

  const parsed = parseContent(content);

  return (
    <div className="relative">
      {/* Content area */}
      <div
        ref={contentRef}
        style={{
          maxHeight: expanded ? 'none' : `${maxHeight}px`,
          overflow: 'hidden',
        }}
        className="transition-[max-height] duration-300 ease-in-out"
      >
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          {parsed}
        </div>
      </div>

      {/* Fade gradient overlay when collapsed */}
      {needsCollapse && !expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none rounded-b-xl" />
      )}

      {/* Expand / collapse toggle */}
      {needsCollapse && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D70B8] hover:text-[#2B3150] bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm hover:border-[#DB5F5B]/30 transition-all"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>收起</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>展开全部</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
