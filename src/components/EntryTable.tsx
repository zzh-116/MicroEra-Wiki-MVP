import React from 'react';
import { Entry } from '../types/entry';
import { VisibilityBadge } from './VisibilityBadge';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from '../utils/labelMapper';
import { Edit2, Trash2, Eye, Calendar, Folder } from 'lucide-react';

interface EntryTableProps {
  entries: Entry[];
  categories: Record<number, string>;
  onSelect: (id: number) => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  isLoggedIn: boolean;
}

export const EntryTable: React.FC<EntryTableProps> = ({
  entries,
  categories,
  onSelect,
  onEdit,
  onDelete,
  isLoggedIn
}) => {
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return isoString;
    }
  };

  if (entries.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-500">
        暂无匹配内容
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-150 rounded-xl overflow-hidden shadow-xs" id="entry-table-container">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-left text-sm text-gray-700">
          <thead className="bg-gray-50/75 select-none text-xs font-semibold text-gray-400 uppercase tracking-wider font-mono">
            <tr>
              <th scope="col" className="px-6 py-4">条目名称與摘要</th>
              <th scope="col" className="px-6 py-4 w-32">类型</th>
              <th scope="col" className="px-6 py-4 w-36">可见范围</th>
              <th scope="col" className="px-6 py-4 w-32">业务分类</th>
              <th scope="col" className="px-6 py-4 w-32">更新时间</th>
              <th scope="col" className="px-6 py-4 w-28 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {entries.map((entry) => {
              const typeLabel = ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type;
              const typeBadgeColor = ENTRY_TYPE_COLORS[entry.entry_type];
              const catName = entry.category_id ? categories[entry.category_id] : '未分类';

              return (
                <tr 
                  key={entry.id} 
                  className="hover:bg-gray-50/50 transition-colors"
                  id={`entry-table-row-${entry.id}`}
                >
                  <td className="px-6 py-4.5">
                    <div className="font-semibold text-gray-900 group cursor-pointer hover:text-gray-600 inline-block" onClick={() => onSelect(entry.id)}>
                      {entry.title}
                    </div>
                    <p className="text-xs text-gray-400 font-normal line-clamp-1 mt-1 max-w-xl">
                      {entry.summary}
                    </p>
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {entry.tags.map(t => (
                        <span key={t} className="text-[10px] text-gray-400 font-normal px-1 bg-gray-50 border border-gray-100 rounded-sm">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${typeBadgeColor}`}>
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap">
                    <VisibilityBadge visibility={entry.visibility} />
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Folder className="w-3.5 h-3.5 text-gray-400" />
                      {catName}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-xs font-mono text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(entry.updated_at)}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-right text-xs font-medium">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onSelect(entry.id)}
                        className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                        title="查看详情"
                        id={`entry-table-view-${entry.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      
                      {isLoggedIn && (
                        <>
                          {onEdit && (
                            <button
                              onClick={() => onEdit(entry.id)}
                              className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                              title="编辑条目"
                              id={`entry-table-edit-${entry.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => {
                                if (confirm('确认删除此条目？')) {
                                  onDelete(entry.id);
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="删除条目"
                              id={`entry-table-delete-${entry.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
