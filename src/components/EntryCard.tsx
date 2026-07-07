import React from 'react';
import { Entry } from '../types/entry';
import { VisibilityBadge } from './VisibilityBadge';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from '../utils/labelMapper';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Calendar, Tag, ArrowRight, Edit, Trash2 } from 'lucide-react';

interface EntryCardProps {
  entry: Entry;
  categoryName?: string;
  onSelect: (id: number) => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  isLoggedIn: boolean;
}

export const EntryCard: React.FC<EntryCardProps> = ({
  entry,
  categoryName,
  onSelect,
  onEdit,
  onDelete,
  isLoggedIn
}) => {
  const { lang } = useLanguageTheme();
  
  // Localized label for entry_type
  const getTypeLabel = (type: string) => {
    if (lang === 'en') {
      const enLabels: Record<string, string> = {
        'product': 'Business Code/Product',
        'tech': 'Technical Secret/Edge',
        'patent': 'IP Patent Record',
        'data_item': 'Subshell R&D Data'
      };
      return enLabels[type] || type;
    }
    return ENTRY_TYPE_LABELS[type] || type;
  };

  const typeLabel = getTypeLabel(entry.entry_type);
  const typeBadgeColor = ENTRY_TYPE_COLORS[entry.entry_type] || 'bg-brand-indigo/10 text-brand-indigo';

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div
      className="bg-theme-card border border-theme-border rounded-xl p-5 hover:border-brand-yellow hover:shadow-md transition-all flex flex-col justify-between"
      id={`entry-card-${entry.id}`}
    >
      <div>
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2 mb-3.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border border-theme-border ${typeBadgeColor}`}>
            {typeLabel}
          </span>
          <VisibilityBadge visibility={entry.visibility} />
          {categoryName && (
            <span className="text-[10px] text-theme-muted font-bold select-none">
              • {categoryName}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm sm:text-base font-extrabold text-theme-text hover:text-brand-coral mb-2 line-clamp-1 font-sans tracking-tight">
          {entry.title}
        </h3>

        {/* Summary text */}
        <p className="text-xs sm:text-sm text-theme-muted line-clamp-2 leading-relaxed mb-4">
          {entry.summary || (lang === 'zh' ? '暂无条目描述说明...' : 'No context description available...')}
        </p>
      </div>

      <div className="border-t border-theme-border pt-4 mt-2">
        {/* Footer Tags & Date row */}
        <div className="flex items-center justify-between gap-2 mb-3.5 text-xs text-theme-muted">
          <div className="flex items-center gap-1.5 font-mono">
            <Calendar className="w-3.5 h-3.5 text-theme-muted/75" />
            <span>{formatDate(entry.updated_at)}</span>
          </div>

          <div className="flex items-center gap-1.5 max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap">
            <Tag className="w-3.5 h-3.5 text-theme-muted/50 flex-shrink-0" />
            <span className="text-[10px] text-theme-muted font-medium overflow-hidden text-ellipsis">
              {entry.tags.length > 0 ? entry.tags.join(', ') : (lang === 'zh' ? '无标签' : 'No tags')}
            </span>
          </div>
        </div>

        {/* CTA Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSelect(entry.id)}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-indigo dark:text-brand-yellow hover:translate-x-1 transition-transform cursor-pointer"
            id={`entry-card-btn-view-${entry.id}`}
          >
            <span>{lang === 'zh' ? '查看详情' : 'Read Detail'}</span>
            <ArrowRight className="w-3.5 h-3.5 text-brand-coral" />
          </button>

          {isLoggedIn && (onEdit || onDelete) && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(entry.id)}
                  title={lang === 'zh' ? '编辑条目' : 'Edit Entry'}
                  className="p-1.5 hover:bg-brand-indigo/10 hover:text-brand-indigo text-theme-muted rounded-md transition-colors cursor-pointer"
                  id={`entry-card-btn-edit-${entry.id}`}
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    const message = lang === 'zh' ? '确认删除此条目？该操作无法恢复。' : 'Are you sure you want to delete this track? This action is irreversible.';
                    if (confirm(message)) {
                      onDelete(entry.id);
                    }
                  }}
                  title={lang === 'zh' ? '删除条目' : 'Delete Entry'}
                  className="p-1.5 hover:bg-brand-coral/10 hover:text-brand-coral text-theme-muted rounded-md transition-colors cursor-pointer"
                  id={`entry-card-btn-delete-${entry.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
