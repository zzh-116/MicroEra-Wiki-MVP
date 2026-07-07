import React, { useEffect, useState } from 'react';
import { Entry } from '../types/entry';
import { Category } from '../types/category';
import { WikiFile } from '../types/file';
import { DataItem } from '../types/dataItem';
import { entriesApi } from '../api/entriesApi';
import { categoriesApi } from '../api/categoriesApi';
import { filesApi } from '../api/filesApi';
import { dataItemsApi } from '../api/dataItemsApi';
import { VisibilityBadge } from '../components/VisibilityBadge';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from '../utils/labelMapper';
import { FileList } from '../components/FileList';
import { Unauthorized } from '../components/Unauthorized';
import { AiSummarizeButton } from '../components/AiSummarizeButton';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { 
  ArrowLeft, 
  Edit, 
  Calendar, 
  User, 
  FolderOpen, 
  Download, 
  Tag, 
  FileText,
  Boxes,
  Database,
  GitBranch,
  ExternalLink,
  HelpCircle
} from 'lucide-react';

interface EntryDetailPageProps {
  id: number;
  onNavigate: (view: string, details?: any) => void;
  isLoggedIn: boolean;
}

export const EntryDetailPage: React.FC<EntryDetailPageProps> = ({
  id,
  onNavigate,
  isLoggedIn
}) => {
  const { lang, t } = useLanguageTheme();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [dataItem, setDataItem] = useState<DataItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    const fetchDetailData = async () => {
      setLoading(true);
      setUnauthorized(false);
      try {
        const fetchedEntry = await entriesApi.getEntryById(id);
        if (!fetchedEntry) {
          setEntry(null);
          return;
        }
         setEntry(fetchedEntry);

        if (fetchedEntry.category_id) {
          const categories = await categoriesApi.getCategories();
          const found = categories.find((c) => c.id === fetchedEntry.category_id);
          setCategory(found || null);
        }

        const attachments = await filesApi.getFiles(fetchedEntry.id);
        setFiles(attachments);

        if (fetchedEntry.entry_type === 'data_item') {
          const details = await dataItemsApi.getDataItemByEntryId(fetchedEntry.id);
          setDataItem(details);
        }

      } catch (err: any) {
        if (err.message === 'UNAUTHORIZED_INTERNAL_VIEW') {
          setUnauthorized(true);
        } else {
          console.error('Failed to resolve entry details', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDetailData();
  }, [id, isLoggedIn]);

  const handleDownload = (file: WikiFile) => {
    const dialogTitle = lang === 'zh' ? '【MVP 附件传输调用模拟】' : '[MVP Attachment Sync Mock]';
    const reqText = lang === 'zh' ? '正在请求下载原始资源：' : 'Requesting raw asset resources:';
    const nameText = lang === 'zh' ? '文件名：' : 'File Name:';
    const storageText = lang === 'zh' ? '物理存储位置：' : 'Storage Path:';
    const sizeText = lang === 'zh' ? '尺寸量级：' : 'Size:';
    const usageText = lang === 'zh' ? '用途归档分类：' : 'Usage Group:';

    alert(`${dialogTitle}\n${reqText}\n${nameText}${file.original_filename}\n${storageText}${file.storage_path}\n${sizeText}${(file.file_size / 1024).toFixed(1)} KB\n${usageText}${file.usage_type}`);
  };

  const handleEdit = () => {
    if (entry) {
      onNavigate('editor', { editingId: entry.id });
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-brand-indigo border-t-brand-yellow rounded-full animate-spin" />
        <p className="text-theme-muted font-bold text-xs uppercase tracking-widest">{lang === 'zh' ? '安全验证并在解析加密内容...' : 'Verifying permissions and parsing confidentials...'}</p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <Unauthorized
        onGoToLogin={() => onNavigate('login')}
        onGoToHome={() => onNavigate('home')}
      />
    );
  }

  if (!entry) {
    return (
      <div className="max-w-md mx-auto py-16 text-center border border-theme-border rounded-xl bg-theme-card">
        <HelpCircle className="w-12 h-12 text-brand-coral mx-auto mb-4" />
        <h3 className="text-sm font-bold text-theme-text mb-1">{lang === 'zh' ? '未找到条目记录' : 'Archive Entry Not Found'}</h3>
        <p className="text-xs text-theme-muted mb-6">{lang === 'zh' ? '对应的 Wiki 信息主键不存在或已被删除。' : 'The requested catalog item does not exist or has been deleted.'}</p>
        <button
          onClick={() => onNavigate('entries')}
          className="inline-flex items-center gap-1.5 text-xs text-brand-indigo dark:text-brand-yellow bg-theme-bg border border-theme-border px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer hover:bg-brand-indigo/10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('backToCatalog')}</span>
        </button>
      </div>
    );
  }

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
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8" id="entry-detail-container">
      {/* Back button and Edit trigger */}
      <div className="flex items-center justify-between border-b border-theme-border pb-4">
        <button
          onClick={() => onNavigate('entries')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-theme-muted hover:text-theme-text transition-colors cursor-pointer"
          id="btn-detail-back"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('backToCatalog')}</span>
        </button>

        <div className="flex items-center gap-2">
          <AiSummarizeButton entryId={entry?.id || id} />
          {isLoggedIn && (
            <button
              onClick={handleEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer hover:opacity-95"
              id="btn-detail-edit"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>{t('editEntry')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Main Content Pane - Left 8 columns */}
        <div className="lg:col-span-8 space-y-6">
          <div className="space-y-4">
            {/* Meta Tags bar */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold border border-theme-border ${typeBadgeColor}`}>
                {typeLabel}
              </span>
              <VisibilityBadge visibility={entry.visibility} />
              {category && (
                <span className="text-[11px] text-theme-muted font-bold flex items-center gap-1">
                  • 
                  <FolderOpen className="w-3.5 h-3.5 text-brand-coral flex-shrink-0" />
                  {category.name}
                </span>
              )}
            </div>

            {/* Main title */}
            <h1 className="text-xl sm:text-2xl font-extrabold text-theme-text font-sans tracking-tight">
              {entry.title}
            </h1>

            {/* Log information row */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-theme-muted border-b border-theme-border pb-4">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-yellow" />
                <span>{t('lastModified')}: {formatDate(entry.updated_at)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand-coral" />
                <span>{t('authorLabel')}: {t('systemAdmin')}</span>
              </div>
            </div>
          </div>

          {/* Summary Quote Box */}
          {entry.summary && (
            <div className="p-4 bg-brand-indigo/5 border-l-4 border-brand-yellow rounded-r-lg text-theme-text text-xs sm:text-sm leading-relaxed italic">
              “ {entry.summary} ”
            </div>
          )}

          {/* Markdown Content Block */}
          <div className="prose max-w-none text-theme-text leading-relaxed text-xs sm:text-sm whitespace-pre-wrap space-y-4 font-sans border border-theme-border/50 rounded-xl p-5 sm:p-6 bg-theme-card/30" id="entry-main-text-content">
            {entry.content}
          </div>

          {/* Special view expansion for 'asset' type */}
          {entry.entry_type === 'asset' && files.length > 0 && (
            <div className="mt-8 border border-theme-border rounded-xl overflow-hidden shadow-xs bg-[#0b0e1b] pr-1 select-none">
              <div className="p-3 bg-[#05060d] border-b border-theme-border/30 flex items-center justify-between text-xs font-mono text-gray-400 font-bold">
                <span>🖥️ CORPORATE SCHEMA GRAPHIC</span>
                <span className="text-[10px] text-brand-yellow bg-brand-yellow/10 px-1.5 rounded">High Fidelity</span>
              </div>
              
              {/* Material Asset graphic diagrams with perfect color mappings */}
              {files[0].original_filename.includes('business-flow') && (
                <div className="h-56 flex items-center justify-center p-4">
                  <svg viewBox="0 0 400 220" className="w-full max-w-lg h-full">
                    <rect width="100%" height="100%" fill="#0a0f1d" />
                    <defs>
                      <linearGradient id="flowGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#DB5F5B" stopOpacity="0.8" />
                      </linearGradient>
                    </defs>
                    <g transform="translate(10,90)">
                      <rect width="90" height="40" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                      <text x="45" y="24" fill="#cbd5e1" fontSize="10" textAnchor="middle" fontWeight="bold">商务对接 (L1)</text>
                    </g>
                    <g transform="translate(145,90)">
                      <rect width="110" height="40" rx="6" fill="url(#flowGrad2)" stroke="#DB5F5B" strokeWidth="1" />
                      <text x="55" y="24" fill="#ffffff" fontSize="10" textAnchor="middle" fontWeight="bold">高通量算力排班</text>
                    </g>
                    <g transform="translate(300,90)">
                      <rect width="90" height="40" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                      <text x="45" y="24" fill="#cbd5e1" fontSize="10" textAnchor="middle" fontWeight="bold">交付 & 归档反馈</text>
                    </g>
                    <path d="M 100 110 L 145 110" stroke="#475569" strokeWidth="2" fill="none" />
                    <path d="M 255 110 L 300 110" stroke="#DB5F5B" strokeWidth="2" fill="none" />
                    <text x="200" y="40" fill="#F2D760" fontSize="11" textAnchor="middle" fontWeight="bold" letterSpacing="1">MOCK BUSINESS FLOW DIAGRAM</text>
                  </svg>
                </div>
              )}

              {files[0].original_filename.includes('product-image') && (
                <div className="h-56 flex items-center justify-center p-4">
                  <svg viewBox="0 0 400 220" className="w-full max-w-lg h-full">
                    <rect width="100%" height="100%" fill="#090d16" />
                    <circle cx="200" cy="110" r="45" fill="none" stroke="#2B3150" strokeWidth="2" strokeDasharray="5,5" />
                    <circle cx="200" cy="110" r="75" fill="none" stroke="#F2D760" strokeWidth="1" strokeDasharray="2,4" />
                    <circle cx="200" cy="110" r="16" fill="#2B3150" stroke="#F2D760" strokeWidth="1.5" />
                    <text x="200" y="114" fill="#F2D760" fontSize="11" fontWeight="bold" textAnchor="middle">Si</text>
                    <circle cx="160" cy="80" r="10" fill="#DB5F5B" />
                    <text x="160" y="83" fill="#ffffff" fontSize="8" textAnchor="middle">O</text>
                    <circle cx="240" cy="140" r="10" fill="#DB5F5B" />
                    <text x="240" y="143" fill="#ffffff" fontSize="8" textAnchor="middle">O</text>
                    <line x1="200" y1="110" x2="160" y2="80" stroke="#DB5F5B" strokeWidth="1.5" />
                    <line x1="200" y1="110" x2="240" y2="140" stroke="#DB5F5B" strokeWidth="1.5" />
                    <text x="25" y="30" fill="#DB5F5B" fontSize="9" fontWeight="bold" letterSpacing="1">MOLECULAR BOND ORBITAL RENDERING</text>
                  </svg>
                </div>
              )}

              {files[0].original_filename.includes('factory-photo') && (
                <div className="h-56 flex items-center justify-center p-4">
                  <svg viewBox="0 0 400 220" className="w-full max-w-lg h-full">
                    <rect width="100%" height="100%" fill="#060b13" />
                    <rect x="60" y="60" width="125" height="100" rx="4" fill="#1e293b" stroke="#F2D760" strokeWidth="1.5" />
                    <rect x="80" y="80" width="85" height="40" rx="2" fill="#0f172a" stroke="#DB5F5B" strokeWidth="1" />
                    <line x1="120" y1="80" x2="120" y2="120" stroke="#DB5F5B" strokeWidth="2" strokeDasharray="3,3" />
                    <rect x="220" y="50" width="120" height="120" rx="4" fill="#1e293b" stroke="#DB5F5B" strokeWidth="1.5" />
                    <circle cx="280" cy="110" r="30" fill="#0f172a" stroke="#F2D760" strokeWidth="1" />
                    <text x="200" y="30" fill="#F2D760" fontSize="10" textAnchor="middle" fontWeight="bold" letterSpacing="1">微观纪元高精度超分子生产车间示意图</text>
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* Special view expansion for 'data_item' type */}
          {entry.entry_type === 'data_item' && dataItem && (
            <div className="mt-8 border border-theme-border rounded-xl overflow-hidden bg-theme-card shadow-xs">
              <div className="bg-theme-bg/60 border-b border-theme-border px-5 py-3.5 flex items-center gap-2">
                <Database className="w-4.5 h-4.5 text-brand-coral" />
                <h3 className="text-sm font-extrabold text-theme-text font-sans tracking-tight">
                  {lang === 'zh' ? '研发数据结构定义与协作说明' : 'R&D Data Structure Specs & Alignment'}
                </h3>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-theme-muted block font-sans">{lang === 'zh' ? '数据结构唯一名称 (Schema Key)' : 'Unique Schema Key'}</span>
                    <strong className="text-theme-text font-mono text-[11px] bg-theme-bg px-2 py-0.5 border border-theme-border rounded-sm block overflow-x-auto">
                      {dataItem.data_name}
                    </strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-theme-muted block font-sans">{lang === 'zh' ? '基础交换格式 (File Extension)' : 'Exchange Format (File Ext)'}</span>
                    <strong className="text-theme-text uppercase font-mono text-[11px] bg-theme-bg px-2 py-0.5 border border-theme-border rounded-sm block">
                      {dataItem.data_format}
                    </strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-theme-muted block font-sans">{lang === 'zh' ? 'Schema 版本控制 (Commit SemVer)' : 'Schema Version Control'}</span>
                    <strong className="text-theme-text font-mono text-[11px] bg-theme-bg px-2 py-0.5 border border-theme-border rounded-sm flex items-center gap-1">
                      <GitBranch className="w-3 h-3 text-brand-coral" />
                      {dataItem.schema_version}
                    </strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-theme-muted block font-sans">{lang === 'zh' ? '负责人 (Maintainer)' : 'Primary Engineer (Maintainer)'}</span>
                    <strong className="text-theme-text text-[11px] bg-theme-bg px-2 py-0.5 border border-theme-border rounded-sm block">
                      {dataItem.responsible_person}
                    </strong>
                  </div>
                </div>

                <div className="space-y-3.5 border-t border-theme-border pt-4 text-xs sm:text-sm leading-relaxed">
                  {dataItem.data_definition && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-4 text-xs font-sans">
                      <span className="md:col-span-3 text-theme-muted font-bold uppercase">{lang === 'zh' ? '数据应用场景定义' : 'Data Scenario Specs'}</span>
                      <p className="md:col-span-9 text-theme-text font-medium">{dataItem.data_definition}</p>
                    </div>
                  )}

                  {dataItem.schema_description && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-4 text-xs font-sans">
                      <span className="md:col-span-3 text-theme-muted font-bold uppercase">{lang === 'zh' ? '关键字段模型映射 (Schema Map)' : 'Key Field Model Mapping'}</span>
                      <div className="md:col-span-9 bg-theme-bg rounded-lg p-3.5 font-mono text-theme-text text-[11px] leading-relaxed border border-theme-border overflow-x-auto">
                        {dataItem.schema_description}
                      </div>
                    </div>
                  )}

                  {dataItem.storage_description && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-4 text-xs font-sans">
                      <span className="md:col-span-3 text-theme-muted font-bold uppercase">{lang === 'zh' ? '物理存储与调度索引路径' : 'Storage Path & Indexes'}</span>
                      <p className="md:col-span-9 text-theme-text font-mono text-[11px] bg-theme-bg px-2 py-1 rounded inline-block border border-theme-border break-all">
                        {dataItem.storage_description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info - Right 4 columns */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Associated files & materials panel */}
          <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-extrabold text-theme-muted font-mono uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>{t('attachmentsHeader')}</span>
              <span className="bg-theme-bg text-theme-text rounded-full px-2 py-0.5 text-[10px] scale-90 font-bold">
                {files.length} {lang === 'zh' ? '个' : 'Items'}
              </span>
            </h3>

            <FileList
              files={files}
              onDownload={handleDownload}
              isLoggedIn={isLoggedIn}
            />
          </div>

          {/* Tag catalog list */}
          <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-extrabold text-theme-muted font-mono uppercase tracking-wider mb-3.5">
              {t('tagsHeader')}
            </h3>
            {entry.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onNavigate('entries', { tag })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-theme-muted hover:text-theme-text bg-theme-bg border border-theme-border rounded-md transition-colors cursor-pointer"
                  >
                    <Tag className="w-3 h-3 text-brand-coral" />
                    <span>#{tag}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs text-theme-muted italic">{t('noTags')}</span>
            )}
          </div>

          {/* Quick Sandbox Help Alert */}
          <div className="bg-brand-yellow/10 border-2 border-dashed border-brand-yellow/40 rounded-xl p-4.5 space-y-2">
            <h4 className="text-xs font-extrabold text-brand-indigo dark:text-brand-yellow flex items-center gap-1">
              <span>{t('sandboxHintHeader')}</span>
            </h4>
            <p className="text-[11px] text-theme-muted leading-relaxed font-sans">
              {t('sandboxHintDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
