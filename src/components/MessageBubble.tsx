import { User, Bot } from 'lucide-react';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  sources?: Array<{ id: number; title: string; entry_type: string }>;
  onSourceClick?: (id: number) => void;
}

export default function MessageBubble({
  role,
  content,
  timestamp,
  sources,
  onSourceClick,
}: MessageBubbleProps) {
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  if (role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
          {content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? 'bg-[#2B3150]' : 'bg-[#DB5F5B]/10'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-white" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-[#DB5F5B]" />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-[#2B3150] text-white rounded-xl rounded-br-sm ml-auto'
              : 'bg-gray-100 text-gray-800 rounded-xl rounded-bl-sm'
          }`}
        >
          {content}
        </div>

        {/* Sources for assistant */}
        {isAssistant && sources && sources.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => onSourceClick?.(source.id)}
                className="text-[10px] bg-white border border-gray-200 rounded-md px-1.5 py-0.5 text-[#1D70B8] hover:border-[#1D70B8]/40 hover:bg-[#F5F6E5] transition-all cursor-pointer"
                title={source.title}
              >
                {'\u{1F4C4}'} {source.title}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div
            className={`text-[10px] text-gray-400 mt-1 ${isUser ? 'text-right' : 'text-left'}`}
          >
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}
