import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, Info, Eye, ExternalLink } from 'lucide-react';
import { KnowledgeGraphNode, KnowledgeGraphEdge, EntryType } from '../types/wiki';
import EntryTypeBadge from './EntryTypeBadge';

interface KnowledgeGraphProps {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  height?: number;
  interactive?: boolean;
  /** Open entry links in a new tab instead of navigating in-app */
  openInNewTab?: boolean;
}

export default function KnowledgeGraph({
  nodes,
  edges,
  height = 320,
  interactive = true,
  openInNewTab = false,
}: KnowledgeGraphProps) {
  const navigate = useNavigate();
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<KnowledgeGraphNode | null>(null);

  // Layout node coordinates dynamically in an orbit format: Central node at center, others radiating outwards
  const [coords, setCoords] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (nodes.length === 0) return;

    const newCoords: Record<string, { x: number; y: number }> = {};
    const width = 450;
    const centerY = height / 2;
    const centerX = width / 2;

    // Find the primary/central node (usually the project node if available, or first node)
    const centralIndex = nodes.findIndex(n => n.type === 'Sandbox项目') !== -1
      ? nodes.findIndex(n => n.type === 'Sandbox项目')
      : 0;

    const centralNode = nodes[centralIndex];
    if (centralNode) {
      newCoords[centralNode.id] = { x: centerX, y: centerY };
    }

    const outerNodes = nodes.filter((_, idx) => idx !== centralIndex);
    const count = outerNodes.length;
    const radius = 110;

    outerNodes.forEach((node, idx) => {
      const angle = (idx * 2 * Math.PI) / count - Math.PI / 2; // offset to top
      newCoords[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    setCoords(newCoords);
    
    // Set default selected node
    if (centralNode) {
      setSelectedNode(centralNode);
    } else {
      setSelectedNode(nodes[0] || null);
    }
  }, [nodes, height]);

  const SVG_TYPE_COLOR_MAP: Record<string, string> = {
    'Sandbox项目': '#5B8FF9',
    '学术论文': '#9270CA',
    '专利成果': '#F6BD16',
    '技术文档': '#6DC8EC',
    '数据标准': '#51A8A8',
    '模板规范': '#F6903D',
    '商业资料': '#F4664A',
    '手写笔记': '#B37BEB',
  };

  const getNodeFill = (type: string) => SVG_TYPE_COLOR_MAP[type] || '#999999';

  const getTextColor = (type: EntryType) => {
    return 'text-gray-700';
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-hidden shadow-inner" id="knowledge-graph-container">
      {/* Title / Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-700 flex items-center">
          <Network className="w-4 h-4 mr-1 text-[#DB5F5B] animate-pulse" />
          <span>关联知识图谱 (Interactive Semantic Network)</span>
        </span>
        <span className="text-[9px] text-gray-400">
          * 点击节点查看摘要，按钮跳转详情
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* SVG Drawing Canvas */}
        <div className="lg:col-span-8 bg-white border border-gray-150 rounded-lg relative overflow-hidden flex items-center justify-center">
          <svg
            width="100%"
            height={height}
            viewBox="0 0 450 320"
            className="w-full max-w-[450px]"
            id="knowledge-graph-svg"
          >
            {/* SVG Markers for line arrows */}
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="18"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#CBD5E1" />
              </marker>
            </defs>

            {/* Draw Relationship Lines (Edges) */}
            {edges.map((edge) => {
              const start = coords[edge.source];
              const end = coords[edge.target];
              if (!start || !end) return null;

              return (
                <g key={edge.id || `${edge.source}->${edge.target}`}>
                  <path
                    d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                    stroke="#E2E8F0"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#arrow)"
                    className="hover:stroke-[#DB5F5B] hover:stroke-2 transition-colors cursor-help"
                  />
                  {/* Subtle label in the middle */}
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 - 4}
                    className="fill-gray-400 text-[8px] text-center pointer-events-none select-none font-sans"
                    textAnchor="middle"
                  >
                    {edge.label || edge.relation || ''}
                  </text>
                </g>
              );
            })}

            {/* Draw Nodes */}
            {nodes.map((node) => {
              const coord = coords[node.id];
              if (!coord) return null;

              const isSelected = selectedNode?.id === node.id;
              const isHovered = hoveredNode?.id === node.id;
              const labelChars = Array.from(node.label || '');
              const shortLabel = labelChars.slice(0, 8).join('');

              return (
                <g
                  key={node.id}
                  transform={`translate(${coord.x}, ${coord.y})`}
                  onClick={() => interactive && setSelectedNode(node)}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="cursor-pointer group"
                >
                  <circle
                    r={11}
                    fill={getNodeFill(node.type)}
                    stroke={isSelected ? '#DB5F5B' : '#FFFFFF'}
                    strokeWidth={isSelected ? 3 : 2}
                    className="transition-all duration-200"
                  />
                  {/* Inner text/badge */}
                  <text
                    y="3"
                    className={`text-[8px] font-bold text-center pointer-events-none select-none ${
                      isSelected ? 'fill-white' : 'fill-white'
                    }`}
                    textAnchor="middle"
                  >
                    {node.type.substring(0, 2).toUpperCase()}
                  </text>
                  
                  {/* Floating tooltip hover name */}
                  <text
                    y={isSelected ? 24 : 20}
                    className="fill-gray-700 text-[9px] font-medium pointer-events-none select-none"
                    textAnchor="middle"
                  >
                    {labelChars.length > 8 ? `${shortLabel}...` : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sidebar Info Panel */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-lg p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-1 border-b border-gray-100 pb-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-[#DB5F5B]" />
              <span className="font-bold text-gray-700 text-xs">节点元数据分析</span>
            </div>

            {selectedNode ? (
              <div className="space-y-2">
                <div>
                  <h4 className="font-bold text-gray-800 text-xs tracking-tight">
                    {selectedNode.label}
                  </h4>
                  <div className="mt-1">
                    <EntryTypeBadge type={selectedNode.type} />
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 leading-normal">
                  {selectedNode.metadata?.summary || '暂无描述'}
                </p>

                <div className="bg-gray-50 p-2 rounded text-[10px] text-gray-500 font-mono">
                  <span>编号: {selectedNode.id}</span>
                </div>
              </div>
            ) : (
              <div className="text-gray-400 italic text-center py-10">
                请在图谱中点击任一节点加载其元数据关联
              </div>
            )}
          </div>

          {selectedNode && (
            <button
              onClick={() => {
                const url = `/entry/${selectedNode.id}`;
                if (openInNewTab) {
                  window.open(url, '_blank');
                } else {
                  navigate(url);
                }
              }}
              className="w-full mt-3 py-1.5 bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-semibold rounded text-[11px] transition-all flex items-center justify-center space-x-1"
            >
              <ExternalLink className="w-3 h-3 text-[#F2D760]" />
              <span>查看该知识条目</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
