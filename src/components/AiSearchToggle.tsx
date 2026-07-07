import React from 'react';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Sparkles, Search } from 'lucide-react';

interface AiSearchToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AiSearchToggle: React.FC<AiSearchToggleProps> = ({ enabled, onToggle }) => {
  const { t } = useLanguageTheme();

  return (
    <div className="flex items-center gap-2">
      <button
        id="btn-ai-search-toggle"
        onClick={() => {
          console.log('[AiSearchToggle] Clicked, current enabled:', enabled, '→ toggling to:', !enabled);
          onToggle(!enabled);
        }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all cursor-pointer ${
          enabled
            ? 'bg-brand-yellow/20 border-brand-yellow text-brand-indigo dark:text-brand-yellow shadow-[0_0_8px_rgba(242,215,96,0.3)]'
            : 'bg-theme-card border-theme-border text-theme-muted hover:border-brand-yellow/40'
        }`}
      >
        {enabled ? (
          <Sparkles className="w-3.5 h-3.5 text-brand-yellow" />
        ) : (
          <Search className="w-3.5 h-3.5" />
        )}
        <span>{t('aiSearchToggle')}</span>
      </button>
    </div>
  );
};
