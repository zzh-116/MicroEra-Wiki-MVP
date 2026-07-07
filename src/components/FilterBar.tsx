import React from 'react';
import { Search, Filter, Tag, LayoutGrid, EyeOff } from 'lucide-react';
import { EntryQueryParams } from '../api/entriesApi';
import { EntryType, VisibilityType } from '../types/entry';
import { ENTRY_TYPE_LABELS } from '../utils/labelMapper';
import { Category } from '../types/category';
import { useLanguageTheme } from '../context/LanguageThemeContext';

interface FilterBarProps {
  queryParams: EntryQueryParams;
  onChange: (params: EntryQueryParams) => void;
  availableTags: string[];
  availableCategories: Category[];
  isLoggedIn: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  queryParams,
  onChange,
  availableTags,
  availableCategories,
  isLoggedIn
}) => {
  const { lang, t } = useLanguageTheme();

  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...queryParams, keyword: e.target.value });
  };

  const handleTypeSelect = (type: EntryType | 'all') => {
    onChange({ ...queryParams, entry_type: type });
  };

  const handleVisibilitySelect = (visibility: VisibilityType | 'all') => {
    onChange({ ...queryParams, visibility });
  };

  const handleCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onChange({
      ...queryParams,
      category_id: val === 'all' ? 'all' : Number(val)
    });
  };

  const handleTagToggle = (tag: string) => {
    if (queryParams.tag === tag) {
      onChange({ ...queryParams, tag: undefined });
    } else {
      onChange({ ...queryParams, tag });
    }
  };

  // Localized Labels helper
  const localizedEntranceLabel = (type: string) => {
    if (lang === 'en') {
      const enLabels: Record<string, string> = {
        'product': 'Product/Services',
        'tech': 'Technical Edge',
        'patent': 'IP Patents',
        'data_item': 'R&D Scheme'
      };
      return enLabels[type] || type;
    }
    return ENTRY_TYPE_LABELS[type] || type;
  };

  return (
    <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-xs flex flex-col gap-4 transition-colors" id="wiki-filter-bar">
      
      {/* Search and Dropdowns Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        {/* Search Input */}
        <div className="relative md:col-span-6">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-muted">
            <Search className="w-4.5 h-4.5" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-4 py-2.5 bg-theme-bg hover:bg-theme-bg/85 focus:bg-theme-bg border border-theme-border focus:border-brand-yellow rounded-lg text-xs sm:text-sm text-theme-text placeholder-theme-muted focus:outline-hidden transition-all"
            placeholder={lang === 'zh' ? "搜索条目标题、摘要、或正文关键字..." : "Search title, abstract, or database keys..."}
            value={queryParams.keyword || ''}
            onChange={handleKeywordChange}
            id="filter-search-input"
          />
        </div>

        {/* Categories select dropdown */}
        <div className="md:col-span-3">
          <div className="relative">
            <select
              value={queryParams.category_id || 'all'}
              onChange={handleCategorySelect}
              className="block w-full pl-3 pr-8 py-2.5 bg-theme-bg hover:bg-theme-bg/85 border border-theme-border rounded-lg text-xs sm:text-sm text-theme-text text-ellipsis overflow-hidden focus:outline-hidden focus:border-brand-yellow transition-all cursor-pointer"
              id="filter-category-select"
            >
              <option value="all">📁 {lang === 'zh' ? '所有分类' : 'All Folders'} {lang === 'en' && '(All Categories)'}</option>
              {availableCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Visibility choice or Guest alert block */}
        <div className="md:col-span-3">
          {isLoggedIn ? (
            <select
              value={queryParams.visibility || 'all'}
              onChange={(e) => handleVisibilitySelect(e.target.value as VisibilityType | 'all')}
              className="block w-full pl-3 pr-8 py-2.5 bg-theme-bg hover:bg-theme-bg/85 border border-theme-border rounded-lg text-xs sm:text-sm text-theme-text focus:outline-hidden focus:border-brand-yellow transition-all cursor-pointer"
              id="filter-visibility-select"
            >
              <option value="all">🔒 {lang === 'zh' ? '所有权限 (公开 + 内部)' : 'All Levels (Public + Internal)'}</option>
              <option value="public">🟢 {lang === 'zh' ? '仅公开' : 'Public only'}</option>
              <option value="internal">🟠 {lang === 'zh' ? '仅内部机密' : 'Internal Confidential only'}</option>
            </select>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-yellow/10 border border-brand-yellow/20 rounded-lg text-[11px] text-brand-indigo dark:text-brand-yellow font-bold select-none">
              <EyeOff className="w-3.5 h-3.5 text-brand-coral flex-shrink-0" />
              <span>{lang === 'zh' ? '访客视图已自动过滤内部机密' : 'Visitor: Confidential items isolated'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Entry Type Selection Pills Row */}
      <div className="border-t border-theme-border pt-4 flex flex-col sm:flex-row sm:items-center gap-3.5">
        <span className="text-[10px] font-bold text-theme-muted uppercase tracking-wider font-mono flex items-center gap-1.5 min-w-[80px]">
          <LayoutGrid className="w-3.5 h-3.5 text-brand-coral" />
          <span>{lang === 'zh' ? '条目分类' : 'Category Type'}</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => handleTypeSelect('all')}
            className={`px-3 py-1 bg-theme-bg rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              queryParams.entry_type === 'all' || !queryParams.entry_type
                ? 'bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo border-brand-indigo'
                : 'text-theme-muted border-theme-border hover:text-theme-text'
            }`}
            id="filter-type-all"
          >
            {lang === 'zh' ? '全部类型' : 'All Types'}
          </button>
          {(Object.keys(ENTRY_TYPE_LABELS) as EntryType[]).map((type) => {
            const label = localizedEntranceLabel(type);
            const isSelected = queryParams.entry_type === type;
            return (
              <button
                key={type}
                onClick={() => handleTypeSelect(type)}
                className={`px-3 py-1 bg-theme-bg rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo border-brand-indigo'
                    : 'text-theme-muted border-theme-border hover:text-theme-text'
                }`}
                id={`filter-type-${type}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Available Tags Row */}
      {availableTags.length > 0 && (
        <div className="border-t border-theme-border pt-3.5 flex flex-col sm:flex-row sm:items-start gap-3.5">
          <span className="text-[10px] font-bold text-theme-muted uppercase tracking-wider font-mono flex items-center gap-1.5 min-w-[80px] mt-1 select-none">
            <Tag className="w-3.5 h-3.5 text-brand-yellow" />
            <span>{lang === 'zh' ? '检索标签' : 'Search Tags'}</span>
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {availableTags.map((tag) => {
              const isSelected = queryParams.tag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo border-brand-indigo'
                      : 'bg-theme-bg text-theme-muted border-theme-border hover:text-theme-text'
                  }`}
                  id={`filter-tag-pill-${tag}`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
