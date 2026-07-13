import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, Lock, Globe, Database, HelpCircle } from 'lucide-react';
import { WikiSpace, WikiEntry } from '../types/wiki';
import { spacesApi } from '../api/spacesApi';
import { entriesApi } from '../api/entriesApi';
import { useAuth } from '../context/AuthContext';

export default function WikiSidebar() {
  const { id: currentEntryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [spaces, setSpaces] = useState<WikiSpace[]>([]);
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [expandedSpaces, setExpandedSpaces] = useState<Record<string, boolean>>({
    's-root': true,
    's-sandbox': true,
    's-papers': true
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const loadedSpaces = await spacesApi.getSpaces();
        setSpaces(loadedSpaces);

        const loadedEntries = await entriesApi.getEntries();
        setEntries(loadedEntries);
      } catch (err) {
        console.error('Error fetching sidebar data:', err);
      }
    };
    fetchData();
  }, [isLoggedIn]);

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces(prev => ({ ...prev, [spaceId]: !prev[spaceId] }));
  };

  // Recursively render the tree hierarchy
  const renderSpaceNode = (space: WikiSpace, depth: number) => {
    const isExpanded = expandedSpaces[space.id];
    const hasChildren = (space.children && space.children.length > 0) ||
                        entries.some(e => e.spaceId === space.id);

    // Filter entries belonging to this space
    const spaceEntries = entries.filter(e => e.spaceId === space.id);

    return (
      <div key={space.id} className="select-none text-xs" id={`sidebar-space-${space.id}`}>
        {/* Directory Row */}
        <div
          onClick={() => hasChildren ? toggleSpace(space.id) : null}
          className={`flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#F5F6E5] cursor-pointer transition-colors ${
            depth === 0 ? 'font-bold text-gray-800' : 'text-gray-600'
          }`}
          style={{ paddingLeft: `${Math.max(8, depth * 14)}px` }}
        >
          <div className="flex items-center space-x-1 min-w-0">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              )
            ) : (
              <span className="w-3.5" />
            )}

            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-[#DB5F5B] flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-[#2B3150] flex-shrink-0" />
            )}

            <span className="truncate" title={space.name}>{space.name}</span>
          </div>

          {/* Visibility indicator */}
          {space.visibility === 'internal' && (
            <Lock className="w-2.5 h-2.5 text-red-400 flex-shrink-0 ml-1" title="仅内部可见" />
          )}
        </div>

        {/* Child Items Drawer */}
        {isExpanded && (
          <div className="space-y-0.5">
            {/* Recursive children spaces */}
            {space.children && space.children.map(child => renderSpaceNode(child, depth + 1))}

            {/* Render direct entries inside this space */}
            {spaceEntries.map(entry => {
              const isActive = currentEntryId === entry.id;
              return (
                <div
                  key={entry.id}
                  onClick={() => navigate(`/entry/${entry.id}`)}
                  className={`flex items-center justify-between py-1 pr-2 rounded-md cursor-pointer transition-all ${
                    isActive
                      ? 'bg-[#2B3150] text-[#F2D760] font-bold shadow-sm'
                      : 'text-gray-500 hover:text-[#DB5F5B] hover:bg-gray-100'
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 14}px` }}
                  id={`sidebar-entry-${entry.id}`}
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#F2D760]' : 'text-gray-400'}`} />
                    <span className="truncate" title={entry.title}>
                      {entry.title}
                    </span>
                  </div>

                  {entry.visibility === 'internal' && !isActive && (
                    <Lock className="w-2.5 h-2.5 text-red-300 flex-shrink-0" title="内部文档" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm select-none" id="wiki-sidebar-panel">
      <div className="flex items-center space-x-1.5 pb-2 mb-2 border-b border-gray-100">
        <Database className="w-4 h-4 text-[#DB5F5B]" />
        <span className="font-extrabold text-xs text-[#2B3150] uppercase tracking-wide">
          子 Wiki 导航树 (Spaces)
        </span>
      </div>

      <div className="space-y-1">
        {spaces.map(space => renderSpaceNode(space, 0))}
      </div>

      {/* Quick guide bottom card */}
      <div className="mt-4 p-2 bg-gray-50 rounded border border-gray-150 text-[10px] text-gray-500">
        <div className="font-bold flex items-center mb-0.5 text-[#2B3150]">
          <Globe className="w-3 h-3 mr-0.5 text-green-600" />
          <span>访问角色指示</span>
        </div>
        <div>当前状态: {isLoggedIn ? '🔑 已登录 (内部人员)' : '🌐 未登录 (访客)'}</div>
        {!isLoggedIn && (
          <div className="text-[#DB5F5B] mt-1">
            * 内部条目已被隐藏，登录后解锁全部 Sandbox 数据链路。
          </div>
        )}
      </div>
    </div>
  );
}
