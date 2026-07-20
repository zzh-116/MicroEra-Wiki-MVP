import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BookOpen, Search, ArrowRight, FileText } from "lucide-react";
import { WikiEntry } from "../types/wiki";
import { entriesApi } from "../api/entriesApi";
import EntryTypeBadge from "../components/EntryTypeBadge";
import TagList from "../components/TagList";
import Unauthorized from "../components/Unauthorized";

export default function PaperLibraryPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [papers, setPapers] = useState<WikiEntry[]>([]);

  useEffect(() => {
    entriesApi.getEntries().then((list) => {
      setPapers(list.filter((e) => {
        if (!e.title) return false;
        const tags = (e.tags as string[]) || [];
        return e.entryType === "concept" || e.entryType === "patent";
      }));
    });
  }, []);

  const filtered = papers.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.summary || "").toLowerCase().includes(q);
  });

  if (!isLoggedIn) return <Unauthorized requiredRole="internal" />;

  return (
    <div className="space-y-5" id="paper-library-page-panel">
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <BookOpen className="w-5 h-5 text-[#DB5F5B]" />
          <span>学术论文文献库</span>
        </h2>
        <p className="text-[10px] text-gray-400">收录 WoS 论文、专利及学术文献，共 {papers.length} 篇</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row md:items-center gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DB5F5B] text-xs" placeholder="搜索论文标题或摘要..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((entry) => (
          <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <EntryTypeBadge type={entry.entryType} />
                  <span className="text-[10px] text-gray-400">{entry.entryType}</span>
                </div>
                <h3 className="font-bold text-sm text-gray-900 leading-snug">{entry.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                  {entry.summary || (entry.content || "").slice(0, 200)}
                </p>
                {(entry.tags as string[])?.length > 0 && <TagList tags={entry.tags as string[]} />}
              </div>
              <button
                onClick={() => navigate("/entry/" + entry.id)}
                className="shrink-0 text-[#DB5F5B] hover:text-[#c04f4b] p-1"
                title="查看详情"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">暂无匹配的论文文献</div>
        )}
      </div>
    </div>
  );
}
