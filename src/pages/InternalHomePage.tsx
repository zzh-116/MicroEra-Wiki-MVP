import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Clock, Bookmark, ChevronRight, ArrowRight, Cpu, Database, Network, Activity } from 'lucide-react';
import { WikiEntry } from '../types/wiki';
import { entriesApi } from '../api/entriesApi';
import { bookmarksApi } from '../api/bookmarksApi';
import { storage } from '../lib/storage';
import EntryTypeBadge from '../components/EntryTypeBadge';

interface InternalHomePageProps {
  onNavigate: (view: string, id?: string) => void}

export default function InternalHomePage() {
  const navigate = useNavigate();
  const [recentEntries, setRecentEntries] = useState<WikiEntry[]>([]);
  const [favorites, setFavorites] = useState<WikiEntry[]>([]);
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const loadEntries = async () => {
      try {
        const list = await entriesApi.getEntries();
        // Sort by update time
        const sorted = [...list].sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
        setRecentEntries(sorted.slice(0, 5));

        // Load real favorites from backend
        try {
          const favs = await bookmarksApi.getBookmarks();
          setFavorites(favs);
        } catch {
          setFavorites([]);
        }} catch (err) {
        console.error('Error loading internal home:', err)}
    };
    loadEntries()}, []);

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      storage.setQuickQuestion(searchInput);
      navigate('/ai-query')}
  };

  const handleQuickQuestion = (q: string) => {
    storage.setQuickQuestion(q);
    navigate('/ai-query')};

  return (
    <div className="space-y-10" id="internal-home-panel">
      
      {/* 1. Header & AI Query Box (Plain, high efficiency) */}
      <div className="border-b-4 border-[#2B3150] pb-8 pt-4 space-y-5">
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center space-x-1.5 text-xs text-[#DB5F5B] font-bold select-none uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-[#DB5F5B] animate-pulse" />
            <span>企业研发知识工作台 (Internal Grounding Node Desk)</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#2B3150] font-sans">
            您好，研发员。今天想查阅什么？
          </h1>
          <p className="text-xs text-gray-500 leading-relaxed">
            在此您可以秒级检索企业知识、检索计算模型哈希、追溯 Sandbox 物理实验过程或向内置 AI 智能体提问。
          </p>
        </div>

        {/* Big AI Q&A Launcher */}
        <form onSubmit={handleAskSubmit} className="max-w-2xl flex select-none">
          <div className="relative flex-grow">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </span>
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-gray-900 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B] text-xs font-sans placeholder-gray-400 font-medium"
              placeholder="直接输入自然语言问题向 MiQi / RAG 提问，系统将智能提取公式并溯源文献..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-xs px-5 py-2.5 border-2 border-l-0 border-gray-900 transition-all flex items-center space-x-1 shrink-0"
          >
            <span>提问</span>
          </button>
        </form>

        {/* Quick questions link list */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase select-none">快速问答建议：</span>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              '稳定子算法纠错结果是什么？',
              '量子计算方向节省了多少成本？',
              '稳定子计算结果 Schema 详细规范'
            ].map((q) => (
              <button
                key={q}
                onClick={() => handleQuickQuestion(q)}
                className="text-[#1D70B8] hover:underline font-semibold bg-gray-50 hover:bg-gray-100/80 px-2.5 py-1 border border-gray-300 rounded text-left transition-all"
              >
                {q} &rarr;
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Categorized Entrance Links (Services and Information style, no card grids) */}
      <div className="space-y-4">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 select-none">
          常用工作台入口 (Popular On Workspace)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs font-sans">
          
          <div className="space-y-1.5">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 flex items-center">
              <Cpu className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
              <span>Sandbox 物理项目库</span>
            </h3>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              记录和对比 Sandbox 的多项多项式仿真过程。
            </p>
            <button 
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="text-[#1D70B8] hover:underline font-bold text-[11px] block"
            >
              进入稳定子仿真项目 &rarr;
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 flex items-center">
              <Database className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
              <span>学术与论文文献库</span>
            </h3>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              包含 Daniel Gottesman 等核心学者的纠错仿真研究白皮书。
            </p>
            <button 
              onClick={() => navigate('/papers')}
              className="text-[#1D70B8] hover:underline font-bold text-[11px] block"
            >
              浏览论文文献库 &rarr;
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 flex items-center">
              <Network className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
              <span>研发数据规范与结构</span>
            </h3>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              定义三斜晶格、纠错概率矩阵及 Hamiltonian 数据结构 Schema。
            </p>
            <button 
              onClick={() => navigate('/data-items')}
              className="text-[#1D70B8] hover:underline font-bold text-[11px] block"
            >
              查看数据条目标准 &rarr;
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 flex items-center">
              <Bookmark className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
              <span>研发文档与合规模板</span>
            </h3>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              提供统一的实验日志、报告公式及复盘文档的 Markdown 模版。
            </p>
            <button 
              onClick={() => navigate('/templates')}
              className="text-[#1D70B8] hover:underline font-bold text-[11px] block"
            >
              进入标准模板库 &rarr;
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 flex items-center">
              <Sparkles className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
              <span>商业化价值与 ROI</span>
            </h3>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              汇总量子计算、生物及材料算法产出为公司带来的资金和时间收益。
            </p>
            <button 
              onClick={() => navigate('/business-value')}
              className="text-[#1D70B8] hover:underline font-bold text-[11px] block"
            >
              查看商业化评估 &rarr;
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 flex items-center">
              <Network className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
              <span>全局语义知识图谱</span>
            </h3>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              全域节点交互式关联跳转，可按引用、源文件及服务类型过滤。
            </p>
            <button 
              onClick={() => navigate('/graph')}
              className="text-[#1D70B8] hover:underline font-bold text-[11px] block"
            >
              打开知识图谱视角 &rarr;
            </button>
          </div>

        </div>
      </div>

      {/* 3. My Bookmarks (星标收藏) */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 flex items-center select-none">
          <Bookmark className="w-4 h-4 mr-1.5 text-yellow-500 fill-yellow-500" />
          <span>我的星标收藏 (My Bookmarks)</span>
        </h2>

        {favorites.length === 0 ? (
          <p className="text-xs text-gray-400 italic">暂无收藏。在知识条目中点击 [收藏条目] 即可在此置顶。</p>
        ) : (
          <ul className="space-y-2.5 text-xs font-sans pl-1">
            {favorites.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between border-b border-gray-100 pb-2 gap-2">
                <div className="space-y-0.5 min-w-0 flex-1 overflow-hidden">
                  <button
                    onClick={() => navigate(`/entry/${entry.id}`)}
                    className="text-[#1D70B8] hover:underline font-bold text-left block truncate w-full"
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                  <p className="text-gray-500 text-[11px] line-clamp-1 break-all">{entry.summary}</p>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 font-semibold bg-gray-100 text-gray-600 rounded whitespace-nowrap">
                    <EntryTypeBadge type={entry.entryType} />
                  </span>
                  <Bookmark className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 4. Recently Updated Entries (最新更新企业知识) */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 flex items-center select-none">
          <Clock className="w-4 h-4 mr-1.5 text-[#DB5F5B]" />
          <span>最新更新内部知识 (Recently Updated Entries)</span>
        </h2>

        <div className="space-y-3.5 text-xs font-sans pl-1">
          {recentEntries.map((entry) => (
            <div key={entry.id} className="border-l-2 border-gray-200 pl-4 relative">
              <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-[#DB5F5B] border-2 border-white" />
              <span className="font-mono text-[10px] text-gray-400 block font-bold truncate">更新时间：{entry.latestUpdatedAt}</span>
              <div className="mt-0.5 space-y-0.5 min-w-0 overflow-hidden">
                <button
                  onClick={() => navigate(`/entry/${entry.id}`)}
                  className="text-[#1D70B8] hover:underline font-bold text-left block truncate w-full"
                  title={entry.title}
                >
                  {entry.title}
                </button>
                <p className="text-gray-500 text-[11px] leading-relaxed line-clamp-2 break-all">
                  {entry.summary}
                </p>
                <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono select-none pt-0.5">
                  <span className="font-bold text-gray-600 bg-gray-100 px-1 rounded uppercase whitespace-nowrap">{entry.entryType}</span>
                  <span className="truncate">负责人：{entry.owner}</span>
                  <span className="whitespace-nowrap">可见范围：{entry.visibility.toUpperCase()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. System Reference Notes */}
      <div className="bg-gray-50 border border-gray-200 rounded p-4 text-[11px] text-gray-500 font-sans leading-relaxed select-none">
        <span className="font-bold text-[#2B3150] block mb-1">💡 物理计算平台指引</span>
        所有在这里修改或导入的实验过程，都会经由后台算子转化为标准 Markdown。
        如需发布新的可外部调用 MCP 接口，请进入
        <button onClick={() => navigate('/admin/import')} className="text-blue-700 hover:underline mx-1 font-bold">【文件导入】</button>
        或联系 Xue Yue 进行权限提权。
      </div>

    </div>
  )}
