import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { entriesApi } from '../api/entriesApi';
import { filesApi } from '../api/filesApi';
import { markdownApi } from '../api/markdownApi';
import { graphApi } from '../api/graphApi';
import type { SourceFile, MarkdownFile, KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import type { DetailViewModel } from '../types/viewModels';
import { toDetailViewModel } from '../utils/knowledgeFormatter';
import { useConversation } from '../hooks/useConversation';

import Breadcrumbs from '../components/Breadcrumbs';
import EntryTypeBadge from '../components/EntryTypeBadge';
import VisibilityBadge from '../components/VisibilityBadge';
import TagList from '../components/TagList';
import SourceFileList from '../components/SourceFileList';
import MarkdownPreview from '../components/MarkdownPreview';
import RelatedKnowledge from '../components/RelatedKnowledge';
import KnowledgeGraph from '../components/KnowledgeGraph';
import Unauthorized from '../components/Unauthorized';
import MetadataCard from '../components/MetadataCard';
import RecordCard from '../components/RecordCard';
import ReferenceView from '../components/ReferenceView';
import ExpandableContent from '../components/ExpandableContent';
import ConversationPanel from '../components/ConversationPanel';
import { EntryVersionMeta, EntryVersionHistory } from '../components/VersionComponents';
import { mockReferences } from '../mock/mockData';
import {
  Bookmark, User, Share2, History, Database, Network,
  List, Terminal, Cpu, FileText, MessageSquare,
} from 'lucide-react';

export default function KnowledgeEntryPage({ entryId }: { entryId: string }) {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [entry, setEntry] = useState<any>(null);
  const [viewModel, setViewModel] = useState<DetailViewModel | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [graph, setGraph] = useState<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }>({ nodes: [], edges: [] });
  const [mdFile, setMdFile] = useState<MarkdownFile | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [relatedEntries, setRelatedEntries] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Multi-turn chat
  const chat = useConversation(entryId);

  useEffect(() => {
    const loadEntryData = async () => {
      setErrorState(null);
      setFiles([]);
      setMdFile(null);

      try {
        const loadedEntry = await entriesApi.getEntryById(entryId);
        setEntry(loadedEntry);
        setBookmarked(loadedEntry.id === 'e-stabilizer-project');

        // Build ViewModel
        const vm = toDetailViewModel(loadedEntry);
        setViewModel(vm);

        // Load files
        const loadedFiles = await filesApi.getFilesByEntryId(entryId);
        setFiles(loadedFiles);

        // Load graph
        const subGraph = await graphApi.getFocusedGraph(entryId);
        setGraph(subGraph);

        // Related entries
        const allEntries = await entriesApi.getEntries();
        const related = allEntries.filter((e: any) =>
          loadedEntry.relatedEntryIds?.includes(e.id),
        );
        setRelatedEntries(related);
      } catch (err: any) {
        if (err.message === 'FORBIDDEN_INTERNAL_ACCESS') {
          setErrorState('FORBIDDEN');
        } else {
          setErrorState(err.message || '加载错误');
        }
      }
    };

    loadEntryData();
  }, [entryId, isLoggedIn]);

  const handlePreviewMarkdown = async (sourceFileId: string) => {
    const md = await markdownApi.getMarkdownBySourceFileId(sourceFileId);
    setMdFile(md);
    setTimeout(() => {
      document.getElementById('markdown-view')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  if (errorState === 'FORBIDDEN') return <Unauthorized />;
  if (errorState) {
    return <div className="text-center py-12 text-red-500 italic font-bold">加载出错: {errorState}</div>;
  }
  if (!entry || !viewModel) {
    return <div className="py-16 text-center text-gray-500 font-bold animate-pulse">正在拉取科学文献元数据...</div>;
  }

  const breadcrumbPaths = [
    { label: '首页', to: '/' },
    { label: entry.entryType === 'project' ? 'Sandbox 项目知识库' : '学术文献库', to: '/search' },
    { label: viewModel.title },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-3 gap-2 select-none">
        <Breadcrumbs paths={breadcrumbPaths} />
        <div className="flex items-center space-x-2 shrink-0">
          <button onClick={() => setBookmarked(!bookmarked)}
            className={`px-3 py-1.5 rounded border text-xs font-bold transition-all flex items-center space-x-1.5 ${
              bookmarked ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-gray-300 text-gray-600'}`}>
            <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-yellow-500 text-yellow-500' : ''}`} />
            <span>{bookmarked ? '已收藏' : '收藏条目'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: TOC */}
        <div className="lg:col-span-2 hidden lg:block border-r border-gray-100 pr-3 space-y-3 select-none">
          <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider flex items-center pb-1.5 border-b border-gray-100">
            <List className="w-3.5 h-3.5 mr-1" />
            <span>条目目录</span>
          </h4>
          <nav className="space-y-1 text-xs">
            {[
              { id: 'overview', label: '1. 概览' },
              { id: 'content', label: '2. 正文' },
              ...(viewModel.records.length > 0 ? [{ id: 'records', label: '3. 数据记录' }] : []),
              ...(viewModel.references.length > 0 ? [{ id: 'refs', label: '4. 参考文献' }] : []),
              { id: 'chat', label: '5. AI 问答' },
            ].map((item) => (
              <button key={item.id} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full text-left py-1 text-gray-600 hover:text-blue-700 hover:underline font-medium block truncate">
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* CENTER: Main Content */}
        <div className="lg:col-span-7 space-y-6">
          {/* Title + Tags */}
          <section id="overview">
            <div className="text-sm font-extrabold text-[#DB5F5B] uppercase tracking-wider font-mono mb-2">
              最新更新：{viewModel.updatedAt}
            </div>
            <div className="flex items-center space-x-2 mb-2">
              <EntryTypeBadge type={viewModel.entryType as any} />
              <VisibilityBadge visibility={viewModel.visibility} />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-snug">
              {viewModel.title}
            </h1>
            {viewModel.summary && (
              <div className="border-l-4 border-[#2B3150] bg-gray-50 p-3.5 text-xs text-gray-600 leading-relaxed font-sans italic mt-3">
                <strong>条目摘要：</strong>{viewModel.summary}
              </div>
            )}
            <TagList tags={viewModel.tags} />
          </section>

          {/* Metadata Card */}
          <MetadataCard items={viewModel.metadata.items} />

          {/* Content */}
          <section id="content" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1.5 border-b border-gray-100 mb-3 flex items-center select-none">
              <FileText className="w-4 h-4 mr-1 text-gray-500" />
              正文内容
            </h2>
            <ExpandableContent content={viewModel.content} maxHeight={400} />
          </section>

          {/* Sandbox Data Records */}
          {viewModel.records.length > 0 && (
            <section id="records" className="space-y-3">
              <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1.5 border-b border-gray-100 flex items-center select-none">
                <Database className="w-4 h-4 mr-1 text-[#DB5F5B]" />
                实验数据记录 ({viewModel.records.length})
              </h2>
              {viewModel.records.map((rec) => (
                <div key={rec.index}>
                  <RecordCard record={rec} defaultExpanded={rec.index > 3} />
                </div>
              ))}
            </section>
          )}

          {/* Source Files */}
          {files.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1.5 border-b border-gray-100 mb-3 flex items-center select-none">
                <Database className="w-4 h-4 mr-1 text-gray-500" />
                附件源物理文件
              </h3>
              <SourceFileList files={files} onPreviewMarkdown={handlePreviewMarkdown} />
            </section>
          )}

          {/* Markdown Preview */}
          {mdFile && (
            <section id="markdown-view" className="pt-4 border-t-2 border-gray-900 space-y-3">
              <h3 className="font-extrabold text-xs text-red-700 uppercase tracking-wide flex items-center select-none">
                <Terminal className="w-4 h-4 mr-1 text-red-600 animate-pulse" />
                MarkItDown 文本结构解析预览
              </h3>
              <MarkdownPreview markdownFile={mdFile} onClose={() => setMdFile(null)} />
            </section>
          )}

          {/* References */}
          {viewModel.references.length > 0 && (
            <section id="refs" className="space-y-3">
              <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1.5 border-b border-gray-100 flex items-center select-none">
                <History className="w-4 h-4 mr-1 text-gray-500" />
                参考文献 ({viewModel.references.length})
              </h2>
              <ReferenceView references={viewModel.references} />
            </section>
          )}

          {/* Services (for project type) */}
          {viewModel.entryType === 'project' && (
            <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none pb-1.5 border-b border-gray-150">
                <Cpu className="w-4 h-4 mr-1 text-[#DB5F5B]" />
                可调用 AI 研发服务
              </h3>
              <div className="space-y-2 text-xs">
                {['RAG 知识检索服务', 'MCP 工具服务', 'MiQi 活性可调用服务'].map((svc) => (
                  <div key={svc} className="flex items-center space-x-2">
                    <span className="font-extrabold text-gray-900">{svc}</span>
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] px-1 rounded font-bold font-mono">可调用</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Knowledge Graph */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none pb-1.5 border-b border-gray-100">
              <Network className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              知识图谱关系网络
            </h3>
            <KnowledgeGraph nodes={graph.nodes} edges={graph.edges} height={240} />
          </section>

          {/* AI Chat */}
          <section id="chat" className="space-y-3">
            <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1.5 border-b border-gray-100 flex items-center select-none">
              <MessageSquare className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              AI 问答 · 基于当前条目上下文
            </h2>
            <div className="bg-white border border-[#DB5F5B]/10 rounded-xl shadow-sm">
              <ConversationPanel
                messages={chat.messages}
                onSend={chat.send}
                isLoading={chat.isLoading}
                onSourceClick={chat.navigateToSource}
                onNewChat={chat.newChat}
              />
            </div>
          </section>

          {/* Version History */}
          <section id="version-timeline" className="pt-4 border-t-2 border-gray-900">
            <EntryVersionHistory entry={entry} onRollbackSuccess={(e) => setEntry(e)} />
          </section>

          {/* Debug: Raw JSON toggle */}
          {viewModel.sandboxRaw && (
            <div className="pt-2 border-t border-dashed border-gray-300">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showDebug ? '隐藏原始数据' : '🔧 开发者：查看原始 Sandbox 数据'}
              </button>
              {showDebug && (
                <pre className="mt-2 text-[10px] font-mono text-gray-500 bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(viewModel.sandboxRaw, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <EntryVersionMeta entry={entry} />

          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3 select-none">
            <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              条目归属与可见度
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">责任专家：</span>
                <span className="font-semibold text-gray-800 flex items-center">
                  <User className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  {viewModel.author}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">所属科室：</span>
                <span className="font-semibold text-gray-800">{entry.ownerDepartment || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">密级权限：</span>
                <VisibilityBadge visibility={viewModel.visibility} />
              </div>
            </div>
          </div>

          {relatedEntries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
                关联学术推荐
              </h3>
              <RelatedKnowledge relatedEntries={relatedEntries} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
