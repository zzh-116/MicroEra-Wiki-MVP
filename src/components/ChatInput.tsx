import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, Loader2, CornerDownLeft } from 'lucide-react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Enable multiline textarea (AIQueryPage) */
  multiline?: boolean;
  /** Quick prompt chips shown above the input */
  quickPrompts?: string[];
  onQuickPrompt?: (prompt: string) => void;
  /** Clear conversation handler */
  onClear?: () => void;
}

export default function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = '输入您的问题…',
  multiline = false,
  quickPrompts,
  onQuickPrompt,
  onClear,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    inputRef.current?.focus({ preventScroll: true });
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (multiline) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (multiline && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value, multiline]);

  const isSendDisabled = !value.trim() || disabled;

  return (
    <div className="space-y-2.5">
      {/* Quick prompts */}
      {quickPrompts && quickPrompts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onQuickPrompt?.(prompt)}
              disabled={disabled}
              className="px-2.5 py-1 text-[11px] font-medium text-gray-500 bg-white border border-gray-200
                         rounded-full hover:border-brand/30 hover:text-brand hover:bg-brand/5
                         transition-all duration-150 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-brand
                         transition-colors ml-auto"
            >
              清空对话
            </button>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {multiline ? (
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15
                         disabled:bg-gray-50 disabled:text-gray-400
                         resize-none transition-all placeholder:text-gray-400"
              style={{ maxHeight: '200px' }}
            />
            {/* Keyboard hint */}
            <span className="absolute right-3 bottom-2.5 text-[10px] text-gray-400 font-mono pointer-events-none hidden sm:flex items-center gap-0.5">
              <CornerDownLeft className="w-3 h-3" />
              <span>发送</span>
              <span className="mx-0.5 text-gray-300">·</span>
              <span>Shift+↩ 换行</span>
            </span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs
                       focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand
                       disabled:bg-gray-50 disabled:text-gray-400 transition-all"
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={isSendDisabled}
          className={`shrink-0 flex items-center justify-center rounded-xl transition-all ${
            multiline
              ? 'w-10 h-10 bg-ink text-white hover:bg-ink/90 disabled:bg-gray-200 disabled:text-gray-400'
              : 'w-9 h-9 bg-ink text-white hover:bg-ink/90 disabled:bg-gray-200 disabled:text-gray-400'
          } disabled:cursor-not-allowed`}
          title="发送"
        >
          {disabled ? (
            <Loader2 className={`${multiline ? 'w-5 h-5' : 'w-4 h-4'} animate-spin`} aria-hidden="true" />
          ) : (
            <Send className={`${multiline ? 'w-4 h-4' : 'w-4 h-4'}`} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
