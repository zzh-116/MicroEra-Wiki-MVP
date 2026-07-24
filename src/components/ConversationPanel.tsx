import { useEffect, useRef } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

interface ConversationPanelProps {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    sources?: Array<{ id: number; title: string; entry_type: string }>;
  }>;
  onSend: (message: string) => void;
  isLoading: boolean;
  onSourceClick?: (id: number) => void;
  onNewChat?: () => void;
  className?: string;
}

export default function ConversationPanel({
  messages,
  onSend,
  isLoading,
  onSourceClick,
  onNewChat,
  className = '',
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const canAutoScroll = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { canAutoScroll.current = true; }, 500);
    return () => clearTimeout(t);
  }, []);

  // Auto-scroll to bottom when messages change or loading state toggles
  useEffect(() => {
    if (!canAutoScroll.current || messages.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col ${className}`}
      style={{ height: '100%' }}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#DB5F5B]" />
          <span className="text-sm font-semibold text-[#2B3150]">AI 问答</span>
        </div>
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="flex items-center gap-1 text-[10px] text-[#1D70B8] hover:text-[#1D70B8]/80 hover:bg-[#F5F6E5] px-2 py-1 rounded-md border border-transparent hover:border-[#DB5F5B]/20 transition-all"
            title="新对话"
          >
            <RefreshCw className="w-3 h-3" />
            <span>新对话</span>
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
              基于当前知识条目提问，AI 将结合文档内容给出溯源级回答。
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <MessageBubble
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                sources={msg.sources}
                onSourceClick={onSourceClick}
              />
            </div>
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-1 px-1 py-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] text-gray-400 ml-2">AI 正在思考…</span>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <ChatInput
          onSubmit={onSend}
          disabled={isLoading}
          placeholder="输入您的问题…"
        />
      </div>
    </div>
  );
}
