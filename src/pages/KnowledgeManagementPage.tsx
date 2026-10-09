import { useEffect, useState, useCallback } from 'react';
import { BookOpen, Folder, FileText, Plus, RefreshCw, Save, Database } from 'lucide-react';
import { knowledgeApi, Kb, Folder as KbFolder, Document } from '../api/knowledgeApi';

/** Knowledge management (P1-05): KB tree + folder list + document preview/edit. */
export default function KnowledgeManagementPage() {
  const [kbs, setKbs] = useState<Kb[]>([]);
  const [folders, setFolders] = useState<KbFolder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeKb, setActiveKb] = useState<Kb | null>(null);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [newKbName, setNewKbName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  const loadKbs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await knowledgeApi.listKbs();
      setKbs(res.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'failed to load knowledge bases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKbs(); }, [loadKbs]);

  const selectKb = useCallback(async (kb: Kb) => {
    setActiveKb(kb);
    setActiveDoc(null);
    setFolders([]);
    setDocuments([]);
    try {
      const [f, d] = await Promise.all([
        knowledgeApi.listFolders(kb.id),
        knowledgeApi.listDocuments({ kb_id: kb.id }),
      ]);
      setFolders(f.items ?? []);
      setDocuments(d.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'failed to load KB contents');
    }
  }, []);

  const selectDoc = useCallback(async (doc: Document) => {
    try {
      const full = await knowledgeApi.viewDocument(doc.id);
      setActiveDoc(full);
      setDraftTitle(full.title);
      setDraftContent(full.content ?? '');
      setSavedFlash(false);
    } catch (e: any) {
      setError(e?.message ?? 'failed to load document');
    }
  }, []);

  const saveDoc = useCallback(async () => {
    if (!activeDoc) return;
    setSaving(true);
    try {
      await knowledgeApi.updateDocument(activeDoc.id, { title: draftTitle, content: draftContent });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
      // Refresh the doc + list to reflect the appended revision.
      const full = await knowledgeApi.viewDocument(activeDoc.id);
      setActiveDoc(full);
      if (activeKb) {
        const d = await knowledgeApi.listDocuments({ kb_id: activeKb.id });
        setDocuments(d.items ?? []);
      }
    } catch (e: any) {
      setError(e?.message ?? 'save failed');
    } finally {
      setSaving(false);
    }
  }, [activeDoc, activeKb, draftTitle, draftContent]);

  const createKb = useCallback(async () => {
    if (!newKbName.trim()) return;
    try {
      const kb = await knowledgeApi.createKb({ name: newKbName.trim(), visibility: 'internal' });
      setNewKbName('');
      await loadKbs();
      setActiveKb(kb);
      setFolders([]);
      setDocuments([]);
    } catch (e: any) {
      setError(e?.message ?? 'failed to create KB');
    }
  }, [newKbName, loadKbs]);

  const createFolder = useCallback(async () => {
    if (!activeKb || !newFolderName.trim()) return;
    try {
      await knowledgeApi.createFolder({ kb_id: activeKb.id, name: newFolderName.trim() });
      setNewFolderName('');
      const f = await knowledgeApi.listFolders(activeKb.id);
      setFolders(f.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'failed to create folder');
    }
  }, [activeKb, newFolderName]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
            <Database className="w-6 h-6 text-brand" /> 知识库管理
          </h1>
          <p className="text-sm text-gray-500">Knowledge base / folder / document CRUD (P1-05)</p>
        </div>
        <button
          onClick={loadKbs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border border-gray-300 hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* KB list + create */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> 知识库
          </h2>
          <div className="flex gap-2 mb-3">
            <input
              value={newKbName}
              onChange={(e) => setNewKbName(e.target.value)}
              placeholder="新建知识库名称"
              className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded"
            />
            <button onClick={createKb} className="p-1.5 rounded bg-brand text-white" title="创建知识库">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading && <div className="text-xs text-gray-400">加载中…</div>}
          <ul className="space-y-1">
            {kbs.map((kb) => (
              <li key={kb.id}>
                <button
                  onClick={() => selectKb(kb)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 ${
                    activeKb?.id === kb.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-gray-50'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{kb.name}</span>
                </button>
              </li>
            ))}
            {!loading && kbs.length === 0 && <li className="text-xs text-gray-400 px-2">暂无知识库</li>}
          </ul>

          {/* Folders */}
          {activeKb && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5" /> 目录
              </h3>
              <div className="flex gap-2 mb-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="新建目录"
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded"
                />
                <button onClick={createFolder} className="p-1.5 rounded bg-brand text-white" title="创建目录">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <ul className="space-y-1 pl-2 border-l border-gray-100">
                {folders.map((f) => (
                  <li key={f.id} className="text-xs px-2 py-1 flex items-center gap-1.5 text-gray-600">
                    <Folder className="w-3 h-3 text-amber-500" /> {f.name}
                  </li>
                ))}
                {folders.length === 0 && <li className="text-xs text-gray-400 px-2">无目录</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Documents list */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> 文档
          </h2>
          {!activeKb && <div className="text-xs text-gray-400">选择左侧知识库</div>}
          <ul className="space-y-1">
            {documents.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => selectDoc(d)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 ${
                    activeDoc?.id === d.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-gray-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <span className="truncate">{d.title}</span>
                </button>
              </li>
            ))}
            {activeKb && documents.length === 0 && <li className="text-xs text-gray-400 px-2">无文档</li>}
          </ul>
        </div>

        {/* Preview / edit */}
        <div className="lg:col-span-6 bg-white border border-gray-200 rounded-lg p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">预览 / 编辑</h2>
          {!activeDoc && <div className="text-sm text-gray-400 py-8 text-center">选择文档以预览或编辑</div>}
          {activeDoc && (
            <div className="space-y-3">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full text-lg font-bold px-2 py-1.5 border border-gray-200 rounded focus:border-brand focus:outline-none"
              />
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={16}
                className="w-full font-mono text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-brand focus:outline-none resize-y"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={saveDoc}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-brand text-white disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? '保存中…' : '保存'}
                </button>
                {savedFlash && <span className="text-xs text-green-600 font-bold">已保存（已生成新修订）</span>}
                <span className="text-[10px] text-gray-400">doc #{activeDoc.id} · {activeDoc.visibility}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
