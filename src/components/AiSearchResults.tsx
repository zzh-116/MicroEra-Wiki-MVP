import React from 'react';
import { Entry } from '../types/entry';
import { EntryCard } from './EntryCard';
import { EntryTable } from './EntryTable';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Sparkles, Loader } from 'lucide-react';

interface AiSearchResultsProps {
  results: Entry[];
  loading: boolean;
  source?: string;
  viewMode: 'grid' | 'table';
  categoryMap: Record<number, string>;
  onSelect: (id: number) => void;
  isLoggedIn: boolean;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export const AiSearchResults: React.FC<AiSearchResultsProps> = ({
  results,
  loading,
  source,
  viewMode,
  categoryMap,
  onSelect,
  isLoggedIn,
  onEdit,
  onDelete,
}) => {
  const { t } = useLanguageTheme();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-brand-indigo/20 border-t-brand-yellow rounded-full animate-spin" />
          <Sparkles className="w-5 h-5 text-brand-yellow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-xs text-theme-muted font-bold font-mono uppercase tracking-wider">
          {t('aiSearching')}
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-theme-border rounded-xl bg-theme-card">
        <Sparkles className="w-10 h-10 text-theme-muted/30 mx-auto mb-3" />
        <p className="text-xs text-theme-muted">{t('noFilteredResult')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Source badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-brand-yellow/10 text-brand-indigo dark:text-brand-yellow border border-brand-yellow/30">
          <Sparkles className="w-3 h-3" />
          {source === 'keyword_fallback' ? t('aiSearchFallback') : 'AI'}
        </span>
        <span className="text-[10px] text-theme-muted">{results.length} 条结果</span>
      </div>

      {/* Results */}
      {viewMode === 'table' ? (
        <EntryTable
          entries={results}
          categoryMap={categoryMap}
          onSelect={onSelect}
          isLoggedIn={isLoggedIn}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              categoryName={categoryMap[entry.category_id || 0] || 'Uncategorized'}
              onSelect={(id) => onSelect(id)}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </div>
      )}
    </div>
  );
};
