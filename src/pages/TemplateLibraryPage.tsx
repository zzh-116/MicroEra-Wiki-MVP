import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FileSignature, Search, ArrowRight, FileText } from "lucide-react";
import { WikiEntry } from "../types/wiki";
import { entriesApi } from "../api/entriesApi";
import Unauthorized from "../components/Unauthorized";

export default function TemplateLibraryPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [filtered, setFiltered] = useState<WikiEntry[]>([]);

  useEffect(() => {
    entriesApi.getEntries({ entry_type: "template" })
      .then((list) => { setEntries(list); setFiltered(list); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) { setFiltered(entries); return; }
    setFiltered(entries.filter((e) =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.summary || "").toLowerCase().includes(q)
    ));
  }, [searchQuery, entries]);

  if (!isLoggedIn) return <Unauthorized requiredRole="internal" />;

  return (
    <div className="space-y-5" id="template-library-page-panel">
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <FileSignature className="w-5 h-5 text-[#DB5F5B]" />
          <span>研发文档与合规模板</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          收录研发文档、合规报告与项目模板，共 {entries.length} 项。
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <span className="font-bold text-gray-700">文档列表（{filtered.length} 项）</span>
        <div className="relative max-w-xs w-full">
          <input type="text" className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs" placeholder="搜索文档..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl col-span-2">暂无匹配的文档。</div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="bg-white border border-gray-200 p-4 rounded-xl flex flex-col justify-between space-y-4 hover:border-[#DB5F5B]/30 hover:shadow-sm transition-all shadow-sm">
              <div className="space-y-2">
                <div className="flex items-center justify-between select-none">
                  <span className="text-[10px] text-teal-700 bg-teal-50 border border-teal-150 px-2 py-0.5 rounded font-bold uppercase font-mono">
                    {(entry.tags as string[])?.[0] || "文档"}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {entry.entryType}
                  </span>
                </div>
                <h3 className="font-extrabold text-xs text-gray-800 tracking-tight leading-normal">{entry.title}</h3>
                <div className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 p-3 rounded border border-gray-150 space-y-1">
                  <p className="line-clamp-2">{entry.summary || (entry.content || "").slice(0, 150)}</p>
                  <div className="text-[10px] text-gray-400">
                    <span>更新: {entry.latestUpdatedAt}</span>
                    {entry.owner && <span> | 负责人: {entry.owner}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-[10px]">
                <button onClick={() => navigate("/entry/" + entry.id)} className="px-3 py-1.5 bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold rounded flex items-center space-x-1 transition-all">
                  <FileText className="w-3.5 h-3.5 text-[#F2D760]" />
                  <span>查看文档</span>
                </button>
                <button onClick={() => navigate("/entry/" + entry.id)} className="text-[#DB5F5B] font-bold hover:underline flex items-center">
                  <span>详情</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
