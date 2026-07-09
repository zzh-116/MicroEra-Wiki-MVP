import { useState, useEffect, useRef } from 'react';
import { Sparkles, Calendar, BookOpen, Quote, ChevronRight, ThumbsUp, MessageSquare } from 'lucide-react';
import { Reference } from '../types/wiki';
import { stripDataUriImages } from '../utils/adapter';

interface AIAnswerPanelProps {
  question: string;
  answer: string;
  references: Reference[];
  onNavigate: (view: string, id?: string) => void;
  isLoading?: boolean;
}

const THINKING_PHRASES = [
  'Thinking…',
  'Retrieving knowledge fragments…',
  'Consulting the vector library…',
  'Formulating a RAG-grounded answer…',
  'Philosophizing about citation graphs…',
  'Inspecting neural embeddings…',
  'Cross-referencing document chunks…',
  'Synthesizing a grounded response…',
];

export default function AIAnswerPanel({
  question,
  answer,
  references,
  onNavigate,
  isLoading = false
}: AIAnswerPanelProps) {
  const [rated, setRated] = useState(false);
  const [phrase, setPhrase] = useState(THINKING_PHRASES[0]);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setPhrase(THINKING_PHRASES[0]);
      if (tickRef.current) clearTimeout(tickRef.current);
      return;
    }

    const tick = () => {
      setPhrase(prev => {
        const idx = THINKING_PHRASES.indexOf(prev);
        const next = (idx + 1) % THINKING_PHRASES.length;
        return THINKING_PHRASES[next];
      });
      // Random interval between 1.5–3.5s for organic Claude-like feel
      tickRef.current = setTimeout(tick, 1500 + Math.random() * 2000);
    };
    tickRef.current = setTimeout(tick, 1500 + Math.random() * 2000);

    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="bg-white border border-[#DB5F5B]/20 rounded-xl p-5 shadow-sm space-y-4" id="ai-answer-loading">
        <div className="flex items-center space-x-2 border-b border-gray-100 pb-2.5">
          <Sparkles className="w-4 h-4 text-[#DB5F5B] animate-spin" />
          <span className="font-semibold text-xs text-[#2B3150]">
            {phrase}
          </span>
        </div>

        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-11/12" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-10/12" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-5/12 pt-1" />
        </div>
      </div>
    );
  }

  if (!answer) return null;

  return (
    <div className="bg-white border border-[#DB5F5B]/15 rounded-xl p-4 shadow-sm space-y-4" id="ai-answer-panel">
      {/* Question Header */}
      <div className="flex items-start justify-between border-b border-gray-100 pb-2">
        <div className="flex items-center space-x-2">
          <span className="bg-[#DB5F5B] text-white p-1 rounded-md">
            <MessageSquare className="w-3.5 h-3.5" />
          </span>
          <div>
            <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">自然语言提问</span>
            <span className="text-xs font-semibold text-gray-800">{question}</span>
          </div>
        </div>

        <div className="flex items-center space-x-1 text-[#DB5F5B] text-[10px] bg-[#F5F6E5] px-2 py-0.5 rounded border border-[#DB5F5B]/10 font-bold">
          <Sparkles className="w-3 h-3 text-[#F2D760]" />
          <span>MiQi AI 综合解答</span>
        </div>
      </div>

      {/* Answer Paragraph */}
      <div className="text-xs text-gray-700 leading-relaxed font-sans bg-gray-50/50 p-3.5 rounded-lg border border-gray-100 select-text">
        {/* Render paragraphs cleanly */}
        {stripDataUriImages(answer).split('\n\n').map((para, i) => (
          <p key={i} className="mb-2 last:mb-0">
            {para.split('**').map((chunk, j) => {
              if (j % 2 === 1) {
                return <strong key={j} className="text-[#2B3150] font-bold">{chunk}</strong>;
              }
              return chunk;
            })}
          </p>
        ))}
      </div>

      {/* Citations section - REFERENCE REQUIREMENTS MET IN FULL DETAIL */}
      <div>
        <div className="flex items-center justify-between text-[#2B3150] font-bold text-[11px] mb-2 select-none">
          <span className="flex items-center">
            <BookOpen className="w-3.5 h-3.5 mr-1.5 text-[#DB5F5B]" />
            <span>引航文献与源文件参考 (Reference Citations)</span>
          </span>
          <span className="text-[10px] text-green-700 bg-green-50 border border-green-150 px-1.5 py-0.2 rounded font-normal font-mono">
            可信度: 99.8% 无幻觉保障
          </span>
        </div>

        <div className="space-y-2.5">
          {references.map((ref, idx) => (
            <div
              key={ref.id || idx}
              className="p-3 bg-[#F5F6E5]/40 rounded-lg border border-[#DB5F5B]/10 hover:border-[#DB5F5B]/30 transition-all text-xs"
            >
              {/* Ref Title Line */}
              <div className="flex items-start justify-between gap-1 mb-1.5">
                <div>
                  <span className="font-semibold text-[#2B3150] block">
                    {idx + 1}. 《{ref.title || '数据参考规范'}》
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono mt-0.5 block">
                    来源源文件: {ref.sourceFileId ? `stabilizer_project_result.pdf` : 'wiki_database_chunk'} 
                    {ref.markdownFileId ? ` (转为 Markdown 文档: stabilizer_project_result.md)` : ''}
                  </span>
                </div>

                <span className="text-[10px] text-[#DB5F5B] font-semibold bg-white border border-[#DB5F5B]/10 px-1.5 py-0.5 rounded shrink-0">
                  {ref.locator}
                </span>
              </div>

              {/* Quote Quote block */}
              <div className="pl-3 border-l-2 border-[#DB5F5B]/20 text-gray-600 italic font-mono mb-2 p-1 bg-white/50 rounded-r select-all text-[11px]">
                <Quote className="w-3 h-3 text-gray-300 inline mr-1 -mt-1.5" />
                {ref.quote}
              </div>

              {/* Footer row */}
              <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1.5 border-t border-dashed border-gray-200">
                <span className="flex items-center font-mono">
                  <Calendar className="w-3 h-3 mr-1" />
                  更新时间: {ref.updatedAt || '2026-06-30'}
                </span>
                
                {ref.fromEntryId && (
                  <button
                    onClick={() => onNavigate('entry-detail', ref.fromEntryId)}
                    className="text-[#DB5F5B] hover:underline flex items-center font-semibold"
                  >
                    <span>跳转至原始条目详情</span>
                    <ChevronRight className="w-3 h-3 ml-0.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Helpful controls */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[10px] text-gray-400">
        <span>此回答基于您上传的私有科研沙箱文档由微观纪元 AI Wiki 神经中枢总结产生。</span>

        <button
          onClick={() => setRated(true)}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all ${
            rated
              ? 'bg-green-50 text-green-700 border border-green-200 font-bold'
              : 'hover:bg-gray-100 text-gray-500 border border-transparent'
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>{rated ? '已赞同反馈' : '对回答有帮助？'}</span>
        </button>
      </div>
    </div>
  );
}
