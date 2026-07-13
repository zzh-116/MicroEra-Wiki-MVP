import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Search, ArrowRight, ExternalLink, ShieldAlert, FileText, CheckCircle } from 'lucide-react';
import { Paper, WikiEntry } from '../types/wiki';
import { mockPapers, mockEntries } from '../mock/mockData';
import EntryTypeBadge from '../components/EntryTypeBadge';
import TagList from '../components/TagList';
import Unauthorized from '../components/Unauthorized';

interface PaperLibraryPageProps {
  onNavigate: (view: string, id?: string) => void}

export default function PaperLibraryPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPapers, setFilteredPapers] = useState<Paper[]>([]);

  useEffect(() => {
    let result = mockPapers;

    // Filter by tab
    if (activeTab !== 'all') {
      result = result.filter(p => p.field === activeTab)}

    // Filter by query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        p => p.title.toLowerCase().includes(q) || 
             p.authors.toLowerCase().includes(q) || 
             p.abstract.toLowerCase().includes(q)
      )}

    setFilteredPapers(result)}, [activeTab, searchQuery]);

  if (!isLoggedIn) {
    return (
      <Unauthorized requiredRole="internal"
      />
    )}

  return (
    <div className="space-y-5" id="paper-library-page-panel">
      {/* Title Header */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <BookOpen className="w-5 h-5 text-[#DB5F5B]" />
          <span>前沿论文及专利文献知识库 (Scientific Literature Library)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          收录量子算法、计算生物化学、多尺度材料模拟等前沿科学领域的顶级期刊文献（DOI 绑定）与授权技术专利。
        </p>
      </div>

      {/* Tabs and search filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs">
        {/* Category switcher */}
        <div className="flex flex-wrap gap-1">
          {[
            { id: 'all', label: '全部学科文献' },
            { id: '量子计算', label: '量子误差与算法' },
            { id: '生物科学', label: '计算生物化学' },
            { id: '材料科学', label: '固体与材料仿真' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-[#2B3150] text-[#F2D760] shadow-sm'
                  : 'bg-gray-50 text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Local search input */}
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs font-sans"
            placeholder="在文献库中检索标题/作者..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="paper-local-search"
          />
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Papers listing */}
      <div className="space-y-4">
        {filteredPapers.length === 0 ? (
          <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl">
            未在当前学科分类下检索到相关白皮书。后勤研发人员正在启动 MarkItDown 建立翻译索引。
          </div>
        ) : (
          filteredPapers.map((paper) => {
            // Find corresponding entry to extract tags/owner details
            const matchedEntry = mockEntries.find(e => e.id === paper.entryId);

            return (
              <div
                key={paper.id}
                onClick={() => navigate(`/entry/${paper.entryId}`)}
                className="bg-white border border-gray-200 hover:border-[#DB5F5B]/30 hover:shadow-md cursor-pointer transition-all p-4 rounded-xl space-y-3.5 group"
              >
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5 select-none">
                      <span className="bg-[#10B981]/10 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                        {paper.field}
                      </span>
                      
                      <span className="text-[10px] text-gray-400 font-mono">
                        发表年份: {paper.year}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-sm text-gray-800 tracking-tight group-hover:text-[#DB5F5B] transition-colors leading-normal mt-1">
                      {paper.title}
                    </h3>

                    <p className="text-[11px] text-gray-400 font-medium">
                      作者：{paper.authors}
                    </p>
                  </div>

                  <span className="text-[10px] text-gray-400 font-mono bg-gray-50 border border-gray-150 rounded px-1.5 py-0.5 shrink-0 select-none">
                    DOI: {paper.doi}
                  </span>
                </div>

                {/* Abstract snippet */}
                <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-50/50 p-3 rounded-lg border-l-2 border-emerald-400 select-text">
                  <strong>Abstract:</strong> {paper.abstract}
                </p>

                {/* Footers and status flags */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-gray-50 text-[10px]">
                  <div className="flex items-center space-x-2.5 text-gray-400 select-none">
                    {paper.sourceFileId && (
                      <span className="flex items-center text-green-700 bg-green-50 border border-green-150 px-1.5 py-0.2 rounded font-semibold">
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        <span>已挂载 PDF 源白皮书</span>
                      </span>
                    )}

                    {paper.markdownFileId && (
                      <span className="flex items-center text-blue-700 bg-blue-50 border border-blue-150 px-1.5 py-0.2 rounded font-semibold">
                        <CheckCircle className="w-3.5 h-3.5 mr-1 text-blue-500" />
                        <span>已通过 MarkItDown 转换</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => navigate(`/entry/${paper.entryId}`)}
                    className="text-[#DB5F5B] font-bold flex items-center group-hover:underline"
                  >
                    <span>查阅文献 Wiki 全文与引航连线</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
              </div>
            )})
        )}
      </div>
    </div>
  )}
