import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { WikiEntry, SourceFile, MarkdownFile, KnowledgeGraphNode, KnowledgeGraphEdge, BusinessMetric } from '../types/wiki';
import { entriesApi } from '../api/entriesApi';
import { filesApi } from '../api/filesApi';
import { stripDataUriImages } from '../utils/adapter';
import { markdownApi } from '../api/markdownApi';
import { graphApi } from '../api/graphApi';
import { mockBusinessMetrics, mockReferences } from '../mock/mockData';
import Breadcrumbs from '../components/Breadcrumbs';
import EntryTypeBadge from '../components/EntryTypeBadge';
import VisibilityBadge from '../components/VisibilityBadge';
import TagList from '../components/TagList';
import SourceFileList from '../components/SourceFileList';
import MarkdownPreview from '../components/MarkdownPreview';
import ReferenceList from '../components/ReferenceList';
import KnowledgeGraph from '../components/KnowledgeGraph';
import Unauthorized from '../components/Unauthorized';
import { 
  Bookmark, User, Share2, History, Database, Network, Clock, 
  TrendingUp, Cpu, FileDown, ShieldCheck, List, Terminal 
} from 'lucide-react';
import { EntryVersionMeta, EntryVersionHistory } from '../components/VersionComponents';

interface SandboxProjectPageProps {
  entryId: string;
  onNavigate: (view: string, id?: string) => void;
}

export default function SandboxProjectPage({ entryId, onNavigate }: SandboxProjectPageProps) {
  const { isLoggedIn } = useAuth();
  const [entry, setEntry] = useState<any>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [graph, setGraph] = useState<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }>({ nodes: [], edges: [] });
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mdFile, setMdFile] = useState<MarkdownFile | null>(null);
  const [metrics, setMetrics] = useState<BusinessMetric[]>([]);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [relatedEntries, setRelatedEntries] = useState<any[]>([]);

  // Graph state
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{
    name: string;
    type: string;
    relationship: string;
    id: string;
  } | null>(null);

  useEffect(() => {
    const loadProjectData = async () => {
      setErrorState(null);
      setFiles([]);
      setSelectedFileId(null);
      setMdFile(null);
      setSelectedNodeInfo(null);

      try {
        const loadedEntry = await entriesApi.getEntryById(entryId);
        setEntry(loadedEntry);

        // Bookmark state mock
        setBookmarked(true);

        // Load files
        const loadedFiles = await filesApi.getFilesByEntryId(entryId);
        setFiles(loadedFiles);

        // Load focused subgraph centering on this entry
        const subGraph = await graphApi.getFocusedGraph(entryId);
        setGraph(subGraph);

        // Load business metrics
        const listMetrics = mockBusinessMetrics.filter(m => m.projectEntryId === entryId);
        setMetrics(listMetrics);

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

    loadProjectData();
  }, [entryId, isLoggedIn]);

  const handlePreviewMarkdown = async (sourceFileId: string) => {
    setSelectedFileId(sourceFileId);
    const md = await markdownApi.getMarkdownBySourceFileId(sourceFileId);
    setMdFile(md);
    
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
        正在拉取沙箱项目过程、计算日志与 RAG 活性服务...
      </div>
    );
  }

  // Create breadcrumb array
  const breadcrumbPaths = [
    { label: '首页', view: isLoggedIn ? 'internal-home' : 'public-home' },
    { label: 'Sandbox 项目知识库', view: 'search' },
    { label: entry.title }
  ];

  // Define Table of Contents
  const tocItems = [
    { id: 'overview', label: '1. 项目概述' },
    { id: 'timeline', label: '2. 实验进程追溯' },
    { id: 'bindings', label: '3. 物理仿真绑定' },
    { id: 'source-files', label: '4. 本实验输出文件' },
    ...(mdFile ? [{ id: 'markdown-view', label: '5. Markdown 提取预览' }] : []),
    { id: 'references', label: '6. 引航文献依据' },
    { id: 'services', label: '7. 可调用研发服务' },
    { id: 'roi', label: '8. 商业化价值评估' },
    { id: 'graph-navigation', label: '9. 知识关系网图' },
    { id: 'version-timeline', label: '10. 历史版本更迭' }
  ];

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
    <div className="space-y-6" id={`sandbox-project-page-${entry.id}`}>
      
      {/* 1. Breadcrumbs & Actions Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-3 gap-2 select-none">
        <Breadcrumbs paths={breadcrumbPaths} onNavigate={onNavigate} />

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded font-mono font-bold uppercase select-none">
            项目状态: 仿真完成并归档
          </span>
          
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
        </div>
      </div>

      {/* 2. Three-column Layout (TOC Left, Content Center, Meta Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Table of Contents */}
        <div className="lg:col-span-2 space-y-3 lg:sticky lg:top-4 select-none hidden lg:block border-r border-gray-100 pr-3">
          <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider flex items-center pb-1.5 border-b border-gray-100">
            <List className="w-3.5 h-3.5 mr-1" />
            <span>项目目录</span>
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
              最新更新时间：{entry.latestUpdatedAt}
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
            
            <div className="border-l-4 border-[#2B3150] bg-gray-50 p-3.5 text-xs text-gray-600 leading-relaxed font-sans italic">
              <strong>条目摘要：</strong>{entry.summary}
            </div>

            <TagList tags={entry.tags} />
          </div>

          {/* C. Primary Article Prose */}
          <section id="content" className="space-y-4 pt-4 border-t border-gray-100">
            <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider pb-1 border-b border-gray-200 select-none">
              项目背景与纠错说明
            </h2>

            <article className="prose prose-sm max-w-none text-xs text-gray-700 leading-relaxed select-text font-sans">
              {stripDataUriImages(entry.content).split('\n').map((line: string, idx: number) => {
                if (line.startsWith('# ')) return null;
                if (line.startsWith('## ')) {
                  return (
                    <h3 key={idx} className="text-base font-extrabold text-gray-900 border-b border-gray-150 pb-1 mt-6 mb-3">
                      {line.replace('## ', '')}
                    </h3>
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

          {/* D. Sandbox Traceability Timeline (No heavy card stacking) */}
          <section id="timeline" className="pt-6 border-t border-gray-200 space-y-4">
            <h3 className="font-extrabold text-xs text-[#2B3150] uppercase tracking-wide flex items-center space-x-1.5 border-b border-gray-150 pb-2 select-none">
              <Clock className="w-4 h-4 text-[#DB5F5B]" />
              <span>Sandbox 实验过程追溯时间线 (Process Traceability)</span>
            </h3>

            <div className="relative border-l-2 border-gray-200 ml-3 space-y-5 py-1 select-none text-xs">
              <div className="relative pl-6">
                <div className="absolute -left-[7px] top-1.5 bg-[#DB5F5B] h-3 w-3 rounded-full border-2 border-white" />
                <span className="text-[10px] text-[#DB5F5B] font-bold font-mono">2026-06-25 09:00</span>
                <h4 className="font-bold text-gray-800">实验需求提出</h4>
                <p className="text-gray-500 text-[11px] mt-0.5">量子计算实验室张研究员提交纠错实验申请，确定码距 d=3, 运行 Monte Carlo 模拟次数 10M 次。</p>
              </div>

              <div className="relative pl-6">
                <div className="absolute -left-[7px] top-1.5 bg-[#2B3150] h-3 w-3 rounded-full border-2 border-white" />
                <span className="text-[10px] text-gray-500 font-bold font-mono">2026-06-26 14:10</span>
                <h4 className="font-bold text-gray-800">稳定子算法优化与编译</h4>
                <p className="text-gray-500 text-[11px] mt-0.5">核心算子哈密顿纠错线路编写完成，通过自研编译器将其编译为可并发执行的比特仿真矩阵格式。</p>
              </div>

              <div className="relative pl-6">
                <div className="absolute -left-[7px] top-1.5 bg-[#2B3150] h-3 w-3 rounded-full border-2 border-white" />
                <span className="text-[10px] text-gray-500 font-bold font-mono">2026-06-28 10:00</span>
                <h4 className="font-bold text-gray-800">算力模拟大厅挂载计算</h4>
                <p className="text-gray-500 text-[11px] mt-0.5">向物理计算大厅 SB-8849-QC 分配计算节点，调用 100 组 Monte Carlo 算子并发扫描 0.0001 至 0.1 泡利偏置差错率。</p>
              </div>

              <div className="relative pl-6">
                <div className="absolute -left-[7px] top-1.5 bg-yellow-500 h-3 w-3 rounded-full border-2 border-white" />
                <span className="text-[10px] text-yellow-600 font-bold font-mono">2026-06-30 14:22</span>
                <h4 className="font-bold text-gray-800">结果转化与 MarkItDown 提取</h4>
                <p className="text-gray-500 text-[11px] mt-0.5">仿真计算完成，输出结果 stabilizer_project_result.pdf。Wiki 自动监测触发 <strong>MarkItDown</strong> 文本转化，生成 Markdown 文档并建立 RAG 向量切片。</p>
              </div>

              <div className="relative pl-6">
                <div className="absolute -left-[7px] top-1.5 bg-green-500 h-3 w-3 rounded-full border-2 border-white" />
                <span className="text-[10px] text-green-600 font-bold font-mono">2026-06-30 15:45</span>
                <h4 className="font-bold text-gray-800">人工复核与知识服务挂载</h4>
                <p className="text-gray-500 text-[11px] mt-0.5">张研究员登录复核，确认物理伪阈值为 1.52% 并一键批准归档。Wiki 系统自动对外挂载配套 RAG 和 MCP 调用服务，MiQi 助手无缝解锁查询动作。</p>
              </div>
            </div>
          </section>

          {/* E. Bindings Info */}
          <section id="bindings" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-[#2B3150] uppercase tracking-wide flex items-center space-x-1.5 select-none pb-1.5 border-b border-gray-150">
              <Cpu className="w-4 h-4 text-[#DB5F5B]" />
              <span>关联底层沙箱运行实例 (Sandbox Engine Bindings)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs text-gray-600">
              <div className="border border-gray-200 p-2.5 bg-gray-50 rounded">
                <span className="font-bold text-gray-500 block text-[10px]">SANDBOX INSTANCE ID</span>
                <span className="text-blue-700 font-bold font-mono">SB-8849-QC</span>
              </div>
              <div className="border border-gray-200 p-2.5 bg-gray-50 rounded">
                <span className="font-bold text-gray-500 block text-[10px]">MIQI SESSION ID</span>
                <span className="text-[#DB5F5B] font-bold font-mono">MQ-SESS-9922</span>
              </div>
            </div>
          </section>

          {/* F. Sandbox File outputs */}
          <section id="source-files" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none">
              <Database className="w-4 h-4 mr-1 text-gray-500" />
              <span>本实验输出物理文件与 MarkItDown 归档 (Source Files)</span>
            </h3>
            <SourceFileList
              files={files}
              onPreviewMarkdown={handlePreviewMarkdown}
            />
          </section>

          {/* Markdown previewer inside content */}
          {mdFile && (
            <section id="markdown-view" className="pt-6 border-t-2 border-gray-900 space-y-3">
              <h3 className="font-extrabold text-xs text-red-700 uppercase tracking-wide flex items-center select-none">
                <Terminal className="w-4 h-4 mr-1 text-red-600 animate-pulse" />
                <span>MarkItDown 实时文本结构解析预览</span>
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

          {/* G. Citations (Tabular style) */}
          <section id="references" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none">
              <History className="w-4 h-4 mr-1 text-gray-500" />
              <span>引航文献与关系树对齐 (Reference Citations)</span>
            </h3>
            <ReferenceList
              references={mockReferences}
              onNavigate={onNavigate}
            />
          </section>

          {/* H. Actionable Services List */}
          <section id="services" className="pt-6 border-t border-gray-200 space-y-4">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none pb-1.5 border-b border-gray-150">
              <Cpu className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              <span>注册的 AI 活性研发服务</span>
            </h3>
            
            <div className="space-y-4 text-xs font-sans">
              
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-gray-900 text-sm">RAG 知识检索服务</span>
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] px-1 rounded font-bold font-mono">可调用</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  用于基于该项目的 Markdown、引用文献和结果文件进行智能问答。
                </p>
                <div className="grid grid-cols-2 gap-4 text-[11px] py-1 font-mono text-gray-400">
                  <div><span className="font-bold">输入：</span>自然语言问题 (Natural Language Query)</div>
                  <div><span className="font-bold">输出：</span>带有 reference 溯源位置的回答</div>
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-gray-900 text-sm">MCP 工具服务</span>
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] px-1 rounded font-bold font-mono">可调用</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  允许 MiQi 助手或外部大模型 Agent 直接拉取本项目底层的计算日志和矩阵数据实体。
                </p>
                <div className="grid grid-cols-2 gap-4 text-[11px] py-1 font-mono text-gray-400">
                  <div><span className="font-bold">输入：</span>项目 ID / 检索变量</div>
                  <div><span className="font-bold">输出：</span>结构化实体 JSON 数据</div>
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-gray-900 text-sm">MiQi 活性可调用服务</span>
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] px-1 rounded font-bold font-mono">可调用</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  大模型会在与研究员的对话中自适应触发，调用该项目计算伪阈值结论。
                </p>
              </div>

            </div>
          </section>

          {/* I. ROI Metrics (Tabular description list - NO heavy cards) */}
          <section id="roi" className="pt-6 border-t border-gray-200 space-y-3.5">
            <h3 className="font-extrabold text-xs text-[#2B3150] uppercase tracking-wide flex items-center space-x-1.5 border-b border-gray-150 pb-2 select-none">
              <TrendingUp className="w-4 h-4 text-[#DB5F5B]" />
              <span>项目商业化价值评估 (ROI Metrics)</span>
            </h3>

            <div className="space-y-3 text-xs pl-1">
              {metrics.map((metric) => (
                <div key={metric.id} className="border-b border-gray-150 pb-2">
                  <div className="flex justify-between items-baseline">
                    <span className="font-extrabold text-gray-900">{metric.metricName}</span>
                    <span className="font-mono text-xs text-[#DB5F5B] font-extrabold">{metric.metricValue}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">数据溯源及审计范围: {metric.source}</p>
                </div>
              ))}
              
              <button
                onClick={() => alert('[Mock PPT 汇报宣传大纲] 已为您基于 SB-8849-QC 项目的 10M 仿真日志、Gottesman 论文关联以及 320% ROI 预测，自动汇总了一份汇报大纲简报。')}
                className="bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-[10px] px-4 py-1.5 border border-gray-900 transition-all block mt-2"
              >
                一键生成商业宣传汇报简报
              </button>
            </div>
          </section>

          {/* J. Knowledge Graph Relationship Center */}
          <section id="graph-navigation" className="pt-6 border-t border-gray-200 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-800 uppercase tracking-wide flex items-center select-none">
              <Network className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              <span>关联物理知识关系网图 (Project Relationships)</span>
            </h3>

            <KnowledgeGraph
              nodes={graph.nodes}
              edges={graph.edges}
              onNavigate={onNavigate}
              height={240}
            />
          </section>

          {/* K. Interactive Version History Timeline */}
          <section id="version-timeline" className="pt-6 border-t-2 border-gray-900">
            <EntryVersionHistory 
              entry={entry} 
              onRollbackSuccess={(restoredEntry) => setEntry(restoredEntry)} 
            />
          </section>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-mono select-none">
            <span className="flex items-center">
              <History className="w-3.5 h-3.5 mr-1" />
              <span>最后由 {entry.owner} 审阅</span>
            </span>
            <span>建立时间：{entry.createdAt}</span>
          </div>

        </div>

        {/* RIGHT COLUMN: Sidebar Metadata Panel */}
        <div className="lg:col-span-3 space-y-4">
          
          <EntryVersionMeta entry={entry} />

          <div className="bg-white border border-gray-200 rounded p-4 space-y-3 select-none">
            <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              项目团队与责任归属
            </h3>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>所属科室:</span>
                <span className="font-semibold text-gray-800">平台算法组 / 量子实验室</span>
              </div>
              <div className="flex justify-between">
                <span>物理负责人:</span>
                <span className="font-semibold text-gray-800">张研究员</span>
              </div>
              <div className="flex justify-between">
                <span>密级权限:</span>
                <VisibilityBadge visibility={entry.visibility} />
              </div>
            </div>
          </div>

          {/* Related Entries */}
          <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
            <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              推荐关联文献与项目
            </h3>
            <div className="space-y-2.5 text-xs">
              {relatedEntries.map((res) => (
                <button
                  key={res.id}
                  onClick={() => onNavigate('entry-detail', res.id)}
                  className="w-full text-left font-bold text-[#1D70B8] hover:underline block leading-relaxed"
                >
                  {res.title}
                </button>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
