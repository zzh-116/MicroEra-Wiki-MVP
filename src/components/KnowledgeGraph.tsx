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
}

export default function KnowledgeGraph({
  nodes,
  edges,
  height = 320,
  interactive = true
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
    const centralIndex = nodes.findIndex(n => n.type === 'project' || n.type === 'service') !== -1
      ? nodes.findIndex(n => n.type === 'project' || n.type === 'service')
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

  const getNodeColor = (type: EntryType, isSelected: boolean) => {
    if (isSelected) return 'fill-[#DB5F5B] stroke-[#2B3150] stroke-2';
    switch (type) {
      case 'project':
        return 'fill-[#2B3150] stroke-blue-300';
      case 'paper':
        return 'fill-[#10B981] stroke-green-100';
      case 'data_item':
        return 'fill-[#8B5CF6] stroke-purple-100';
      case 'business_value':
        return 'fill-[#F43F5E] stroke-rose-100';
      case 'service':
        return 'fill-[#F2D760] stroke-[#2B3150]';
      case 'template':
        return 'fill-[#14B8A6] stroke-teal-100';
      default:
        return 'fill-gray-400 stroke-gray-200';
    }
  };

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
          * 鼠标悬停显示信息，点击节点加载摘要及跳转
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
                <g key={edge.id}>
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
                    {edge.relation}
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
                    r={isSelected ? 14 : isHovered ? 12 : 10}
                    className={`transition-all duration-200 shadow ${getNodeColor(node.type, isSelected)}`}
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
                    {node.label.length > 8 ? `${node.label.substring(0, 8)}...` : node.label}
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
                  {selectedNode.description}
                </p>

                <div className="bg-gray-50 p-2 rounded text-[10px] text-gray-500 font-mono">
                  <span>编号: {selectedNode.entryId}</span>
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
              onClick={() => navigate(`/entry/${selectedNode.entryId}`)}
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
