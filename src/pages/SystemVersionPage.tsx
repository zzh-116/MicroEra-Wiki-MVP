import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, ChevronRight, Award, History, Info } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import { VersionInfoPanel } from '../components/VersionComponents';

export default function SystemVersionPage() {
  const navigate = useNavigate();

  // Clean breadcrumbs paths
  const breadcrumbPaths = [
    { label: '公司 Wiki', to: '/' },
    { label: '系统版本与合规信息' }
  ];

  return (
    <div className="space-y-5" id="system-version-page-panel">
      {/* Upper Breadcrumbs and Utility bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-150 pb-2 gap-2">
        <Breadcrumbs paths={breadcrumbPaths} />
        
        <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono">
          <span>档案编号: MIQRO-SPEC-2026</span>
        </div>
      </div>

      {/* Main Title Header */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <Info className="w-5 h-5 text-[#DB5F5B]" />
          <span>关于 Wiki 与平台信息架构 (About System)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          公示微观纪元 AI Wiki 平台的规划进程、版本回溯依据、和公司内部商业智能组（许越）提报的需求清单一致性状态。
        </p>
      </div>

      {/* Wikipedia-inspired layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: Version Info Panel & Specific descriptions */}
        <div className="lg:col-span-8 space-y-5">
          <VersionInfoPanel />

          {/* Standard FAQ / Release Info Block */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3.5 shadow-sm text-xs">
            <h3 className="font-extrabold text-[#2B3150] uppercase tracking-wide flex items-center select-none pb-2 border-b border-gray-100">
              <Award className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              <span>本原型（Alpha）功能达成情况审计</span>
            </h3>

            <div className="space-y-3 text-gray-600 leading-relaxed font-sans">
              <p>
                本期发布为 <strong>alpha 原型验证阶段</strong>，主要用于在内部对以下核心科学研究和企业管理维度进行定调：
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                <div className="flex items-start space-x-2 bg-gray-50 p-2.5 rounded border border-gray-150">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <div>
                    <span className="font-bold text-gray-800 text-[11px] block">信息架构与页面形态</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">通过“极简侧边栏”+“内容分栏”复现 gov.uk 与维基百科级别的低干扰高密度阅读环境。</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 bg-gray-50 p-2.5 rounded border border-gray-150">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <div>
                    <span className="font-bold text-gray-800 text-[11px] block">知识条目组织方式</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">区分物理项目（Sandbox）、论文、数据 Schema、可调用服务等 8 类知识型资产。</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 bg-gray-50 p-2.5 rounded border border-gray-150">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <div>
                    <span className="font-bold text-gray-800 text-[11px] block">附件解析与语义透传</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">利用 MarkItDown 技术自动在背景提炼富文本摘要，让大模型（如 MiQi）具备文献检索根基。</span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 bg-gray-50 p-2.5 rounded border border-gray-150">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <div>
                    <span className="font-bold text-gray-800 text-[11px] block">知识图谱可视化</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">以可视化图谱直观刻画文献依赖、结果产生、归口模板的拓扑关系网。</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#DB5F5B]/5 border border-[#DB5F5B]/10 p-3 rounded-lg text-gray-500 text-[10px] select-none">
                <strong>后续演进提示 (MCP & RAG Integration):</strong> 
                <span className="ml-1">在 beta 及正式版本中，三类版本控制字段将作为持久化字段写入 PostgreSQL，并绑定 pgvector RAG。届时大模型查询时，可以附加 `v1.0 (Stable)` 版本的过滤条件，从源头上屏蔽老旧废弃草案，保障智能体输出的准确性。</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Quick contacts and navigation shortcuts */}
        <div className="lg:col-span-4 space-y-4 select-none">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3 text-xs">
            <h3 className="font-extrabold text-gray-800 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              需求对接方信息
            </h3>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">业务对接人：</span>
                <span className="font-bold text-gray-700">许越 (Xue Yue)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">对接科室：</span>
                <span className="font-bold text-gray-700">公司内部商业智能组</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">联络渠道：</span>
                <span className="font-bold text-gray-700 font-mono">bi-dept@miqro.net</span>
              </div>
            </div>
          </div>

          <div className="bg-[#2B3150] text-white rounded-xl p-4 shadow-sm space-y-3 text-xs border border-[#DB5F5B]/15">
            <h3 className="font-extrabold text-[#F2D760] pb-1 border-b border-white/10 uppercase tracking-wide flex items-center">
              <History className="w-4 h-4 mr-1 text-[#F2D760]" />
              <span>前往体验版本功能</span>
            </h3>
            <p className="text-[10px] text-gray-200 leading-relaxed font-sans">
              您可以在“管理维护端”直接修订任何一个条目的属性，系统将要求您选择版本号并记录备份说明。随后便可在条目详情页体验一键回滚。
            </p>
            <div className="pt-1.5">
              <button
                onClick={() => navigate('/admin/manage')}
                className="w-full py-1.5 bg-[#DB5F5B] hover:bg-[#DB5F5B]/90 text-white font-bold rounded text-[11px] transition-all"
              >
                前往“管理维护端”修改条目
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )}
