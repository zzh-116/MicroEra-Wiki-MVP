import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { entriesApi } from '../api/entriesApi';
import { filesApi } from '../api/filesApi';
import { markdownApi } from '../api/markdownApi';
import { stripDataUriImages } from '../utils/adapter';
import { graphApi } from '../api/graphApi';
import { SourceFile, MarkdownFile, KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import Breadcrumbs from '../components/Breadcrumbs';
import EntryTypeBadge from '../components/EntryTypeBadge';
import VisibilityBadge from '../components/VisibilityBadge';
import TagList from '../components/TagList';
import SourceFileList from '../components/SourceFileList';
import MarkdownPreview from '../components/MarkdownPreview';
import ReferenceList from '../components/ReferenceList';
import RelatedKnowledge from '../components/RelatedKnowledge';
import KnowledgeGraph from '../components/KnowledgeGraph';
import Unauthorized from '../components/Unauthorized';
import { mockEntries } from '../mock/mockData';
import { Bookmark, User, Share2, History, Database, Network, ChevronDown, List, Terminal, Cpu } from 'lucide-react';
import { EntryVersionMeta, EntryVersionHistory } from '../components/VersionComponents';

interface KnowledgeEntryPageProps {
  entryId: string;
  onNavigate: (view: string, id?: string) => void;
}

export default function KnowledgeEntryPage({ entryId, onNavigate }: KnowledgeEntryPageProps) {
  const { isLoggedIn } = useAuth();
  const [entry, setEntry] = useState<any>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [graph, setGraph] = useState<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }>({ nodes: [], edges: [] });
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mdFile, setMdFile] = useState<MarkdownFile | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [relatedEntries, setRelatedEntries] = useState<any[]>([]);

  // Graph interaction state
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{
    name: string;
    type: string;
    relationship: string;
    id: string;
  } | null>(null);

  useEffect(() => {
    const loadEntryData = async () => {
      setErrorState(null);
      setFiles([]);
      setSelectedFileId(null);
      setMdFile(null);
      setSelectedNodeInfo(null);

      try {
        const loadedEntry = await entriesApi.getEntryById(entryId);
        setEntry(loadedEntry);

        // Bookmarked state mock
        setBookmarked(loadedEntry.id === 'e-stabilizer-project' || loadedEntry.id === 'e-data-stabilizer-schema');

        // Load files
        const loadedFiles = await filesApi.getFilesByEntryId(entryId);
        setFiles(loadedFiles);

        // Load focused subgraph centering on this entry
        const subGraph = await graphApi.getFocusedGraph(entryId);
        setGraph(subGraph);

        // Load related entries
        const allEntries = await entriesApi.getEntries();
        const related = allEntries.filter(e => loadedEntry.relatedEntryIds.includes(e.id));
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
    setSelectedFileId(sourceFileId);
    const md = await markdownApi.getMarkdownBySourceFileId(sourceFileId);
    setMdFile(md);
    
    // Smooth scroll to md preview block
    setTimeout(() => {
      document.getElementById('markdown-view')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleToggleBookmark = () => {
    setBookmarked(!bookmarked);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (errorState === 'FORBIDDEN') {
    return <Unauthorized onLoginRedirect={() => onNavigate('login')} />;
  }

  if (errorState) {
    return (
      <div className="text-center py-12 text-red-500 italic font-bold">
        加载出错: {errorState}
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="py-16 text-center text-gray-500 font-bold animate-pulse">
        正在拉取科学文献元数据与关系链...
      </div>
    );
  }

  // Create breadcrumb array
  const breadcrumbPaths = [
    { label: '首页', view: isLoggedIn ? 'internal-home' : 'public-home' },
    { label: entry.entryType === 'project' ? 'Sandbox 项目知识库' : '学术文献库', view: 'search' },
    { label: entry.title }
  ];

  // Define Table of Contents
  const tocItems = [
    { id: 'overview', label: '1. 条目概述' },
    { id: 'content', label: '2. 正文内容' },
    { id: 'source-files', label: '3. 附件源物理文件' },
    ...(mdFile ? [{ id: 'markdown-view', label: '4. Markdown 转换预览' }] : []),
    { id: 'references', label: '5. 引航标注依据' },
    ...(entry.entryType === 'project' ? [{ id: 'services', label: '6. 可调用研发服务' }] : []),
    { id: 'graph-navigation', label: '7. 知识图谱关系' },
    { id: 'version-timeline', label: '8. 版本更迭历史' }
  ];

  // Mock relationship resolver for graph nodes
  const handleGraphNodeClick = (nodeId: string) => {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    let relationship = '项目主体关联';
    if (node.type === 'paper') relationship = '源引文献依据';
    if (node.type === 'data_item') relationship = '对应数据标准Schema';
    if (node.type === 'service') relationship = '注册的活性可调用工具';

    setSelectedNodeInfo({
      id: node.id,
      name: node.label,
      type: node.type,
      relationship
    });
  };

  return (
    <div className="space-y-6" id={`wiki-entry-page-${entry.id}`}>
      
      {/* 1. Breadcrumbs & Actions Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-3 gap-2 select-none">
        <Breadcrumbs paths={breadcrumbPaths} onNavigate={onNavigate} />

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleToggleBookmark}
            className={`px-3 py-1.5 rounded border text-xs font-bold transition-all flex items-center space-x-1.5 ${
              bookmarked
                ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                : 'bg-white border-gray-300 text-gray-600 hover:text-gray-800'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-yellow-500 text-yellow-500' : ''}`} />
            <span>{bookmarked ? '已收藏' : '收藏条目'}</span>
          </button>

          <button
            onClick={() => alert('[链接生成] 已生成该机密条目的内网分享引用锚点，可直接粘贴给其他研究员。')}
            className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded text-xs font-bold text-gray-600 transition-all flex items-center space-x-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>分享</span>
          </button>
        </div>
      </div>

      {/* 2. Three-column Layout (Left TOC, Center Article, Right Sidebar Meta) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Interactive Table of Contents (Directory) */}
        <div className="lg:col-span-2 space-y-3 lg:sticky lg:top-4 select-none hidden lg:block border-r border-gray-100 pr-3">
          <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider flex items-center pb-1.5 border-b border-gray-100">
            <List className="w-3.5 h-3.5 mr-1" />
            <span>条目目录</span>
          </h4>
          <nav className="space-y-1 text-xs">
            {tocItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="w-full text-left py-1 text-gray-600 hover:text-blue-700 hover:underline font-medium block truncate"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* CENTER COLUMN: Wikipedia-Style Main Article */}
        <div className="lg:col-span-7 space-y-8 bg-white p-6 border border-gray-200 rounded min-h-[500px]">
          
          {/* A. Conspicuous Updated Time ABOVE Title */}
          <div className="space-y-1 select-none">
            <div className="text-sm font-extrabold text-[#DB5F5B] uppercase tracking-wider font-mono">
              最新更新：{entry.latestUpdatedAt}
            </div>
            <div className="flex items-center space-x-2 pt-0.5">
              <EntryTypeBadge type={entry.entryType} />
              <VisibilityBadge visibility={entry.visibility} />
            </div>
          </div>

          {/* B. Title & Summary block */}
          <div className="space-y-3" id="overview">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-snug">
              {entry.title}
            </h1>
            
            {/* Plain quote bordered, not a heavy card */}
            <div className="border-l-4 border-[#2B3150] bg-gray-50 p-3.5 text-xs text-gray-600 leading-relaxed font-sans italic">
              <strong>条目摘要：</strong>{entry.summary}
            </div>

            <TagList tags={entry.tags} />
          </div>

          {/* C. Primary Article Prose */}
          <section id="content" className="space-y-4 pt-4 border-t border-gray-100">
            <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1 border-b border-gray-200 select-none">
              正文研究说明
            </h2>

            <article className="prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed select-text font-sans">
              {stripDataUriImages(entry.content).split('\n').map((line: string, idx: number) => {
                if (line.startsWith('# ')) {
                  return (
                    <h3 key={idx} className="text-base font-extrabold text-gray-900 border-b border-gray-150 pb-1 mt-6 mb-3">
                      {line.replace('# ', '')}
                    </h3>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h4 key={idx} className="text-xs font-extrabold text-[#DB5F5B] mt-5 mb-2 uppercase tracking-wide">
                      {line.replace('## ', '')}
                    </h4>
                  );
                }
                if (line.startsWith('### ')) {
                  return (
                    <h5 key={idx} className="text-xs font-bold text-gray-800 mt-4 mb-1">
                      {line.replace('### ', '')}
                    </h5>
                  );
                }
                if (line.startsWith('- ')) {
                  return (
                    <div key={idx} className="flex items-start space-x-1.5 ml-3 my-1 leading-relaxed">
                      <span className="text-[#DB5F5B] font-bold shrink-0 mt-0.5">•</span>
                      <span>{line.replace('- ', '')}</span>
                    </div>
                  );
                }
                if (!line.trim()) {
                  return <div key={idx} className="h-2" />;
                }
                return (
                  <p key={idx} className="my-2 text-gray-600 leading-relaxed">
                    {line}
                  </p>
                );
              })}
            </article>
          </section>

          {/* D. Audit Files */}
          <section id="source-files" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none">
              <Database className="w-4 h-4 mr-1 text-gray-500" />
              <span>附件源物理文件与审计 (Audit Files)</span>
            </h3>
            <SourceFileList
              files={files}
              onPreviewMarkdown={handlePreviewMarkdown}
            />
          </section>

          {/* E. MarkItDown previews (rendered right in the stream) */}
          {mdFile && (
            <section id="markdown-view" className="pt-6 border-t-2 border-gray-900 space-y-3">
              <h3 className="font-extrabold text-xs text-red-700 uppercase tracking-wide flex items-center select-none">
                <Terminal className="w-4 h-4 mr-1 text-red-600 animate-pulse" />
                <span>MarkItDown 实时文本结构解析预览 (Parsed Markdown Output)</span>
              </h3>
              <MarkdownPreview
                markdownFile={mdFile}
                onClose={() => {
                  setSelectedFileId(null);
                  setMdFile(null);
                }}
              />
            </section>
          )}

          {/* F. References List (Tabular) */}
          <section id="references" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none">
              <History className="w-4 h-4 mr-1 text-gray-500" />
              <span>引航标注与依据来源 (Reference Locators)</span>
            </h3>
            <ReferenceList
              references={mockEntries.find(e => e.id === entryId)?.entryType === 'project' ? [
                {
                  id: 'ref-lc-1',
                  fromEntryId: entryId,
                  locator: 'section=计算核心结果',
                  quote: '零错保真度阈值在物理误差率低于 1.5% 时有效收敛。',
                  referenceType: 'sandbox_result',
                  title: '稳定子计算结果说明文档',
                  updatedAt: '2026-06-30'
                }
              ] : []}
              onNavigate={onNavigate}
            />
          </section>

          {/* G. Actionable Services list (No cards!) */}
          {entry.entryType === 'project' && (
            <section id="services" className="pt-6 border-t border-gray-200 space-y-4">
              <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none pb-1.5 border-b border-gray-150">
                <Cpu className="w-4 h-4 mr-1 text-[#DB5F5B]" />
                <span>可调用服务 (Active Integrations)</span>
              </h3>
              
              <div className="space-y-4 text-xs">
                
                {/* RAG Service */}
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-gray-900 text-sm">RAG 查询服务</span>
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] px-1 rounded font-bold font-mono">已接入 (ACTIVE)</span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    用于基于该项目的 Markdown、引用文献和结果文件进行智能对齐问答。
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-[11px] py-1 font-mono text-gray-500">
                    <div><span className="font-bold text-gray-600">输入：</span>自然语言问题 (Natural Language Query)</div>
                    <div><span className="font-bold text-gray-600">输出：</span>带有 reference 溯源位置的回答</div>
                  </div>
                  <button 
                    onClick={() => onNavigate('ai-query')}
                    className="text-blue-700 hover:underline font-bold text-[10px] block"
                  >
                    查看服务问答说明 &rarr;
                  </button>
                </div>

                {/* MCP Service */}
                <div className="space-y-1 pt-2 border-t border-gray-100">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-gray-900 text-sm">MCP 工具服务 (Model Context Protocol)</span>
                    <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 text-[9px] px-1 rounded font-bold font-mono">演示中 (DEMO)</span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    允许 MiQi 或其他研发 Agent 自适应抓取本项目下的底层数据、结果算子及 CIF 文件。
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-[11px] py-1 font-mono text-gray-500">
                    <div><span className="font-bold text-gray-600">输入：</span>项目 ID / 检索变量</div>
                    <div><span className="font-bold text-gray-600">输出：</span>高密度结构化实体 JSON 数据</div>
                  </div>
                  <button 
                    onClick={() => onNavigate('system-version')}
                    className="text-blue-700 hover:underline font-bold text-[10px] block"
                  >
                    查看接口工具定义 &rarr;
                  </button>
                </div>

                {/* MiQi Integration */}
                <div className="space-y-1 pt-2 border-t border-gray-100">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-gray-900 text-sm">MiQi 活性可调用服务</span>
                    <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[9px] px-1 rounded font-bold font-mono">预留 (RESERVED)</span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    在全局 MiQi 大模型对话中自适应触发、提供本项目的过程、公式提取结果及历史版本的引用。
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-[11px] py-1 font-mono text-gray-500">
                    <div><span className="font-bold text-gray-600">输入：</span>MiQi Session ID / Query</div>
                    <div><span className="font-bold text-gray-600">输出：</span>物理摘要与可靠引用链</div>
                  </div>
                  <button 
                    onClick={() => onNavigate('system-version')}
                    className="text-blue-700 hover:underline font-bold text-[10px] block"
                  >
                    查看调用样例 &rarr;
                  </button>
                </div>

              </div>
            </section>
          )}

          {/* H. Interactive Knowledge Graph Center */}
          <section id="graph-navigation" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none">
              <Network className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              <span>知识图谱跳转导航地图 (Knowledge Relationships)</span>
            </h3>
            <p className="text-[11px] text-gray-500 select-none">
              点击下方图谱节点，可快速在图谱详情面板中加载其元数据关联。
            </p>

            <KnowledgeGraph
              nodes={graph.nodes}
              edges={graph.edges}
              onNavigate={onNavigate}
              height={260}
            />
          </section>

          {/* I. Entry Version Timeline Module */}
          <section id="version-timeline" className="pt-6 border-t-2 border-gray-900">
            <EntryVersionHistory 
              entry={entry} 
              onRollbackSuccess={(restoredEntry) => setEntry(restoredEntry)} 
            />
          </section>

          {/* J. Modification Logs footer */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-mono select-none">
            <span className="flex items-center">
              <History className="w-3.5 h-3.5 mr-1" />
              <span>最后由 {entry.owner} 审阅</span>
            </span>
            <span>建立时间：{entry.createdAt}</span>
          </div>

        </div>

        {/* RIGHT COLUMN: Sidebar Metadata & Auxiliary Panels */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Entry Version Metadata Sidebar Card */}
          <EntryVersionMeta entry={entry} />

          {/* Owner Desk card */}
          <div className="bg-white border border-gray-200 rounded p-4 space-y-3 select-none">
            <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              条目归属与可见度
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">责任专家：</span>
                <span className="font-semibold text-gray-800 flex items-center">
                  <User className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  {entry.owner}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">负责科室：</span>
                <span className="font-semibold text-gray-800">{entry.ownerDepartment}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">密级权限：</span>
                <VisibilityBadge visibility={entry.visibility} />
              </div>
            </div>
          </div>

          {/* Related Entries */}
          <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              关联学术推荐
            </h3>
            <RelatedKnowledge
              relatedEntries={relatedEntries}
              onNavigate={onNavigate}
            />
          </div>

        </div>

      </div>

    </div>
  );
}
