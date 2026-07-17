import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Activity, Award } from 'lucide-react';
import { WikiEntry } from '../types/wiki';
import { entriesApi } from '../api/entriesApi';

export default function PublicHomePage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [publicEntries, setPublicEntries] = useState<WikiEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  useEffect(() => {
    const fetchPublic = async () => {
      setEntriesLoading(true);
      try {
        const data = await entriesApi.getEntries({ visibility: 'public' });
        setPublicEntries(data);
      } catch {
        setPublicEntries([]);
      }
      setEntriesLoading(false);
    };
    fetchPublic();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput)}`)}
  };

  // Helper function to handle fast query navigation
  const handleQuickNav = (query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`)};

  return (
    <div className="space-y-10" id="public-home-panel">
      
      {/* 1. Hero / Page Description Area (Clean, text-heavy, no big image banners) */}
      <div className="border-b-4 border-[#2B3150] pb-8 pt-4 space-y-5">
        <div className="space-y-2 max-w-3xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#2B3150] font-sans">
            微观纪元 Wiki
          </h1>
          <p className="text-sm font-bold text-gray-700 leading-snug">
            连接 Sandbox 项目过程、结果、引用文献、数据条目与 MiQi 服务的企业知识入口。
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            在这里可以查找项目过程、实验/计算结果、引用文献、数据定义、技术条目、标准文件和可调用知识服务。
          </p>
        </div>

        {/* Big Search Input */}
        <form onSubmit={handleSearchSubmit} className="max-w-2xl flex select-none">
          <div className="relative flex-grow">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </span>
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-gray-900 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B] text-xs font-sans placeholder-gray-400 font-medium"
              placeholder="搜索知识、项目、论文、数据条目或直接提问……"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-xs px-5 py-2.5 border-2 border-l-0 border-gray-900 transition-all flex items-center space-x-1 shrink-0"
          >
            <span>搜索</span>
          </button>
        </form>

        {/* Quick links beneath the search */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold pt-1 select-none">
          <button onClick={() => navigate('/search')} className="text-blue-700 hover:underline hover:text-blue-800 flex items-center">
            查看全部 Sandbox 项目 <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button onClick={() => navigate('/papers')} className="text-blue-700 hover:underline hover:text-blue-800 flex items-center">
            查看论文知识库 <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button onClick={() => navigate('/data-items')} className="text-blue-700 hover:underline hover:text-blue-800 flex items-center">
            查看数据条目 <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button onClick={() => navigate('/search')} className="text-blue-700 hover:underline hover:text-blue-800 flex items-center">
            查看可调用服务 <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button onClick={() => navigate('/admin/import')} className="text-blue-700 hover:underline hover:text-blue-800 flex items-center">
            上传并整理文档 <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* 2. Popular on Miqro Wiki (常用知识入口) */}
      <div className="space-y-4">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 flex items-center select-none">
          <span className="bg-[#DB5F5B] text-white text-[10px] px-1.5 py-0.5 mr-2 font-bold font-mono">POPULAR</span>
          <span>常用知识入口 (Popular on Miqro Wiki)</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-xs font-sans">
          
          <div className="space-y-1">
            <button 
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              稳定子算法 Sandbox 计算项目
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              记录该纠错物理算法的过程步骤、结果文件、学术论文引用、以及挂载为 RAG 与 MCP 沙箱服务形式。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => handleQuickNav('结果')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              量子计算项目结果汇总
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              基于 Monte Carlo 数值仿真的零错阈值与残余错误概率指标，支持物理计算文件的自动同步与审查。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => navigate('/data-items')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              材料结构数据条目
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              微观纪元特有的三斜晶格与双层拓扑相变物理性质的数据结构、导入标准和可计算格式说明。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => navigate('/data-items')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              实验数据存储结构说明
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              规范多项式 Hamilotonian 生成矩阵的 JSON 标准定义，以及 NAS 中各 Session 临时物理计算文件的映射关联。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => handleQuickNav('AI')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              AI 驱动的实验数据分析能力
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              通过智能解析技术（MarkItDown）提取文献公式并连线图谱结构，提供秒级大模型（MiQi）交互推理。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => navigate('/templates')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              项目复盘报告模板
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              内部算法研发合规流程所使用的统一复盘报告 Markdown 提纲及公式填写标准模版。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => navigate('/ai-query')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              稳定子算法知识查询服务
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              基于特定纠错码沙箱模拟的 RAG 查询接口，支持自然语言提问与源文献哈希校验溯源。
            </p>
          </div>

          <div className="space-y-1">
            <button 
              onClick={() => navigate('/admin/import')}
              className="text-[#1D70B8] hover:underline hover:text-blue-800 font-bold text-left block"
            >
              MarkItDown 文件入库流程
            </button>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              描述物理 PDF 论文、实验 CIF 及 TXT 文件入库、自动翻译 Markdown 结构并产生 Reference 的完整链路。
            </p>
          </div>

        </div>
      </div>

      {/* 3. Services and information (服务与信息) */}
      <div className="space-y-5">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 select-none">
          服务与信息 (Services and information)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 text-xs font-sans">
          
          {/* Section 1 */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 text-[11px] uppercase tracking-wide">
              Sandbox 项目知识
            </h3>
            <ul className="space-y-2 text-[#1D70B8]">
              <li><button onClick={() => navigate('/entry/e-stabilizer-project')} className="hover:underline font-semibold block text-left">项目过程记录</button></li>
              <li><button onClick={() => handleQuickNav('结果')} className="hover:underline font-semibold block text-left">项目结果文件</button></li>
              <li><button onClick={() => handleQuickNav('Gottesman')} className="hover:underline font-semibold block text-left">项目引用文献</button></li>
              <li><button onClick={() => handleQuickNav('Session')} className="hover:underline font-semibold block text-left">Sandbox 任务与 MiQi Session</button></li>
              <li><button onClick={() => navigate('/graph')} className="hover:underline font-semibold block text-left">项目知识图谱</button></li>
              <li><button onClick={() => navigate('/entry/e-stabilizer-project')} className="hover:underline font-semibold block text-left">项目服务化状态</button></li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 text-[11px] uppercase tracking-wide">
              论文知识库
            </h3>
            <ul className="space-y-2 text-[#1D70B8]">
              <li><button onClick={() => navigate('/papers')} className="hover:underline font-semibold block text-left">量子计算论文</button></li>
              <li><button onClick={() => navigate('/papers')} className="hover:underline font-semibold block text-left">生物方向论文</button></li>
              <li><button onClick={() => navigate('/papers')} className="hover:underline font-semibold block text-left">材料方向论文</button></li>
              <li><button onClick={() => navigate('/graph')} className="hover:underline font-semibold block text-left">论文与项目关联</button></li>
              <li><button onClick={() => navigate('/papers')} className="hover:underline font-semibold block text-left">论文 PDF 与 Markdown 结果</button></li>
              <li><button onClick={() => navigate('/papers')} className="hover:underline font-semibold block text-left">论文引用来源</button></li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 text-[11px] uppercase tracking-wide">
              数据条目与标准
            </h3>
            <ul className="space-y-2 text-[#1D70B8]">
              <li><button onClick={() => navigate('/data-items')} className="hover:underline font-semibold block text-left">数据定义</button></li>
              <li><button onClick={() => navigate('/data-items')} className="hover:underline font-semibold block text-left">数据格式</button></li>
              <li><button onClick={() => navigate('/data-items')} className="hover:underline font-semibold block text-left">数据库 Schema</button></li>
              <li><button onClick={() => navigate('/data-items')} className="hover:underline font-semibold block text-left">存储位置说明</button></li>
              <li><button onClick={() => navigate('/data-items')} className="hover:underline font-semibold block text-left">跨组协作数据</button></li>
              <li><button onClick={() => navigate('/data-items')} className="hover:underline font-semibold block text-left">数据更新时间记录</button></li>
            </ul>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 text-[11px] uppercase tracking-wide">
              知识服务
            </h3>
            <ul className="space-y-2 text-[#1D70B8]">
              <li><button onClick={() => navigate('/ai-query')} className="hover:underline font-semibold block text-left">RAG 查询服务</button></li>
              <li><button onClick={() => navigate('/system-version')} className="hover:underline font-semibold block text-left">MCP 工具服务</button></li>
              <li><button onClick={() => navigate('/ai-query')} className="hover:underline font-semibold block text-left">MiQi 可调用服务</button></li>
              <li><button onClick={() => navigate('/system-version')} className="hover:underline font-semibold block text-left">服务输入输出 Schema</button></li>
              <li><button onClick={() => navigate('/entry/e-stabilizer-project')} className="hover:underline font-semibold block text-left">服务调用状态</button></li>
              <li><button onClick={() => navigate('/entry/e-stabilizer-project')} className="hover:underline font-semibold block text-left">服务 Reference 来源</button></li>
            </ul>
          </div>

          {/* Section 5 */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 text-[11px] uppercase tracking-wide">
              模板与标准文件
            </h3>
            <ul className="space-y-2 text-[#1D70B8]">
              <li><button onClick={() => navigate('/templates')} className="hover:underline font-semibold block text-left">项目复盘模板</button></li>
              <li><button onClick={() => navigate('/templates')} className="hover:underline font-semibold block text-left">实验记录模板</button></li>
              <li><button onClick={() => navigate('/templates')} className="hover:underline font-semibold block text-left">报告模板</button></li>
              <li><button onClick={() => navigate('/templates')} className="hover:underline font-semibold block text-left">官方核准文件</button></li>
              <li><button onClick={() => navigate('/system-version')} className="hover:underline font-semibold block text-left">历史版本</button></li>
              <li><button onClick={() => navigate('/templates')} className="hover:underline font-semibold block text-left">下载与复用</button></li>
            </ul>
          </div>

          {/* Section 6 */}
          <div className="space-y-2">
            <h3 className="font-extrabold text-gray-900 border-b border-gray-150 pb-1 text-[11px] uppercase tracking-wide">
              商业价值展示
            </h3>
            <ul className="space-y-2 text-[#1D70B8]">
              <li><button onClick={() => navigate('/business-value')} className="hover:underline font-semibold block text-left">项目商业价值</button></li>
              <li><button onClick={() => navigate('/business-value')} className="hover:underline font-semibold block text-left">成果物画廊</button></li>
              <li><button onClick={() => navigate('/business-value')} className="hover:underline font-semibold block text-left">宣传简报</button></li>
              <li><button onClick={() => navigate('/business-value')} className="hover:underline font-semibold block text-left">专利产出</button></li>
              <li><button onClick={() => navigate('/business-value')} className="hover:underline font-semibold block text-left">论文产出</button></li>
              <li><button onClick={() => navigate('/business-value')} className="hover:underline font-semibold block text-left">客户展示材料</button></li>
            </ul>
          </div>

        </div>
      </div>

      {/* 4. Featured (重点推荐 - Clean layout with a light gray background panel) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center select-none pb-2 border-b border-gray-200">
          <Award className="w-4 h-4 mr-1.5 text-[#DB5F5B]" />
          <span>重点推荐 (Featured)</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          
          <div className="space-y-1.5">
            <button 
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="text-[#1D70B8] hover:underline font-bold text-left block text-sm"
            >
              稳定子算法 Sandbox 计算项目
            </button>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              查看该项目的完整仿真过程记录、结果文件、物理模型引用文献、对应关系图谱以及封装好的 MCP 知识工具包。
            </p>
            <button 
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="text-[#2B3150] hover:underline font-bold text-[10px] block"
            >
              查看详情 →
            </button>
          </div>

          <div className="space-y-1.5">
            <button 
              onClick={() => navigate('/papers')}
              className="text-[#1D70B8] hover:underline font-bold text-left block text-sm"
            >
              论文知识库：量子计算方向
            </button>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              收录 Daniel Gottesman 及团队的前沿学术论文，支持 PDF 物理文件入库、公式自动提取和知识图谱节点关联。
            </p>
            <button 
              onClick={() => navigate('/papers')}
              className="text-[#2B3150] hover:underline font-bold text-[10px] block"
            >
              查看详情 →
            </button>
          </div>

          <div className="space-y-1.5">
            <button 
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="text-[#1D70B8] hover:underline font-bold text-left block text-sm"
            >
              项目知识服务化流程
            </button>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              了解微观纪元研发人员如何将冷数据一键打包，并在 MiQi 智能体内进行免配置、可追溯的安全授权调用。
            </p>
            <button 
              onClick={() => navigate('/entry/e-stabilizer-project')}
              className="text-[#2B3150] hover:underline font-bold text-[10px] block"
            >
              查看详情 →
            </button>
          </div>

        </div>
      </div>

      {/* 5. Government Activity / Latest Updates (最新知识活动) */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 flex items-center select-none">
          <Activity className="w-4 h-4 mr-1.5 text-[#DB5F5B]" />
          <span>最新知识活动 (Latest updates)</span>
        </h2>

        <div className="space-y-3.5 text-xs font-sans pl-1">
          
          <div className="border-l-2 border-gray-200 pl-4 relative">
            <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-[#DB5F5B] border-2 border-white" />
            <span className="font-mono text-[10px] text-gray-400 block font-bold">2026-07-02</span>
            <div className="mt-0.5">
              <button 
                onClick={() => navigate('/entry/e-stabilizer-project')}
                className="text-[#1D70B8] hover:underline font-bold inline text-left mr-1.5"
              >
                稳定子算法 Sandbox 计算项目
              </button>
              <span className="text-gray-600">更新了结果文件及 Monte Carlo 仿真伪阈值折线图</span>
            </div>
          </div>

          <div className="border-l-2 border-gray-200 pl-4 relative">
            <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-gray-300 border-2 border-white" />
            <span className="font-mono text-[10px] text-gray-400 block font-bold">2026-07-01</span>
            <div className="mt-0.5">
              <button 
                onClick={() => navigate('/data-items')}
                className="text-[#1D70B8] hover:underline font-bold inline text-left mr-1.5"
              >
                材料结构数据条目
              </button>
              <span className="text-gray-600">其物理 JSON Schema 数据结构更新至 v0.2，补充三斜胞体矩阵约束</span>
            </div>
          </div>

          <div className="border-l-2 border-gray-200 pl-4 relative">
            <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-gray-300 border-2 border-white" />
            <span className="font-mono text-[10px] text-gray-400 block font-bold">2026-06-30</span>
            <div className="mt-0.5">
              <span className="text-gray-400">新增文献</span>
              <button 
                onClick={() => navigate('/papers')}
                className="text-[#1D70B8] hover:underline font-bold inline text-left mx-1.5"
              >
                Quantum Error Correction with Stabilizer Codes
              </button>
              <span className="text-gray-600">，由 MarkItDown 工具链自动提取并建立图谱关联</span>
            </div>
          </div>

          <div className="border-l-2 border-gray-200 pl-4 relative">
            <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-gray-300 border-2 border-white" />
            <span className="font-mono text-[10px] text-gray-400 block font-bold">2026-06-29</span>
            <div className="mt-0.5">
              <button 
                onClick={() => navigate('/templates')}
                className="text-[#1D70B8] hover:underline font-bold inline text-left mr-1.5"
              >
                项目复盘报告模板
              </button>
              <span className="text-gray-600">格式提纲更新至 v1.3，由系统管理员规范了物理引用标识的书写位置</span>
            </div>
          </div>

        </div>
      </div>

      {/* 6. Public Entries (最新公开条目) */}
      <div className="space-y-4">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider border-b border-gray-200 pb-1.5 select-none">
          最新公开知识条目
        </h2>
        {entriesLoading ? (
          <div className="py-8 text-center text-gray-400 text-xs">正在加载公开条目...</div>
        ) : publicEntries.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-xs italic">暂无公开知识条目</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {publicEntries.slice(0, 6).map((entry) => (
              <button
                key={entry.id}
                onClick={() => navigate(`/entry/${entry.id}`)}
                className="bg-white border border-gray-200 rounded-lg p-4 text-left hover:border-[#DB5F5B]/30 hover:shadow-sm transition-all group"
              >
                <h3 className="font-bold text-[#1D70B8] group-hover:text-[#DB5F5B] transition-colors leading-snug">
                  {entry.title}
                </h3>
                {entry.summary && (
                  <p className="text-gray-500 text-[11px] leading-relaxed mt-1.5 line-clamp-2">
                    {entry.summary}
                  </p>
                )}
                <div className="flex items-center space-x-2 mt-2 text-[10px] text-gray-400">
                  <span>{entry.owner}</span>
                  <span>·</span>
                  <span>{entry.latestUpdatedAt?.substring(0, 10)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 7. More on Miqro Wiki (更多内容) */}
      <div className="space-y-4 pt-4 border-t border-gray-200">
        <h2 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wider select-none">
          更多内容 (More on Miqro Wiki)
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2 text-xs font-sans font-bold">
          <button onClick={() => navigate('/search')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有知识条目</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/search')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有 Sandbox 项目</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/papers')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有论文</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/data-items')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有数据条目</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/templates')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有模板文件</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/search')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有服务</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/graph')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>所有知识图谱标签</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/system-version')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>负责人索引</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/admin/manage')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>操作日志审计</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
          <button onClick={() => navigate('/admin/import')} className="text-blue-700 hover:underline text-left flex items-center">
            <span>导入任务流水线</span> <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
          </button>
        </div>
      </div>

    </div>
  )}
