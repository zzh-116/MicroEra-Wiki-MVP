import React, { useState } from 'react';
import { useAi } from '../context/AiContext';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface AiSummarizeButtonProps {
  entryId: number;
}

export const AiSummarizeButton: React.FC<AiSummarizeButtonProps> = ({ entryId }) => {
  const { t } = useLanguageTheme();
  const { summarize, isSummarizing } = useAi();
  const [summary, setSummary] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    setError(null);
    setSummary(null);
    const result = await summarize(entryId);
    if (result) {
      setSummary(result);
      setExpanded(true);
    } else {
      setError(t('aiError'));
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleSummarize}
        disabled={isSummarizing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-brand-yellow/40 bg-brand-yellow/5 text-brand-indigo dark:text-brand-yellow hover:bg-brand-yellow/10 transition-colors cursor-pointer disabled:opacity-50"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>{isSummarizing ? t('aiSummarizing') : t('aiSummarizeBtn')}</span>
      </button>

      {summary && (
        <div className="border border-brand-yellow/30 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-brand-yellow/5 text-xs font-bold text-theme-text cursor-pointer hover:bg-brand-yellow/10 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-yellow" />
              AI 摘要
            </span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {expanded && (
            <div className="px-4 py-3 text-xs text-theme-text leading-relaxed bg-theme-card border-t border-theme-border">
              {summary}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-brand-coral">{error}</p>
      )}
    </div>
  );
};
