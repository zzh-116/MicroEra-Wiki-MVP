import { useState } from 'react';
import { User, Bot, ChevronDown, ChevronRight, ArrowRight, Sparkles, FileText, BookOpen, ThumbsUp } from 'lucide-react';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  sources?: Array<{ id: number; title: string; entry_type: string }>;
  onSourceClick?: (id: number) => void;
  /** Show thinking process steps (AIQueryPage) */
  thinkingSteps?: string[];
  /** Follow-up suggestions after assistant answer */
  followUps?: string[];
  onFollowUp?: (question: string) => void;
}

export default function MessageBubble({
  role,
  content,
  timestamp,
  sources,
  onSourceClick,
  thinkingSteps,
  followUps,
  onFollowUp,
}: MessageBubbleProps) {
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  if (role === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full border border-gray-200 font-medium">
          {content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 mb-5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-ink text-white'
            : 'bg-gradient-to-br from-brand/10 to-brand/20 text-brand'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Sparkles className="w-4 h-4" aria-hidden="true" />
        )}
      </div>

      {/* Content area */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Role label */}
        <div className={`text-[10px] font-semibold text-gray-400 mb-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? 'You' : 'MiQi AI'}
        </div>

        {/* Thinking process (assistant only, when provided) */}
        {isAssistant && thinkingSteps && thinkingSteps.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setThinkingOpen(!thinkingOpen)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors mb-1.5"
            >
              {thinkingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Sparkles className="w-3 h-3 text-accent" />
              思考过程
            </button>
            {thinkingOpen && (
              <div className="space-y-0.5 pl-2 border-l-2 border-accent/30">
                {thinkingSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-gray-500 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`inline-block px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-ink text-white rounded-2xl rounded-br-sm max-w-[85%]'
              : 'bg-white text-gray-800 rounded-2xl rounded-bl-sm border border-gray-200 max-w-[90%]'
          }`}
        >
          {content || (isAssistant && ' ')}
        </div>

        {/* Sources / Citations (assistant only) */}
        {isAssistant && sources && sources.length > 0 && (
          <div className="mt-2.5 space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              引用来源
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => onSourceClick?.(source.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium
                             bg-cream/40 text-link border border-cream rounded-lg
                             hover:border-brand/30 hover:bg-brand/5 transition-all"
                  title={source.title}
                >
                  <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate max-w-[160px]">{source.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Follow-up suggestions (assistant only) */}
        {isAssistant && followUps && followUps.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">继续追问</p>
            <div className="flex flex-wrap gap-1.5">
              {followUps.map((q) => (
                <button
                  key={q}
                  onClick={() => onFollowUp?.(q)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-600
                             bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full
                             transition-all duration-150"
                >
                  {q}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div className={`text-[10px] text-gray-400 mt-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}
