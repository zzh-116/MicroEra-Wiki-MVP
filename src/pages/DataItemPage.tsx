import React, { useEffect, useState } from 'react';
import { Entry } from '../types/entry';
import { DataItem } from '../types/dataItem';
import { entriesApi } from '../api/entriesApi';
import { dataItemsApi } from '../api/dataItemsApi';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Database, Search, GitBranch, ShieldAlert, LogIn, Plus, Info, RefreshCw } from 'lucide-react';

interface DataItemPageProps {
  onNavigate: (view: string, details?: any) => void;
  isLoggedIn: boolean;
}

export const DataItemPage: React.FC<DataItemPageProps> = ({
  onNavigate,
  isLoggedIn
}) => {
  const { lang, t } = useLanguageTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dataItems, setDataItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [keyword, setKeyword] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('all');

  const fetchItems = async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fetchedEntries = await entriesApi.getEntries({ entry_type: 'data_item' });
      const fetchedDetails = await dataItemsApi.getDataItems();

      setEntries(fetchedEntries);
      setDataItems(fetchedDetails);
    } catch (e) {
      console.error('Failed to pull data item catalogs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-6" id="data-items-locked-guard">
        <div className="w-16 h-16 bg-brand-coral/10 border border-brand-coral/20 text-brand-coral rounded-full flex items-center justify-center mx-auto shadow-xs animate-bounce">
          <ShieldAlert className="w-8 h-8" />
        </div>
        
        <h2 className="text-xl font-extrabold text-theme-text font-sans tracking-tight">
          {t('lockedGuardTitle')}
        </h2>
        <p className="text-xs sm:text-sm text-theme-muted leading-relaxed max-w-sm mx-auto">
          {t('lockedGuardDesc')}
        </p>

        <button
          onClick={() => onNavigate('login')}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo text-xs sm:text-sm font-extrabold rounded-lg transition-all shadow-sm cursor-pointer hover:opacity-95"
        >
          <LogIn className="w-4 h-4" />
          <span>{t('btnLoginSsoLock')}</span>
        </button>
      </div>
    );
  }

  // Filter lists in client
  const filteredRows = entries.map((entry) => {
    const detail = dataItems.find((itm) => itm.entry_id === entry.id);
    return {
      entry,
      detail
    };
  }).filter(({ entry, detail }) => {
    if (formatFilter !== 'all' && detail) {
      const matchFormat = detail.data_format.toLowerCase().includes(formatFilter.toLowerCase());
      if (!matchFormat) return false;
    }

    const kw = keyword.toLowerCase().trim();
    if (kw) {
      const matchTitle = entry.title.toLowerCase().includes(kw);
      const matchName = detail?.data_name?.toLowerCase().includes(kw) || false;
      const matchDef = detail?.data_definition?.toLowerCase().includes(kw) || false;
      const matchPerson = detail?.responsible_person?.toLowerCase().includes(kw) || false;

      if (!matchTitle && !matchName && !matchDef && !matchPerson) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6" id="data-items-page-container">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-theme-border pb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-theme-text font-sans tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-indigo dark:text-brand-yellow" />
            {t('dataItemTitle')}
          </h1>
          <p className="text-xs text-theme-muted mt-1">
            {t('dataItemDesc')}
          </p>
        </div>

        <button
          onClick={() => onNavigate('editor', { forceType: 'data_item' })}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-lg text-xs font-extrabold transition-all shadow-xs cursor-pointer hover:opacity-95"
        >
          <Plus className="w-4 h-4 text-brand-coral" />
          <span>{t('btnPublishData')}</span>
        </button>
      </div>

      {/* Advanced Filter row */}
      <div className="flex flex-col md:flex-row items-center gap-3 bg-theme-card border border-theme-border rounded-xl p-4 shadow-xs transition-colors">
        {/* Search */}
        <div className="relative flex-grow w-full md:w-auto">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-muted">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 bg-theme-bg hover:bg-theme-bg/85 focus:bg-theme-bg border border-theme-border text-xs text-theme-text font-semibold rounded-lg"
            placeholder={lang === 'zh' ? "搜索数据名称、负责人或业务定义字段..." : "Search schema mappings, maintainer, scenario info..."}
            id="data-item-search-txt"
          />
        </div>

        {/* Format Select Dropdown */}
        <div className="w-full md:w-64">
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-theme-border bg-theme-bg hover:bg-theme-bg/85 text-xs text-theme-text rounded-lg cursor-pointer focus:outline-hidden"
            id="data-item-select-format"
          >
            <option value="all">📁 {lang === 'zh' ? '全部数据底层文件格式' : 'All Shared File Exts'}</option>
            <option value="cif">cif (晶体学多晶结构描述文件)</option>
            <option value="json">json (高阶时序流多维数据契约)</option>
            <option value="sql">sql (物理关系型表底模定义脚本)</option>
            <option value="excel">excel (材料反应条件物理对照表)</option>
            <option value="csv">csv (扁平化学测试反应点分隔表)</option>
          </select>
        </div>
        
        <button
          onClick={fetchItems}
          title={lang === 'zh' ? '刷新数据表' : 'Reload schemas table'}
          className="p-2 border border-theme-border hover:bg-brand-indigo/10 text-theme-muted hover:text-theme-text rounded-lg transition-colors cursor-pointer hidden md:block"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Structured data table list */}
      {loading ? (
        <div className="space-y-3 py-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-theme-card border border-theme-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-20 bg-theme-card border border-dashed border-theme-border rounded-xl max-w-sm mx-auto px-4">
          <Info className="w-10 h-10 text-theme-muted/40 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-theme-text mb-1">{t('noDataItems')}</h3>
          <p className="text-xs text-theme-muted">{lang === 'zh' ? '未发现相符的数据规范。您可以点击右上角发布新的对准条目。' : 'No R&D specs conform to search filters. Create one utilizing the button at the top right.'}</p>
        </div>
      ) : (
        <div className="bg-theme-card border border-theme-border rounded-xl overflow-hidden shadow-xs transition-colors" id="data-items-table-block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-theme-border text-left text-xs sm:text-sm text-theme-text">
              <thead className="bg-theme-bg select-none text-[10px] font-bold text-theme-muted uppercase tracking-wider font-mono">
                <tr>
                  <th scope="col" className="px-6 py-4">{lang === 'zh' ? '文档对准索引项' : 'Wiki Mapping Item'}</th>
                  <th scope="col" className="px-6 py-4">{lang === 'zh' ? '数据字典键 (Key Name)' : 'Unique Schema Key'}</th>
                  <th scope="col" className="px-6 py-4">{lang === 'zh' ? '交换格式' : 'Ext'}</th>
                  <th scope="col" className="px-6 py-4">SemVer Version</th>
                  <th scope="col" className="px-6 py-4">{lang === 'zh' ? '第一负责人 (Maintainer)' : 'Owner / Maintainer'}</th>
                  <th scope="col" className="px-6 py-4">{lang === 'zh' ? '对齐归档时间' : 'Synced Date'}</th>
                  <th scope="col" className="px-6 py-4 text-right">{lang === 'zh' ? '操作' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border bg-theme-card">
                {filteredRows.map(({ entry, detail }) => (
                  <tr 
                    key={entry.id} 
                    className="hover:bg-theme-bg/40 transition-colors"
                    id={`data-item-row-${entry.id}`}
                  >
                    <td className="px-6 py-4 text-xs">
                      <div 
                        className="font-extrabold text-theme-text hover:text-brand-coral cursor-pointer block"
                        onClick={() => onNavigate('detail', { id: entry.id })}
                      >
                        {entry.title}
                      </div>
                      <p className="text-xs text-theme-muted mt-0.5 line-clamp-1 max-w-xs">{entry.summary}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {detail ? (
                        <span className="font-mono text-xs text-theme-text bg-theme-bg border border-theme-border rounded px-2 py-0.5 font-bold">
                          {detail.data_name}
                        </span>
                      ) : (
                        <span className="text-theme-muted italic text-xs">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {detail ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-brand-coral/10 text-brand-coral border-brand-coral/20 uppercase font-mono">
                          {detail.data_format}
                        </span>
                      ) : (
                        <span className="text-theme-muted italic text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {detail ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-theme-text font-semibold">
                          <GitBranch className="w-3.5 h-3.5 text-brand-coral" />
                          {detail.schema_version}
                        </span>
                      ) : (
                        <span className="text-xs text-theme-muted">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-theme-text font-bold">
                      {detail?.responsible_person || (lang === 'zh' ? '未指定' : 'Unassigned')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-theme-muted">
                      {entry.updated_at.split('T')[0]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                      <button
                        onClick={() => onNavigate('detail', { id: entry.id })}
                        className="px-2.5 py-1 bg-theme-bg hover:bg-brand-indigo/10 border border-theme-border rounded transition-all text-xs text-theme-text font-extrabold cursor-pointer"
                        id={`data-item-btn-view-${entry.id}`}
                      >
                        {lang === 'zh' ? '详情' : 'Specs'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
