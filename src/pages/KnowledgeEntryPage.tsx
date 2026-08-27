import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { entriesApi } from '../api/entriesApi';
import { bookmarksApi } from '../api/bookmarksApi';
import { filesApi } from '../api/filesApi';
import { markdownApi } from '../api/markdownApi';
import { graphApi } from '../api/graphApi';
import type { SourceFile, MarkdownFile, KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import type { DetailViewModel } from '../types/viewModels';
import { toDetailViewModel } from '../utils/knowledgeFormatter';
import { buildKeywordIndex } from '../utils/keywordLinker';
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
import ContentPaginator from '../components/ContentPaginator';
import ConversationPanel from '../components/ConversationPanel';
import { EntryVersionMeta, EntryVersionHistory } from '../components/VersionComponents';
import {
  Bookmark, User, History, Database, Network,
  List, Terminal, Cpu, FileText, MessageSquare, ChevronRight,
  Share2, Download, Copy, Link2, ArrowUpRight,
  Sparkles, FileDown, Languages, Lightbulb, X,
  Clock, Tag, Maximize2, Minimize2, ChevronDown
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_QUICK_ACTIONS = [
  { key: 'summarize', label: '总结文档', icon: Sparkles, prompt: '请用中文总结当前文档的核心内容，列出3-5个关键要点。' },
  { key: 'explain', label: '解释概念', icon: Lightbulb, prompt: '请用通俗易懂的语言解释当前文档中涉及的核心概念和技术术语。' },
  { key: 'report', label: '生成报告', icon: FileDown, prompt: '请基于当前文档内容，生成一份结构化的研究报告摘要，包括背景、方法、结果和结论。' },
  { key: 'translate', label: '翻译摘要', icon: Languages, prompt: '请将当前文档的核心内容翻译成英文，保留专业术语的准确性。' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeEntryPage({ entryId }: { entryId: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoggedIn } = useAuth();

  // ── Data state ────────────────────────────────────────────────────────────
  const [entry, setEntry] = useState<any>(null);
  const [viewModel, setViewModel] = useState<DetailViewModel | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [graph, setGraph] = useState<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }>({ nodes: [], edges: [] });
  const [mdFile, setMdFile] = useState<MarkdownFile | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [relatedEntries, setRelatedEntries] = useState<any[]>([]);
  const [allEntries, setAllEntries] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // ── Pagination & TOC ──────────────────────────────────────────────────────
  const contentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [headings, setHeadings] = useState<Array<{ text: string; page: number; level: number }>>([]);
  const [navHeading, setNavHeading] = useState<string | null>(null);

  const handlePageChange = useCallback((p: number) => {
    const next = new URLSearchParams(searchParams);
    if (p > 1) next.set('page', String(p));
    else next.delete('page');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const chat = useConversation(entryId);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [versionExpanded, setVersionExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadEntryData = async () => {
      setErrorState(null);
      setFiles([]);
      setMdFile(null);
      setVersionExpanded(false);
      setAiPanelOpen(false);

      try {
        const loadedEntry = await entriesApi.getEntryById(entryId);
        setTimeout(() => window.scrollTo(0, 0), 0);
        setEntry(loadedEntry);

        try {
          const status = await bookmarksApi.isBookmarked(entryId);
          setBookmarked(status);
        } catch { setBookmarked(false); }

        const vm = toDetailViewModel(loadedEntry);
        setViewModel(vm);

        const loadedFiles = await filesApi.getFilesByEntryId(entryId);
        setFiles(loadedFiles);

        const subGraph = await graphApi.getFocusedGraph(entryId);
        setGraph(subGraph);

        const allEntries = await entriesApi.getEntries();
        setAllEntries(allEntries);
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePreviewMarkdown = async (sourceFileId: string) => {
    const md = await markdownApi.getMarkdownBySourceFileId(sourceFileId);
    setMdFile(md);
    setTimeout(() => {
      document.getElementById('markdown-view')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleToggleBookmark = async () => {
    try {
      if (bookmarked) await bookmarksApi.removeBookmark(entryId);
      else await bookmarksApi.addBookmark(entryId);
      setBookmarked(!bookmarked);
    } catch (err) { console.error('Bookmark toggle failed:', err); }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleQuickAI = (key: string, prompt: string) => {
    setAiPanelOpen(true);
    if (prompt) chat.send(prompt);
  };

  // ── TOC active heading ────────────────────────────────────────────────────
  const activeHeadingIndex = useMemo(() => {
    // Find the first heading on the current page
    const idx = headings.findIndex((h) => h.page === contentPage);
    return idx >= 0 ? idx : -1;
  }, [headings, contentPage]);

  const keywordIndex = useMemo(() => buildKeywordIndex(allEntries), [allEntries]);

  // ── Loading / Error states ────────────────────────────────────────────────
  if (errorState === 'FORBIDDEN') return <Unauthorized />;
  if (errorState) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 mb-4">
          <X className="w-7 h-7 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-red-600">加载出错</p>
        <p className="text-xs text-gray-400 mt-1">{errorState}</p>
      </div>
    );
  }
  if (!entry || !viewModel) {
    return (
      <div className="py-20 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-gray-400 animate-pulse font-medium">
          <span className="w-2 h-2 bg-brand rounded-full animate-bounce" />
          正在拉取科学文献元数据...
        </div>
      </div>
    );
  }

  const breadcrumbPaths = [
    { label: '首页', to: '/' },
    { label: entry.entryType === 'project' ? 'Sandbox 项目知识库' : '学术文献库', to: '/search' },
    { label: viewModel.title },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-0">
      {/* ═══════════════════════════════════════════════════════════════════════
          BREADCRUMBS + TOOLBAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between py-3 border-b border-gray-100">
        <Breadcrumbs paths={breadcrumbPaths} />

        {/* Quick actions toolbar */}
        <div className="hidden sm:flex items-center gap-1">
          <ToolbarButton
            icon={bookmarked ? Bookmark : Bookmark}
            label={bookmarked ? '已收藏' : '收藏'}
            active={bookmarked}
            onClick={handleToggleBookmark}
            activeClass="text-accent fill-accent"
          />
          <ToolbarButton
            icon={copied ? Link2 : Link2}
            label={copied ? '已复制' : '复制链接'}
            onClick={handleCopyLink}
            active={copied}
          />
          <ToolbarButton
            icon={MessageSquare}
            label="AI 问答"
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            active={aiPanelOpen}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          HERO HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="py-6 space-y-4">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <EntryTypeBadge type={viewModel.entryType as any} />
          <VisibilityBadge visibility={viewModel.visibility} />
          {entry.entryVersion && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold
                           bg-gray-100 text-gray-500 border border-gray-200">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {entry.entryVersion}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display tracking-tight leading-tight">
          {viewModel.title}
        </h1>

        {/* Summary — clean pull quote */}
        {viewModel.summary && (
          <p className="text-sm text-gray-500 leading-relaxed max-w-3xl">
            {viewModel.summary}
          </p>
        )}

        {/* Metadata row — single line */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          {viewModel.author && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-gray-300" aria-hidden="true" />
              <span className="font-medium text-gray-600">{viewModel.author}</span>
            </span>
          )}
          <span aria-hidden="true" className="text-gray-300">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-300" aria-hidden="true" />
            <span>更新于 {viewModel.updatedAt?.substring(0, 16)}</span>
          </span>
          {entry.ownerDepartment && (
            <>
              <span aria-hidden="true" className="text-gray-300">·</span>
              <span>{entry.ownerDepartment}</span>
            </>
          )}
        </div>

        {/* Tags */}
        {viewModel.tags.length > 0 && (
          <TagList tags={viewModel.tags} />
        )}

        {/* Mobile toolbar */}
        <div className="flex sm:hidden items-center gap-2 pt-1">
          <button
            onClick={handleToggleBookmark}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              bookmarked ? 'bg-accent/10 border-accent/30 text-ink' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-accent text-accent' : ''}`} />
            {bookmarked ? '已收藏' : '收藏'}
          </button>
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              aiPanelOpen ? 'bg-brand/5 border-brand/30 text-brand' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI 问答
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          METADATA PANEL — compact inline
          ═══════════════════════════════════════════════════════════════════════ */}
      {viewModel.metadata.items.length > 0 && (
        <section className="py-3 border-y border-gray-100 bg-gray-50/50 -mx-4 px-4 sm:mx-0 sm:px-4 sm:rounded-lg">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
            {viewModel.metadata.items.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <span className="text-gray-400 shrink-0">{item.key}:</span>
                <span className="font-medium text-gray-700 break-all">{item.value}</span>
              </div>
            ))}
            {viewModel.metadata.items.length > 8 && (
              <span className="text-gray-400">等 {viewModel.metadata.items.length} 项</span>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN GRID: TOC | Content | Sidebar
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
        {/* ── LEFT: Sticky TOC ──────────────────────────────────────────────── */}
        {headings.length > 0 && (
          <aside className="hidden lg:block lg:col-span-2">
            <nav className="sticky top-20 space-y-0.5 max-h-[calc(100vh-160px)] overflow-y-auto pr-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <List className="w-3 h-3" aria-hidden="true" />
                目录
              </p>
              {headings.map((h, i) => {
                const isActive = i === activeHeadingIndex ||
                  (activeHeadingIndex < 0 && h.page === contentPage);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setNavHeading(h.text);
                      setTimeout(() => setNavHeading(null), 100);
                    }}
                    className={`
                      w-full text-left py-1 text-xs transition-colors duration-150 truncate block
                      ${h.level === 1 ? 'font-semibold' : h.level === 2 ? 'pl-3' : 'pl-5 text-[11px]'}
                      ${isActive
                        ? 'text-brand border-l-2 border-brand pl-[calc(theme(spacing.3)-2px)]'
                        : 'text-gray-500 hover:text-gray-800 border-l-2 border-transparent pl-[calc(theme(spacing.3)-2px)]'
                      }
                    `}
                    style={{
                      paddingLeft: isActive
                        ? `${h.level * 12 - 2}px`
                        : `${h.level * 12}px`,
                    }}
                  >
                    {h.text.slice(0, 50)}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* ── CENTER: Main Content ──────────────────────────────────────────── */}
        <main className={`${headings.length > 0 ? 'lg:col-span-7' : 'lg:col-span-9'} space-y-8 min-w-0`}>
          {/* Content with improved reading experience */}
          <section id="content" aria-label="正文内容">
            <ContentPaginator
              content={viewModel.content}
              keywordIndex={keywordIndex}
              currentEntryId={entryId}
              currentPage={contentPage}
              onPageChange={handlePageChange}
              onHeadings={setHeadings}
              scrollToHeading={navHeading}
              onNavigated={() => setNavHeading(null)}
            />
          </section>

          {/* Sandbox Data Records */}
          {viewModel.records.length > 0 && (
            <section id="records" aria-label="实验数据记录">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-base font-bold text-gray-900 font-display">
                  实验数据记录
                </h2>
                <span className="text-xs text-gray-400 font-mono">({viewModel.records.length})</span>
              </div>
              <div className="space-y-3">
                {viewModel.records.map((rec) => (
                  <div key={rec.index}>
                    <RecordCard record={rec as any} defaultExpanded={rec.index <= 3} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Source Files */}
          {files.length > 0 && (
            <section id="files" aria-label="附件">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <h2 className="text-base font-bold text-gray-900 font-display">附件</h2>
                <span className="text-xs text-gray-400 font-mono">({files.length})</span>
              </div>
              <SourceFileList files={files} onPreviewMarkdown={handlePreviewMarkdown} />
            </section>
          )}

          {/* Markdown Preview */}
          {mdFile && (
            <section id="markdown-view" aria-label="MarkItDown 预览">
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="w-4 h-4 text-brand animate-pulse" aria-hidden="true" />
                <h2 className="text-base font-bold text-gray-900 font-display">MarkItDown 解析预览</h2>
              </div>
              <MarkdownPreview markdownFile={mdFile} onClose={() => setMdFile(null)} />
            </section>
          )}

          {/* References */}
          {viewModel.references.length > 0 && (
            <section id="refs" aria-label="参考文献">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <h2 className="text-base font-bold text-gray-900 font-display">参考文献</h2>
                <span className="text-xs text-gray-400 font-mono">({viewModel.references.length})</span>
              </div>
              <ReferenceView references={viewModel.references} />
            </section>
          )}

          {/* Services (for project type) */}
          {viewModel.entryType === 'project' && (
            <section id="services" aria-label="AI 服务">
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-base font-bold text-gray-900 font-display">可调用 AI 研发服务</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { name: 'RAG 知识检索', desc: '基于当前项目上下文检索' },
                  { name: 'MCP 工具服务', desc: '可编程知识工具包' },
                  { name: 'MiQi 活性服务', desc: '自然语言交互调用' },
                ].map((svc) => (
                  <div key={svc.name} className="flex items-start gap-3 p-3 bg-gray-50/80 rounded-lg border border-gray-100">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{svc.name}</p>
                      <p className="text-[11px] text-gray-500">{svc.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Knowledge Graph */}
          <section id="graph" aria-label="知识图谱">
            <div className="flex items-center gap-2 mb-4">
              <Network className="w-4 h-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-bold text-gray-900 font-display">知识图谱</h2>
            </div>
            <div className="bg-gray-50/50 border border-gray-100 rounded-lg overflow-hidden">
              <KnowledgeGraph nodes={graph.nodes} edges={graph.edges} height={240} />
            </div>
          </section>

          {/* ── Collapsible Version History ────────────────────────────────── */}
          <section id="version-history" aria-label="版本历史">
            <button
              onClick={() => setVersionExpanded(!versionExpanded)}
              className="w-full flex items-center justify-between py-3 text-left
                         hover:bg-gray-50/50 rounded-lg px-3 -mx-3 transition-colors"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-700">版本历史与审计链</span>
                {entry.entryVersionHistory && (
                  <span className="text-[11px] text-gray-400 font-mono">
                    ({entry.entryVersionHistory.length} 个版本)
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${versionExpanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {versionExpanded && (
              <div className="mt-2 animate-fade-in">
                <EntryVersionHistory entry={entry} onRollbackSuccess={(e) => setEntry(e)} />
              </div>
            )}
          </section>

          {/* Debug toggle */}
          {viewModel.sandboxRaw && (
            <div className="pt-4 border-t border-dashed border-gray-200">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-[11px] text-gray-400 hover:text-gray-500 transition-colors"
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
        </main>

        {/* ── RIGHT: Compact Sidebar ────────────────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-5">
          {/* Owner & Visibility — compact card */}
          <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">条目信息</h3>
            <div className="space-y-2 text-xs">
              <Row label="负责人" value={viewModel.author} />
              <Row label="科室" value={entry.ownerDepartment || '—'} />
              <Row label="密级">
                <VisibilityBadge visibility={viewModel.visibility} />
              </Row>
              {entry.entryVersion && (
                <Row label="版本" value={entry.entryVersion} mono />
              )}
              <Row label="创建时间" value={viewModel.createdAt?.substring(0, 10)} mono />
            </div>
          </div>

          {/* AI Quick Actions */}
          <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              AI 快捷操作
            </h3>
            <div className="space-y-1">
              {AI_QUICK_ACTIONS.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleQuickAI(action.key, action.prompt)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600
                             hover:bg-brand/5 hover:text-brand rounded-md
                             transition-all duration-150 text-left"
                >
                  <action.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Related entries */}
          {relatedEntries.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">关联条目</h3>
              <RelatedKnowledge relatedEntries={relatedEntries} />
            </div>
          )}
        </aside>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          FLOATING AI PANEL
          ═══════════════════════════════════════════════════════════════════════ */}
      {/* FAB — visible when panel is closed */}
      {!aiPanelOpen && (
        <button
          onClick={() => setAiPanelOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3
                     bg-ink hover:bg-ink/90 text-white text-sm font-semibold
                     rounded-full shadow-lg hover:shadow-xl
                     focus:outline-none focus:ring-2 focus:ring-brand/40
                     transition-all duration-200 hover:-translate-y-0.5"
          aria-label="打开 AI 助手"
        >
          <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
          <span>AI 助手</span>
        </button>
      )}

      {/* Slide-in panel */}
      {aiPanelOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white border-l border-gray-200
                        shadow-2xl flex flex-col animate-fade-in">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink font-display">AI 助手</span>
              <span className="text-[10px] text-gray-400">基于当前文档</span>
            </div>
            <button
              onClick={() => setAiPanelOpen(false)}
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="关闭 AI 助手"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Quick actions row */}
          <div className="px-4 py-2.5 border-b border-gray-50 shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {AI_QUICK_ACTIONS.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleQuickAI(action.key, action.prompt)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-600
                             bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full
                             transition-all duration-150"
                >
                  <action.icon className="w-3 h-3" aria-hidden="true" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex-1 min-h-0">
            <ConversationPanel
              messages={chat.messages}
              onSend={chat.send}
              isLoading={chat.isLoading}
              onSourceClick={chat.navigateToSource}
              onNewChat={chat.newChat}
            />
          </div>
        </div>
      )}

      {/* Backdrop */}
      {aiPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 hidden sm:block"
          onClick={() => setAiPanelOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tiny sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active,
  activeClass,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium
                  transition-all duration-150
                  ${active
                    ? `bg-brand/5 text-brand border border-brand/10 ${activeClass || ''}`
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent'
                  }`}
      aria-label={label}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? (activeClass || 'text-brand') : ''}`} aria-hidden="true" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function Row({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      {children || (
        <span className={`font-medium text-gray-700 ${mono ? 'font-mono' : ''}`}>
          {value || '—'}
        </span>
      )}
    </div>
  );
}
