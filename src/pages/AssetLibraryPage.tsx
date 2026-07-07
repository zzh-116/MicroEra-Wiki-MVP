import React, { useEffect, useState } from 'react';
import { Entry } from '../types/entry';
import { WikiFile, UsageType } from '../types/file';
import { entriesApi } from '../api/entriesApi';
import { filesApi } from '../api/filesApi';
import { AssetCard } from '../components/AssetCard';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { FolderLock, Search, Info, DownloadCloud, LogIn, Lock } from 'lucide-react';

interface AssetLibraryPageProps {
  onNavigate: (view: string, details?: any) => void;
  isLoggedIn: boolean;
}

export const AssetLibraryPage: React.FC<AssetLibraryPageProps> = ({
  onNavigate,
  isLoggedIn
}) => {
  const { lang, t } = useLanguageTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [keyword, setKeyword] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedUsage, setSelectedUsage] = useState<UsageType | 'all'>('all');

  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const fetchedEntries = await entriesApi.getEntries({ entry_type: 'asset' });
        const fetchedFiles = await filesApi.getFiles();
        
        setEntries(fetchedEntries);
        setFiles(fetchedFiles);
      } catch (e) {
        console.error('Failed to load asset library contents', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, [isLoggedIn]);

  // Handle simulate download
  const handleDownload = (file: WikiFile) => {
    const titleText = lang === 'zh' ? '【MVP 附件下载模拟】' : '[MVP Media Download Engine]';
    const filenameText = lang === 'zh' ? '正在下载：' : 'Downloading:';
    const sizeText = lang === 'zh' ? '大小：' : 'Size:';
    const typeText = lang === 'zh' ? '类别：' : 'Type:';
    const usageText = lang === 'zh' ? '用途：' : 'Purpose:';

    alert(`${titleText}\n${filenameText}${file.original_filename}\n${sizeText}${(file.file_size / 1024).toFixed(1)} KB\n${typeText}${file.file_type}\n${usageText}${file.usage_type}`);
  };

  const availableTags = Array.from(
    new Set(entries.flatMap((e) => e.tags))
  );

  const filteredEntries = entries.filter((entry) => {
    const kw = keyword.toLowerCase().trim();
    if (kw) {
      const matchTitle = entry.title.toLowerCase().includes(kw);
      const matchSummary = entry.summary.toLowerCase().includes(kw);
      if (!matchTitle && !matchSummary) return false;
    }

    if (selectedTag !== 'all' && !entry.tags.includes(selectedTag)) {
      return false;
    }

    if (selectedUsage !== 'all') {
      const entryFile = files.find((f) => f.entry_id === entry.id);
      if (!entryFile || entryFile.usage_type !== selectedUsage) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6" id="asset-library-container">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-theme-border pb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-theme-text font-sans tracking-tight flex items-center gap-2">
            <FolderLock className="w-5 h-5 text-brand-indigo dark:text-brand-yellow" />
            {t('assetLibraryTitle')}
          </h1>
          <p className="text-xs text-theme-muted mt-1 select-text">
            {t('assetLibraryDesc')}
          </p>
        </div>
      </div>

      {/* Security Protection Guard block if not logged in */}
      {!isLoggedIn && (
        <div className="border border-brand-yellow/30 bg-brand-yellow/10 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all" id="asset-security-banner">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-brand-yellow/25 border border-brand-yellow/40 text-brand-indigo dark:text-brand-yellow rounded-lg flex-shrink-0 mt-0.5">
              <Lock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-theme-text">{t('visitorBannerTitle')}</h3>
              <p className="text-[11px] sm:text-xs text-theme-muted leading-relaxed mt-1">
                {t('visitorBannerDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('login')}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer hover:opacity-95"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{t('btnLoginUnlock')}</span>
          </button>
        </div>
      )}

      {/* Detailed Search Filters panel */}
      <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-4 transition-colors">
        {/* Keyword Search */}
        <div className="md:col-span-6 space-y-1.5">
          <label className="block text-[10px] font-bold text-theme-muted font-mono uppercase tracking-wider select-none">
            {lang === 'zh' ? '搜索素材名称或用途' : 'Search Material Keywords'}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-muted">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 bg-theme-bg hover:bg-theme-bg/85 focus:bg-theme-bg border border-theme-border text-xs text-theme-text font-semibold rounded-lg focus:outline-hidden"
              placeholder={lang === 'zh' ? "搜索：效果图、流程图、厂房..." : "e.g., pipeline, cell structure, photo..."}
              id="asset-txt-search"
            />
          </div>
        </div>

        {/* Usage Select filter */}
        <div className="md:col-span-3 space-y-1.5">
          <label className="block text-[10px] font-bold text-theme-muted font-mono uppercase tracking-wider select-none">
            {t('usageFilterLabel')}
          </label>
          <select
            value={selectedUsage}
            onChange={(e) => setSelectedUsage(e.target.value as any)}
            className="block w-full py-2 px-3 border border-theme-border bg-theme-bg hover:bg-theme-bg/85 rounded-lg text-xs text-theme-text font-semibold cursor-pointer focus:outline-hidden"
            id="asset-select-usage"
          >
            <option value="all">📁 {lang === 'zh' ? '全部用途' : 'All Usages'}</option>
            <option value="PPT素材">{lang === 'zh' ? 'PPT素材 (汇报/演示)' : 'Presentation Deck (PPT)'}</option>
            <option value="宣发素材">{lang === 'zh' ? '宣发素材 (海报/展会)' : 'Marketing Releases (Media)'}</option>
            <option value="客户展示">{lang === 'zh' ? '客户展示 (外访/沙盘)' : 'Sales Showcase (Clients)'}</option>
            <option value="内部归档">{lang === 'zh' ? '内部归档 (文献/档案)' : 'Internal Records (Technical)'}</option>
          </select>
        </div>

        {/* Group Tag filter */}
        <div className="md:col-span-3 space-y-1.5">
          <label className="block text-[10px] font-bold text-theme-muted font-mono uppercase tracking-wider select-none">
            {t('tagFilterLabel')}
          </label>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="block w-full py-2 px-3 border border-theme-border bg-theme-bg hover:bg-theme-bg/85 rounded-lg text-xs text-theme-text font-semibold cursor-pointer focus:outline-hidden"
            id="asset-select-tag"
          >
            <option value="all">🏷️ {lang === 'zh' ? '全部标签' : 'All Tags'}</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Render list content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-theme-card border border-theme-border rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-20 bg-theme-card border border-dashed border-theme-border rounded-xl max-w-sm mx-auto px-4 mt-6">
          <Info className="w-10 h-10 text-theme-muted/40 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-theme-text mb-1">{t('noAssetsFound')}</h3>
          <p className="text-xs text-theme-muted">{t('noAssetsFoundDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="asset-grid-canvas">
          {filteredEntries.map((entry) => {
            const entryFile = files.find((f) => f.entry_id === entry.id);
            return (
              <AssetCard
                key={entry.id}
                entry={entry}
                file={entryFile}
                onSelect={(id) => onNavigate('detail', { id })}
                onDownload={handleDownload}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
