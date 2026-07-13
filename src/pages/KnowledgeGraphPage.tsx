import { useState, useEffect } from 'react';
import { Network, Info, Eye, ExternalLink, HelpCircle } from 'lucide-react';
import { graphApi } from '../api/graphApi';
import { KnowledgeGraphNode, KnowledgeGraphEdge, EntryType } from '../types/wiki';
import KnowledgeGraph from '../components/KnowledgeGraph';
import EntryTypeBadge from '../components/EntryTypeBadge';

interface KnowledgeGraphPageProps {
  onNavigate: (view: string, id?: string) => void}

export default function KnowledgeGraphPage() {
  const [nodes, setNodes] = useState<KnowledgeGraphNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const data = await graphApi.getGlobalGraph();
        setNodes(data.nodes);
        setEdges(data.edges)} catch (err) {
        console.error('Error fetching global graph:', err)} finally {
        setLoading(false)}
    };
    fetchGraph()}, []);

  return (
    <div className="space-y-5" id="knowledge-graph-page-panel">
      {/* Page Title */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1 uppercase tracking-wide">
          <Network className="w-5 h-5 text-[#DB5F5B]" />
          <span>微观纪元全域知识图谱分析大厅 (Global Semantic Network Map)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          可视化展现 Sandbox 计算实例、学术论文、国家专利、活性 API、负责人和数据规范之间的实体映射拓扑。
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[#DB5F5B] text-xs font-bold animate-pulse">
          正在加载语义连线拓扑图谱 (Compiling Nodes)...
        </div>
      ) : (
        <div className="space-y-5">
          {/* Main Graph Component */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <KnowledgeGraph
              nodes={nodes}
              edges={edges}
              height={420}
            />
          </div>

          {/* Guidelines and legends */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm select-none">
            <h3 className="font-bold text-xs text-gray-800 pb-1.5 border-b border-gray-100 mb-3 flex items-center">
              <HelpCircle className="w-4 h-4 mr-1 text-[#DB5F5B]" />
              <span>图谱关系及节点分类说明 (Legends)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 leading-relaxed">
              <div className="space-y-2">
                <div className="font-semibold text-gray-800">1. 节点分类说明 (Nodes):</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 bg-[#2B3150] rounded-full inline-block" />
                    <strong>PR (Project)</strong>：Sandbox 运行算子
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 bg-[#10B981] rounded-full inline-block" />
                    <strong>PA (Paper)</strong>：前沿学术论文
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 bg-[#8B5CF6] rounded-full inline-block" />
                    <strong>DA (Data Item)</strong>：Drizzle 关系表规范
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 bg-[#F2D760] rounded-full inline-block" />
                    <strong>SE (Service)</strong>：RAG / MCP 智能插件
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 bg-[#F43F5E] rounded-full inline-block" />
                    <strong>BU (Business)</strong>：ROI 价值看板
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 bg-[#14B8A6] rounded-full inline-block" />
                    <strong>TE (Template)</strong>：项目复盘标准模板
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-gray-800">2. 连线关系释义 (Edges):</div>
                <div className="text-[11px] space-y-1 font-mono text-gray-500">
                  <div>• <strong>references</strong>: 物理配置及仿真公式引用了该文献；</div>
                  <div>• <strong>produces</strong>: 仿真输出结果及 JSON 列对齐格式满足此 Schema 标准；</div>
                  <div>• <strong>belongs_to</strong>: 计算成果的复盘归档遵循此质量部 Word 模板规范；</div>
                  <div>• <strong>derived_from</strong>: 计算结果直接转换为了可度量的商业投资回报率。</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )}
