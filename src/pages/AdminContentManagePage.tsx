import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { entriesApi } from '../api/entriesApi';
import { WikiEntry, EntryVersionHistoryItem } from '../types/wiki';
import { Trash2, Edit, Search, Settings, Check, ShieldCheck } from 'lucide-react';
import EntryTypeBadge from '../components/EntryTypeBadge';
import VisibilityBadge from '../components/VisibilityBadge';
import Unauthorized from '../components/Unauthorized';
import Pagination from '../components/Pagination';

interface AdminContentManagePageProps {
  onNavigate: (view: string, id?: string) => void}

/**
 * Sanitize a title for safe display — strips invalid UTF-16 surrogates,
 * null bytes, and other control characters that break layout rendering.
 * Also truncates unreasonably long strings to a display-safe length.
 */
function sanitizeTitle(raw: string): string {
  if (!raw) return '(未命名条目)';
  return raw
    .replace(/\x00/g, '')                         // null bytes
    .replace(/[\uD800-\uDFFF]/g, '�')        // unpaired surrogates → �
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // control chars (keep \n, \t)
    .slice(0, 500);                                // hard cap for display
}

export default function AdminContentManagePage() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [editingEntry, setEditingEntry] = useState<WikiEntry | null>(null);

  // Pagination from URL
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10));

  // VERSION CONTROL FORM STATES
  const [editVersion, setEditVersion] = useState('v1.1');
  const [editVersionNote, setEditVersionNote] = useState('');
  const [editIsStable, setEditIsStable] = useState(false);
  const [editContent, setEditContent] = useState('');

  const loadEntries = async () => {
    try {
      const list = await entriesApi.getEntries();
      setEntries(list)} catch (err) {
      console.error('Error loading entries:', err)}
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadEntries()}
  }, [isLoggedIn]);

  const startEditing = (entry: WikiEntry) => {
    setEditingEntry(entry);
    setEditContent(entry.content || '');
    setEditIsStable(entry.isStableVersion || false);
    
    // Auto-calculate next version number (e.g., v1.0 -> v1.1)
    const currentVer = entry.entryVersion || 'v0.1';
    let nextVer = 'v0.2';
    if (currentVer.startsWith('v')) {
      const num = parseFloat(currentVer.replace('v', ''));
      if (!isNaN(num)) {
        nextVer = `v${(num + 0.1).toFixed(1)}`}
    }
    setEditVersion(nextVer);
    setEditVersionNote(`补充说明与 ${entry.title} 内容微调，全量快照备份。`)};

  const handleDelete = async (id: string) => {
    if (confirm('警告：确定要彻底删除该企业知识条目吗？关联文献与关系图谱连线将会一并清空，此操作不可逆。')) {
      try {
        await entriesApi.deleteEntry(id);
        alert('条目已安全从 pgvector 及 Wiki 数据库注销。');
        loadEntries()} catch (err) {
        console.error('Error deleting entry:', err)}
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    try {
      // Create new backup history node
      const currentHistories: EntryVersionHistoryItem[] = editingEntry.entryVersionHistory || [
        {
          version: editingEntry.entryVersion || 'v0.1',
          date: editingEntry.lastUpdatedAt || editingEntry.latestUpdatedAt || new Date().toISOString().substring(0, 10),
          updatedBy: editingEntry.updatedBy || editingEntry.owner || '张研究员',
          note: editingEntry.versionNote || '初始草稿录入。',
          current: false,
          contentBackup: editingEntry.content,
          titleBackup: editingEntry.title,
          summaryBackup: editingEntry.summary
        }
      ];

      const updateDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const submitterName = user?.displayName || '系统管理员';

      const newHistoryNode: EntryVersionHistoryItem = {
        version: editVersion,
        date: updateDate,
        updatedBy: submitterName,
        note: editVersionNote || '修订条目核心内容并提交归档',
        current: true,
        contentBackup: editContent,
        titleBackup: editingEntry.title,
        summaryBackup: editingEntry.summary
      };

      // Set previous items to current: false
      const updatedHistoryList: EntryVersionHistoryItem[] = currentHistories.map(h => ({ ...h, current: false }));
      updatedHistoryList.unshift(newHistoryNode);

      // Perform update
      await entriesApi.updateEntry(editingEntry.id, {
        title: editingEntry.title,
        summary: editingEntry.summary,
        content: editContent,
        visibility: editingEntry.visibility,
        entryVersion: editVersion,
        lastUpdatedAt: updateDate,
        latestUpdatedAt: updateDate,
        updatedBy: submitterName,
        versionNote: editVersionNote,
        isStableVersion: editIsStable,
        entryVersionHistory: updatedHistoryList
      });

      alert(`[修改成功] 已为该知识条目生成新版 ${editVersion}，并对历史数据进行了全量安全备份！`);
      setEditingEntry(null);
      loadEntries()} catch (err) {
      console.error('Error updating entry:', err)}
  };

  const filtered = entries.filter(
    e => e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
         e.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination (client-side)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const updateUrl = (p: number, ps?: number) => {
    const next = new URLSearchParams(searchParams);
    if (p > 1) next.set('page', String(p)); else next.delete('page');
    if (ps && ps !== 10) next.set('pageSize', String(ps)); else if (!ps) next.delete('pageSize');
    setSearchParams(next, { replace: true });
  };

  const handlePageChange = (p: number) => updateUrl(p);
  const handlePageSizeChange = (ps: number) => updateUrl(1, ps);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchParams({}, { replace: true });
  };

  if (!isLoggedIn) {
    return (
      <Unauthorized requiredRole="admin"
      />
    )}

  return (
    <div className="space-y-5" id="admin-content-panel">
      {/* Page Header */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <Settings className="w-5 h-5 text-[#DB5F5B]" />
          <span>全域知识库内容审查与维护控制台 (Wiki Metadata Registry)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          此板块专供合规审查人员及研发主管使用。支持在无需触碰物理源算子的情况下，在线修改、归口、发布、注销知识切片与可见度权限。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: Entries Directory and Search */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3.5">
            
            {/* Local search filtering */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs select-none">
              <span className="font-bold text-gray-700">条目元数据清单 ({filtered.length} 实体)</span>
              <div className="relative max-w-xs w-full">
                <input
                  type="text"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs font-sans"
                  placeholder="检索需要审核的条目标题..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  id="admin-search-filter"
                />
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>

            {/* List block */}
            <div className="space-y-3">
              {pagedItems.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3.5 bg-gray-50 border border-gray-150 rounded-lg text-xs flex flex-col sm:flex-row justify-between gap-3"
                >
                  {/* Content area: min-w-0 allows flex shrinking; overflow-hidden contains text */}
                  <div className="space-y-1.5 min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center space-x-2 select-none">
                      <EntryTypeBadge type={entry.entryType} />
                      <VisibilityBadge visibility={entry.visibility} />
                      <span className="text-[10px] text-gray-400 font-mono">ID: {entry.id}</span>
                    </div>

                    <h4
                      className="font-extrabold text-gray-800 tracking-tight break-all line-clamp-2"
                      title={sanitizeTitle(entry.title)}
                    >
                      {sanitizeTitle(entry.title)}
                    </h4>

                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed break-all">
                      {entry.summary}
                    </p>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex sm:flex-col justify-end gap-2 shrink-0 items-end select-none relative z-10">
                    <button
                      onClick={() => startEditing(entry)}
                      className="px-2.5 py-1 bg-white border border-gray-200 hover:border-[#DB5F5B]/30 hover:bg-[#F5F6E5]/40 text-gray-600 hover:text-[#DB5F5B] rounded text-[10px] font-bold transition-all flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Edit className="w-3 h-3" />
                      <span>修订与备份管理</span>
                    </button>

                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="px-2.5 py-1 bg-white border border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded text-[10px] font-bold transition-all flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>注销</span>
                    </button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-8 text-gray-400 italic text-xs">
                  未在知识库中找到符合条件的 Wiki 条目。
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <Pagination
              page={safePage}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </div>

        {/* Right Side: Quick Edit Form */}
        <div className="lg:col-span-4 space-y-4">
          {editingEntry ? (
            <div className="bg-white border border-[#DB5F5B]/20 rounded-xl p-4 shadow-sm space-y-4">
              <h3 className="font-extrabold text-xs text-[#2B3150] pb-1.5 border-b border-gray-100 uppercase tracking-wide flex items-center select-none">
                <Edit className="w-4 h-4 mr-1 text-[#DB5F5B]" />
                <span>知识条目在线修改与全量备份</span>
              </h3>

              <form onSubmit={handleUpdate} className="space-y-4 text-xs">
                {/* Title */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 select-none">
                    条目标题 (Title)：
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs font-bold"
                    value={editingEntry.title}
                    onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                  />
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 select-none">
                    摘要介绍 (Summary)：
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="w-full border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs leading-relaxed"
                    value={editingEntry.summary}
                    onChange={(e) => setEditingEntry({ ...editingEntry, summary: e.target.value })}
                  />
                </div>

                {/* Content editor */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 select-none">
                    正文主内容 (Markdown Content)：
                  </label>
                  <textarea
                    rows={8}
                    required
                    className="w-full border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-[11px] font-mono leading-relaxed"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                </div>

                {/* Version Number Input & Stable Checker */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 select-none">
                      备份版本号：
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. v1.1"
                      className="w-full border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs font-mono font-bold"
                      value={editVersion}
                      onChange={(e) => setEditVersion(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3 select-none">
                      状态审核：
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 focus:ring-[#DB5F5B]"
                        checked={editIsStable}
                        onChange={(e) => setEditIsStable(e.target.checked)}
                      />
                      <span className="font-bold text-gray-700 text-[11px] flex items-center">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mr-0.5" />
                        核准为 Stable
                      </span>
                    </label>
                  </div>
                </div>

                {/* Version Note */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 select-none">
                    版本修订日志 (Version Note)：
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 补充了 Monte Carlo 模拟残余错误..."
                    className="w-full border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs"
                    value={editVersionNote}
                    onChange={(e) => setEditVersionNote(e.target.value)}
                  />
                </div>

                {/* Visibility */}
                <div className="select-none">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    安全等级 (Visibility)：
                  </label>
                  <div className="flex items-center space-x-3 bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="edit-visibility"
                        checked={editingEntry.visibility === 'internal'}
                        onChange={() => setEditingEntry({ ...editingEntry, visibility: 'internal' })}
                      />
                      <span className="font-semibold text-gray-700">内部 INTERNAL</span>
                    </label>

                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="edit-visibility"
                        checked={editingEntry.visibility === 'public'}
                        onChange={() => setEditingEntry({ ...editingEntry, visibility: 'public' })}
                      />
                      <span className="font-semibold text-gray-700">公开 PUBLIC</span>
                    </label>
                  </div>
                </div>

                {/* Submits */}
                <div className="flex gap-2 select-none pt-2 border-t border-gray-100">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-[#2B3150] hover:bg-[#2B3150]/95 text-white font-bold rounded text-[11px] transition-all flex items-center justify-center space-x-1"
                  >
                    <Check className="w-3.5 h-3.5 text-[#F2D760]" />
                    <span>确认同步并做快照备份</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingEntry(null)}
                    className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded text-[11px] transition-all"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400 italic select-none">
              提示：在左侧列表中点击 [修订与备份管理] 即可在线编辑条目正文与属性，新提交会自动建立全量版本快照以支撑历史回溯。
            </div>
          )}
        </div>
      </div>
    </div>
  )}
