import React, { useEffect, useState } from 'react';
import { Entry, EntryType, VisibilityType } from '../types/entry';
import { Category } from '../types/category';
import { UsageType } from '../types/file';
import { entriesApi } from '../api/entriesApi';
import { categoriesApi } from '../api/categoriesApi';
import { filesApi } from '../api/filesApi';
import { dataItemsApi } from '../api/dataItemsApi';
import { FileUpload } from '../components/FileUpload';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { 
  Save, 
  X, 
  PlusSquare, 
  Info, 
  Database, 
  Paperclip, 
  FileCheck,
  ShieldCheck,
  HelpCircle,
  Eye,
  AlertTriangle
} from 'lucide-react';

interface EntryEditorPageProps {
  editingId?: number;
  forceType?: EntryType;
  onNavigate: (view: string, details?: any) => void;
  isLoggedIn: boolean;
}

export const EntryEditorPage: React.FC<EntryEditorPageProps> = ({
  editingId,
  forceType,
  onNavigate,
  isLoggedIn
}) => {
  const { lang, t } = useLanguageTheme();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Core Form State
  const [title, setTitle] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('product');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<VisibilityType>('public');
  const [categoryId, setCategoryId] = useState<number>(2); // Default to product category
  const [tagsInput, setTagsInput] = useState('');

  // Attached File State (for simulation)
  const [fileToAttach, setFileToAttach] = useState<{ name: string; size: number; type: string } | null>(null);
  const [attachmentUsage, setAttachmentUsage] = useState<UsageType>('PPT素材');

  // Extended Data Item Form State (conditional)
  const [dataName, setDataName] = useState('');
  const [dataFormat, setDataFormat] = useState('json');
  const [schemaVersion, setSchemaVersion] = useState('v1.0');
  const [responsiblePerson, setResponsiblePerson] = useState('研发团队');
  const [schemaDescription, setSchemaDescription] = useState('');
  const [storageDescription, setStorageDescription] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      onNavigate('login');
      return;
    }

    const loadEditorMeta = async () => {
      try {
        const fetchedCats = await categoriesApi.getCategories();
        setCategories(fetchedCats);

        if (editingId) {
          const entry = await entriesApi.getEntryById(editingId);
          if (entry) {
            setTitle(entry.title);
            setEntryType(entry.entry_type);
            setSummary(entry.summary);
            setContent(entry.content);
            setVisibility(entry.visibility);
            setCategoryId(entry.category_id || 1);
            setTagsInput(entry.tags.join(', '));

            if (entry.entry_type === 'data_item') {
              const details = await dataItemsApi.getDataItemByEntryId(entry.id);
              if (details) {
                setDataName(details.data_name);
                setDataFormat(details.data_format);
                setSchemaVersion(details.schema_version);
                setResponsiblePerson(details.responsible_person);
                setSchemaDescription(details.schema_description || '');
                setStorageDescription(details.storage_description || '');
              }
            }
          }
        } else if (forceType) {
          setEntryType(forceType);
          if (forceType === 'data_item') {
            setCategoryId(5); // Data Items category
          } else if (forceType === 'asset') {
            setCategoryId(1); // Showcase category
          }
        }
      } catch (e) {
        console.error('Failed to prepare edit form metadata', e);
      }
    };

    loadEditorMeta();
  }, [editingId, forceType, isLoggedIn]);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || !content.trim()) {
      setErrorMsg(lang === 'zh' ? '请填写完整的标题、摘要与详细正文内容。' : 'Please provide complete title, summary, and article body.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const entryPayload = {
        title: title.trim(),
        entry_type: entryType,
        summary: summary.trim(),
        content: content.trim(),
        visibility,
        category_id: Number(categoryId),
        tags
      };

      let entryId: number;

      if (editingId) {
        await entriesApi.updateEntry(editingId, entryPayload);
        entryId = editingId;
      } else {
        const newEntry = await entriesApi.createEntry(entryPayload);
        entryId = newEntry.id;
      }

      if (entryType === 'data_item') {
        await dataItemsApi.saveDataItem({
          entry_id: entryId,
          data_name: dataName.trim() || 'CustomDataScheme',
          data_definition: summary.trim(),
          data_format: dataFormat,
          schema_version: schemaVersion.trim() || 'v1.0',
          responsible_person: responsiblePerson.trim() || '架构组',
          schema_description: schemaDescription.trim(),
          storage_description: storageDescription.trim()
        });
      }

      if (fileToAttach) {
        await filesApi.uploadFile(
          fileToAttach,
          entryId,
          attachmentUsage
        );
      }

      onNavigate('entries');

    } catch (err: any) {
      setErrorMsg(lang === 'zh' ? '保存修改时发生服务器模拟抛错：' + err.message : 'Error writing to virtual database table: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUploadMock = (file: { name: string; size: number; type: string }) => {
    setFileToAttach(file);
  };

  const handleTypeChange = (type: EntryType) => {
    setEntryType(type);
    if (type === 'data_item') {
      setCategoryId(5);
    } else if (type === 'asset') {
      setCategoryId(1);
    } else if (type === 'patent') {
      setCategoryId(4);
    } else if (type === 'tech') {
      setCategoryId(3);
    } else {
      setCategoryId(2);
    }
  };

  const formHeadline = editingId 
    ? (lang === 'zh' ? '编辑现有企业知识对齐条目' : 'Update Enterprise Knowledge Entry') 
    : (lang === 'zh' ? '起草公布新信息资产 & 知识库档案' : 'Publish New Knowledge Asset');

  return (
    <div className="max-w-4xl mx-auto space-y-6" id="entry-editor-form-pane">
      {/* Form Header */}
      <div className="flex items-center justify-between border-b border-theme-border pb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-theme-text font-sans tracking-tight flex items-center gap-2">
            <PlusSquare className="w-5 h-5 text-brand-indigo dark:text-brand-yellow" />
            {formHeadline}
          </h1>
          <p className="text-xs text-theme-muted mt-1">
            {lang === 'zh' 
              ? '起草编辑完成后，数据将保存在本地数据库中，供本团队极速协同检索。' 
              : 'Once created or modified, items will instantly bind with mock tables for validation.'}
          </p>
        </div>

        <button
          onClick={() => onNavigate('entries')}
          className="inline-flex items-center gap-1 px-3 py-1.5 border border-theme-border bg-theme-bg hover:bg-brand-indigo/10 text-theme-text rounded-lg text-xs font-bold transition-all cursor-pointer"
        >
          <X className="w-4 h-4 text-brand-coral" />
          <span>{lang === 'zh' ? '取消并返回' : 'Cancel' }</span>
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2.5 p-4 bg-brand-coral/10 border border-brand-coral/20 text-brand-coral text-xs rounded-xl" id="editor-error-alert">
          <AlertTriangle className="w-4.5 h-4.5 flex-shrink-0" />
          <span className="font-extrabold">{errorMsg}</span>
        </div>
      )}

      {/* Editor Body Grid Form */}
      <form onSubmit={handleCreateOrUpdate} className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
        {/* Core Informational block of entry - Left 8 columns */}
        <div className="lg:col-span-8 bg-theme-card border border-theme-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5 transition-colors">
          
          {/* Title column */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider" htmlFor="editor-title">
              {lang === 'zh' ? '条目公开标题 *' : 'Entry Document Title *'}
            </label>
            <input
              type="text"
              id="editor-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block w-full px-3.5 py-2.5 bg-theme-bg hover:bg-theme-bg/85 focus:bg-theme-bg/95 border border-theme-border focus:border-brand-yellow rounded-lg text-xs sm:text-sm text-theme-text font-semibold focus:outline-hidden transition-all duration-150"
              placeholder={lang === 'zh' ? "请输入清晰且具辨识度的条目全名，如：薄膜原子物理沉积参数规范" : "e.g., Silicon-Titanium High Vac Deposition Specs"}
            />
          </div>

          {/* Type option selects & Scope Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider" htmlFor="editor-type">
                {lang === 'zh' ? 'Wiki 专栏分组 *' : 'Knowledge Column *'}
              </label>
              <select
                id="editor-type"
                value={entryType}
                onChange={(e) => handleTypeChange(e.target.value as EntryType)}
                className="block w-full py-2.5 px-3 border border-theme-border bg-theme-bg text-xs text-theme-text font-semibold rounded-lg cursor-pointer focus:outline-hidden"
              >
                <option value="product">🏢 {lang === 'zh' ? '产品与业务介绍' : 'Products & Services Core'}</option>
                <option value="tech">⚙️ {lang === 'zh' ? '技术研发能力' : 'R&D Technical Edge'}</option>
                <option value="patent">📜 {lang === 'zh' ? '学术/专利软著成果' : 'IP Patents & Seminars'}</option>
                <option value="asset">🎨 {lang === 'zh' ? '内部高保真展示图解' : 'Showcase Media/Slides Chart'}</option>
                <option value="data_item">🧬 {lang === 'zh' ? '研发协作对齐数据' : 'Joint Database Schema Key'}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider" htmlFor="editor-visibility">
                {lang === 'zh' ? '访问可见控制 *' : 'Privacy Protection level *'}
              </label>
              <select
                id="editor-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as VisibilityType)}
                className="block w-full py-2.5 px-3 border border-theme-border bg-theme-bg text-xs text-theme-text font-semibold rounded-lg cursor-pointer focus:outline-hidden"
              >
                <option value="public">🟢 {lang === 'zh' ? '完全公开视图（未认证访客可读）' : 'Guest Public (Visible to clients & visitors)'}</option>
                <option value="internal">🟠 {lang === 'zh' ? '仅内部授权查看（需 LDAP 账户）' : 'Internal Secure SSP (L2 Authenticated)'}</option>
              </select>
            </div>
          </div>

          {/* Abstract summary textbox */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider" htmlFor="editor-summary">
              {lang === 'zh' ? '场景摘要描述 *' : 'Short Context Summary *'}
            </label>
            <textarea
              id="editor-summary"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="block w-full px-3.5 py-2.5 bg-theme-bg hover:bg-theme-bg/85 focus:bg-theme-bg border border-theme-border text-xs sm:text-sm text-theme-text font-semibold focus:outline-hidden transition-all duration-150 leading-relaxed"
              placeholder={lang === 'zh' ? "简短描述该内容的应用场景、目标等..." : "Write a simplified abstract of this item..."}
            />
          </div>

          {/* Detailed visual inputs for DATA_ITEM subclass only */}
          {entryType === 'data_item' && (
            <div className="border border-brand-yellow/30 bg-brand-yellow/5 rounded-xl p-4 space-y-4 font-sans" id="editor-data-item-details-pane">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-indigo dark:text-brand-yellow">
                <Database className="w-4.5 h-4.5 text-brand-coral" />
                <span>{lang === 'zh' ? '🧬 研发对齐数据库 Schema 扩展层字段（核心预留）' : '🧬 R&D Database Schema Extension Fields (Reserved)'}</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-theme-muted font-bold block">{lang === 'zh' ? '数据契约唯一主键（Schema Key Name）' : 'Schema Key Name'}</span>
                  <input
                    type="text"
                    value={dataName}
                    onChange={(e) => setDataName(e.target.value)}
                    placeholder="e.g. BravaisMolecularRef"
                    className="block w-full px-2.5 py-1.5 border border-theme-border bg-theme-bg text-xs text-theme-text rounded-md font-semibold"
                  />
                </div>
                
                <div className="space-y-1">
                  <span className="text-[10px] text-theme-muted font-bold block">{lang === 'zh' ? '基本传输格式' : 'Exchange Format'}</span>
                  <select
                    value={dataFormat}
                    onChange={(e) => setDataFormat(e.target.value)}
                    className="block w-full px-2 py-1.5 border border-theme-border bg-theme-bg text-xs text-theme-text font-semibold rounded-md"
                  >
                    <option value="cif">cif (晶体学空间位置定义)</option>
                    <option value="json">json (高阶序列时序契约)</option>
                    <option value="sql">sql (物理关系数据底模文件)</option>
                    <option value="excel">excel (材料反应条件对照表)</option>
                    <option value="csv">csv (平铺行反应单元隔离表)</option>
                    <option value="txt">txt (自由非结构化数据文件)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-theme-muted font-bold block">{lang === 'zh' ? '开发对接负责人 (Maintainer)' : 'Owner / Maintainer'}</span>
                  <input
                    type="text"
                    value={responsiblePerson}
                    onChange={(e) => setResponsiblePerson(e.target.value)}
                    placeholder="A组李工 / R&D-Team-B"
                    className="block w-full px-2.5 py-1.5 border border-theme-border bg-theme-bg text-xs text-theme-text rounded-md font-semibold"
                  />
                </div>
                
                <div className="space-y-1">
                  <span className="text-[10px] text-theme-muted font-bold block">{lang === 'zh' ? '语义控制版本号' : 'SemVer tag'}</span>
                  <input
                    type="text"
                    value={schemaVersion}
                    onChange={(e) => setSchemaVersion(e.target.value)}
                    placeholder="v1.0.4"
                    className="block w-full px-2.5 py-1.5 border border-theme-border bg-theme-bg text-xs text-theme-text font-mono rounded-md font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-theme-muted font-bold block">{lang === 'zh' ? '底层核心列字段映射与取值界限描述' : 'Core Field Mappings & Bounds specs'}</span>
                <textarea
                  rows={3}
                  value={schemaDescription}
                  onChange={(e) => setSchemaDescription(e.target.value)}
                  placeholder="e.g., Bravais_matrix (double[3][3]), atoms (string[]), occupancy (double[])"
                  className="block w-full px-2.5 py-2 border border-theme-border bg-theme-bg font-mono text-[11px] leading-relaxed text-theme-text rounded-md"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-theme-muted font-bold block">{lang === 'zh' ? '文件在存储集群物理挂载绝对索引' : 'Cluster Physical Mount Path'}</span>
                <input
                  type="text"
                  value={storageDescription}
                  onChange={(e) => setStorageDescription(e.target.value)}
                  placeholder="/mount-points/nfc_nas02/hpc_aligned/"
                  className="block w-full px-2.5 py-1.5 border border-theme-border bg-theme-bg text-xs text-theme-text font-mono rounded-md"
                />
              </div>
            </div>
          )}

          {/* Editorial detailed text area */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider" htmlFor="editor-content">
              {lang === 'zh' ? '核心正文内容（支持 Markdown / 换行）*' : 'Wiki Main Article Body (Markdown supported) *'}
            </label>
            <textarea
              id="editor-content"
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="block w-full px-3.5 py-3.5 bg-theme-bg hover:bg-theme-bg/85 focus:bg-theme-bg border border-theme-border focus:border-brand-yellow rounded-lg text-xs sm:text-sm text-theme-text leading-relaxed font-sans"
              placeholder={lang === 'zh' ? "请输入详细正文，推荐使用 ### 进行多阶排版叙合..." : "Draft the comprehensive Wiki contents here..."}
            />
          </div>

        </div>

        {/* Sidebar aux panel: Tags, Categories, upload - Right 4 columns */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Business Category select */}
          <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-xs space-y-3 transition-colors">
            <h3 className="text-xs font-extrabold text-theme-muted font-mono uppercase tracking-wider flex items-center justify-between">
              <span>{lang === 'zh' ? '业务归类目录' : 'Folder Category'}</span>
            </h3>
            <div className="space-y-1">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="block w-full py-2 px-3 border border-theme-border bg-theme-bg text-xs font-semibold text-theme-text rounded-lg cursor-pointer focus:outline-hidden"
                id="editor-select-category"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-theme-muted block pt-1.5 leading-normal">
                {lang === 'zh' ? '数据将关联及持久存储到 sqlite entries 对应表中' : 'Data will persist locally into mock database mapped catalog tables.'}
              </span>
            </div>
          </div>

          {/* Tag string entry */}
          <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-xs space-y-3 transition-colors">
            <h3 className="text-xs font-extrabold text-theme-muted font-mono uppercase tracking-wider">
              {lang === 'zh' ? '对齐检索索引标签' : 'Index Meta Tags'}
            </h3>
            <div className="space-y-1.5">
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g., 算法, PPT素材, 展会"
                className="block w-full px-2.5 py-2 border border-theme-border bg-theme-bg text-xs text-theme-text font-semibold rounded-lg"
                id="editor-txt-tags"
              />
              <span className="text-[10px] text-theme-muted leading-normal block pt-1">
                {lang === 'zh' ? '支持使用英文半角逗号 (,) 对多标签进行级层隔开' : 'Separate tags utilizing standard commas.'}
              </span>
            </div>
          </div>

          {/* Dynamic Mock Upload form block */}
          <div className="space-y-2">
            <FileUpload
              onUpload={handleFileUploadMock}
              usageType={attachmentUsage}
              onUsageTypeChange={setAttachmentUsage}
            />
            {fileToAttach && (
              <div className="p-3 bg-brand-yellow/10 border-2 border-dashed border-brand-yellow/30 rounded-xl flex items-center justify-between text-xs text-theme-text font-extrabold">
                <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                  <FileCheck className="w-4 h-4 text-brand-coral" />
                  <span className="truncate">{lang === 'zh' ? '队列附加' : 'Queued'}: {fileToAttach.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFileToAttach(null)}
                  className="text-brand-coral hover:underline font-bold"
                >
                  {lang === 'zh' ? '清除' : 'Clean'}
                </button>
              </div>
            )}
          </div>

          {/* Final Commit panel */}
          <div className="bg-theme-card border border-theme-border rounded-xl p-5 space-y-4 transition-colors">
            <div className="flex items-center gap-2 text-xs font-bold text-theme-text select-none">
              <ShieldCheck className="w-4 h-4 text-brand-coral" />
              <span>{lang === 'zh' ? '物理事务签名校验通过' : 'Security Sandbox Validation'}</span>
            </div>
            
            <p className="text-[11px] text-theme-muted leading-relaxed font-sans">
              {lang === 'zh' 
                ? '访客将被过滤防止机密泄露。点击保存后，内存及本地 state 字典自动更新保存。' 
                : 'Guests are filtered to prevent leaks. Changes automatically merge with local simulation state upon clicking Commit.'}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo font-bold rounded-lg text-xs sm:text-sm transition-all shadow-xs cursor-pointer hover:opacity-95"
                id="editor-btn-save"
              >
                <Save className="w-4 h-4 text-brand-coral" />
                <span className="font-extrabold">{loading ? (lang === 'zh' ? '写入底层虚拟表事物中...' : 'Committing...') : (lang === 'zh' ? '审核并公布此条目' : 'Commit Wiki Document')}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('entries')}
                className="w-full text-center py-2 bg-theme-bg hover:opacity-90 border border-theme-border text-theme-text font-bold rounded-lg text-xs transition-colors cursor-pointer"
                id="editor-btn-cancel"
              >
                {lang === 'zh' ? '放弃修改' : 'Discard Draft'}
              </button>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
};
