import React, { useEffect, useState } from 'react';
import { Entry } from '../types/entry';
import { Category } from '../types/category';
import { Tag } from '../types/tag';
import { entriesApi, EntryQueryParams } from '../api/entriesApi';
import { categoriesApi } from '../api/categoriesApi';
import { tagsApi } from '../api/tagsApi';
import { FilterBar } from '../components/FilterBar';
import { EntryCard } from '../components/EntryCard';
import { EntryTable } from '../components/EntryTable';
import { AiSearchToggle } from '../components/AiSearchToggle';
import { AiSearchResults } from '../components/AiSearchResults';
import { useAi } from '../context/AiContext';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { LayoutGrid, List, Plus, Archive, ShieldCheck, HelpCircle, Search } from 'lucide-react';

interface EntryListPageProps {
  initialFilters?: Partial<EntryQueryParams>;
  onNavigate: (view: string, details?: any) => void;
  isLoggedIn: boolean;
}

export const EntryListPage: React.FC<EntryListPageProps> = ({
  initialFilters,
  onNavigate,
  isLoggedIn
}) => {
  const { lang, t } = useLanguageTheme();
  const { aiSearch, isSearching, searchError } = useAi();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // AI search state
  const [aiSearchEnabled, setAiSearchEnabled] = useState(false);
  const [aiResults, setAiResults] = useState<Entry[]>([]);
  const [aiSource, setAiSource] = useState<string | undefined>();
  const [aiQuery, setAiQuery] = useState('');

  // Load state filters
  const [filters, setFilters] = useState<EntryQueryParams>({
    keyword: '',
    entry_type: 'all',
    visibility: 'all',
    category_id: 'all',
    tag: undefined,
    ...initialFilters
  });

  // Watch for navbar clicks or direct overrides
  useEffect(() => {
    if (initialFilters) {
      setFilters((prev) => ({
        ...prev,
        ...initialFilters
      }));
    }
  }, [initialFilters]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedEntries, fetchedCategories, fetchedTags] = await Promise.all([
        entriesApi.getEntries(filters),
        categoriesApi.getCategories(),
        tagsApi.getTags()
      ]);
      setEntries(fetchedEntries);
      setCategories(fetchedCategories);
      setTags(fetchedTags);
    } catch (e) {
      console.error('Failed to query entries list', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters, isLoggedIn]); // Re-run when filters or auth states change

  const handleAiSearch = async (query: string) => {
    if (!query.trim()) {
      setAiResults([]);
      return;
    }
    const results = await aiSearch(query);
    setAiResults(results);
    setAiSource(undefined); // will be set by the API response
  };

  const handleAiToggle = (enabled: boolean) => {
    console.log('[EntryListPage] handleAiToggle called, enabled:', enabled);
    setAiSearchEnabled(enabled);
    if (!enabled) {
      setAiResults([]);
      setAiQuery('');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await entriesApi.deleteEntry(id);
      loadData();
    } catch (e) {
      alert(lang === 'zh' ? '删除失败，可能没有权限！' : 'Deletion failed: permission denied.');
    }
  };

  const handleEdit = (id: number) => {
    onNavigate('editor', { editingId: id });
  };

  const categoryMap = categories.reduce<Record<number, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  const tagNamesList = tags.map((t) => t.name);

  return (
    <div className="space-y-6" id="entry-list-page-container">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-theme-border pb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-theme-text font-sans tracking-tight flex items-center gap-2">
            <Archive className="w-5 h-5 text-brand-indigo dark:text-brand-yellow" />
            {t('catalogTitle')}
          </h1>
          <p className="text-xs text-theme-muted mt-1 max-w-2xl">
            {t('catalogDesc')}
          </p>
        </div>

        {/* View toggles and editor creation */}
        <div className="flex items-center gap-2.5 self-start sm:self-center">
          {/* AI Search toggle */}
          <AiSearchToggle enabled={aiSearchEnabled} onToggle={handleAiToggle} />

          {/* View mode toggle */}
          <div className="flex items-center bg-theme-card border border-theme-border p-1 rounded-lg text-theme-muted">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-brand-indigo text-brand-yellow font-bold shadow-xs' : 'hover:text-theme-text'
              }`}
              title={lang === 'zh' ? '网格卡片' : 'Grid Layout'}
              id="btn-view-mode-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-brand-indigo text-brand-yellow font-bold shadow-xs' : 'hover:text-theme-text'
              }`}
              title={lang === 'zh' ? '列表表格' : 'Table List'}
              id="btn-view-mode-table"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {isLoggedIn ? (
            <button
              onClick={() => onNavigate('editor')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer hover:opacity-90"
              id="btn-create-entry-top"
            >
              <Plus className="w-4 h-4" />
              <span>{t('btnCreateEntry')}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-yellow/10 text-brand-indigo dark:text-brand-yellow border border-brand-yellow/20 rounded-lg text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-coral" />
              <span>{t('loginToManage')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter component — hidden when AI search is active */}
      {!aiSearchEnabled && (
        <FilterBar
          queryParams={filters}
          onChange={setFilters}
          availableTags={tagNamesList}
          availableCategories={categories}
          isLoggedIn={isLoggedIn}
        />
      )}

      {/* AI Search input — shown when AI search is active */}
      {aiSearchEnabled && (
        <div className="bg-theme-card border border-theme-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAiSearch(aiQuery); }}
                placeholder={t('aiSearchPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-theme-border rounded-lg bg-theme-bg text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-brand-yellow"
              />
            </div>
            <button
              onClick={() => handleAiSearch(aiQuery)}
              disabled={isSearching || !aiQuery.trim()}
              className="px-4 py-2.5 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-lg text-sm font-bold cursor-pointer hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {t('aiSearchBtn')}
            </button>
          </div>
          {searchError && (
            <p className="text-xs text-brand-coral">{searchError}</p>
          )}
        </div>
      )}

      {/* Active filters indicators — only when NOT in AI search mode */}
      {!aiSearchEnabled && (filters.entry_type !== 'all' || filters.visibility !== 'all' || filters.category_id !== 'all' || filters.tag || filters.keyword) && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-theme-muted">
          <span>{t('activeFilters')}</span>
          {filters.keyword && <span className="bg-brand-indigo/10 text-brand-indigo dark:text-brand-yellow px-2 py-0.5 rounded-md text-[11px] font-semibold">Keyword: "{filters.keyword}"</span>}
          {filters.entry_type && filters.entry_type !== 'all' && <span className="bg-brand-indigo/10 text-brand-indigo dark:text-brand-yellow px-2 py-0.5 rounded-md text-[11px] font-semibold">Type: {filters.entry_type}</span>}
          {filters.visibility && filters.visibility !== 'all' && <span className="bg-brand-indigo/10 text-brand-indigo dark:text-brand-yellow px-2 py-0.5 rounded-md text-[11px] font-semibold">Strictness: {filters.visibility}</span>}
          {filters.category_id && filters.category_id !== 'all' && <span className="bg-brand-indigo/10 text-brand-indigo dark:text-brand-yellow px-2 py-0.5 rounded-md text-[11px] font-semibold">Category: #{filters.category_id}</span>}
          {filters.tag && <span className="bg-brand-indigo/10 text-brand-indigo dark:text-brand-yellow px-2 py-0.5 rounded-md text-[11px] font-semibold">Tag: #{filters.tag}</span>}
          <button
            onClick={() => setFilters({ keyword: '', entry_type: 'all', visibility: 'all', category_id: 'all', tag: undefined })}
            className="text-brand-coral font-extrabold underline hover:opacity-85 ml-1.5 cursor-pointer"
            id="btn-clear-all-filters"
          >
            {t('resetAll')}
          </button>
        </div>
      )}

      {/* Render Main Content Area */}
      {aiSearchEnabled ? (
        <AiSearchResults
          results={aiResults}
          loading={isSearching}
          source={aiSource}
          viewMode={viewMode}
          categoryMap={categoryMap}
          onSelect={(id) => onNavigate('detail', { id })}
          isLoggedIn={isLoggedIn}
          onEdit={isLoggedIn ? handleEdit : undefined}
          onDelete={isLoggedIn ? handleDelete : undefined}
        />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 py-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-theme-card border border-theme-border h-48 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 bg-theme-card border border-dashed border-theme-border rounded-xl max-w-xl mx-auto px-4 mt-8">
          <HelpCircle className="w-12 h-12 text-theme-muted/40 mx-auto mb-3.5" />
          <h3 className="text-sm font-extrabold text-theme-text mb-1.5">{t('noFilteredResult')}</h3>
          <p className="text-xs text-theme-muted max-w-xs mx-auto leading-relaxed">
            {t('noFilteredResultDesc')}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="entry-grid-rendering">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              categoryName={categoryMap[entry.category_id || 0] || 'Uncategorized'}
              onSelect={(id) => onNavigate('detail', { id })}
              onEdit={isLoggedIn ? handleEdit : undefined}
              onDelete={isLoggedIn ? handleDelete : undefined}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </div>
      ) : (
        <EntryTable
          entries={entries}
          categories={categoryMap}
          onSelect={(id) => onNavigate('detail', { id })}
          onEdit={isLoggedIn ? handleEdit : undefined}
          onDelete={isLoggedIn ? handleDelete : undefined}
          isLoggedIn={isLoggedIn}
        />
      )}
    </div>
  );
};
