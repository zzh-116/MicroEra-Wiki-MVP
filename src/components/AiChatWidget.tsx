import React, { useState, useRef, useEffect } from 'react';
import { useAi } from '../context/AiContext';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

export const AiChatWidget: React.FC = () => {
  const { t } = useLanguageTheme();
  const { chatHistory, isChatting, sendChat, clearChat } = useAi();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isChatting) return;
    setInput('');
    await sendChat(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-center justify-center"
        title={t('aiChatTitle')}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 h-[500px] max-h-[calc(100vh-140px)] bg-theme-card border border-theme-border rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border bg-brand-indigo dark:bg-brand-indigo/90 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-yellow" />
              <span className="text-sm font-bold">{t('aiChatTitle')}</span>
            </div>
            <button
              onClick={() => { clearChat(); setIsOpen(false); }}
              className="text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-theme-bg" translate="no">
            {chatHistory.length === 0 ? (
              <div className="text-xs text-theme-muted leading-relaxed p-3 bg-brand-indigo/5 rounded-lg border border-theme-border">
                <Sparkles className="w-4 h-4 text-brand-yellow inline mr-1.5 mb-0.5" />
                {t('aiChatWelcome')}
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-br-sm'
                        : 'bg-theme-card border border-theme-border text-theme-text rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {isChatting && (
              <div className="flex justify-start">
                <div className="bg-theme-card border border-theme-border text-theme-muted rounded-xl rounded-bl-sm px-3.5 py-2 text-xs animate-pulse">
                  {t('aiChatThinking')}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-theme-border bg-theme-card">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('aiChatPlaceholder')}
                disabled={isChatting}
                translate="no"
                className="flex-1 px-3 py-2 text-xs border border-theme-border rounded-lg bg-theme-bg text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-brand-yellow disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isChatting}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo disabled:opacity-40 cursor-pointer transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
