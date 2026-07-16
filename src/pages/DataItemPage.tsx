import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Database, Search, ArrowRight, User, Calendar, HardDrive, Code } from "lucide-react";
import { WikiEntry } from "../types/wiki";
import { entriesApi } from "../api/entriesApi";
import Unauthorized from "../components/Unauthorized";

export default function DataItemPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [filteredItems, setFilteredItems] = useState<WikiEntry[]>([]);

  useEffect(() => {
    entriesApi.getEntries({ entry_type: "data_item" })
      .then((list) => { setEntries(list); setFilteredItems(list); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) { setFilteredItems(entries); return; }
    setFilteredItems(entries.filter((e) =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.summary || "").toLowerCase().includes(q)
    ));
  }, [searchQuery, entries]);

  if (!isLoggedIn) return <Unauthorized requiredRole="internal" />;

  return (
    <div className="space-y-5" id="data-item-page-panel">
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <Database className="w-5 h-5 text-[#DB5F5B]" />
          <span>研发数据规范与结构</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          收录企业研发数据规范、字段定义与数据结构标准，共 {entries.length} 项。
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <span className="font-extrabold text-[#2B3150] uppercase tracking-wide flex items-center">
          <Database className="w-4 h-4 mr-1 text-[#DB5F5B]" />
          <span>数据条目 ({filteredItems.length} 项)</span>
        </span>
        <div className="relative max-w-xs w-full">
          <input type="text" className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs" placeholder="搜索数据规范..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl">
            暂无匹配的数据规范条目。
          </div>
        ) : (
          filteredItems.map((entry) => (
            <div key={entry.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-sm text-[#2B3150] tracking-tight leading-relaxed">{entry.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10px] text-gray-400">
                    <span className="flex items-center"><User className="w-3 h-3 mr-0.5" />{(entry.owner || '管理员')}</span>
                    <span className="flex items-center font-mono"><Calendar className="w-3 h-3 mr-0.5" />{entry.latestUpdatedAt}</span>
                    <span className="bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.2 rounded font-mono font-bold">v1.0</span>
                  </div>
                </div>
                <button onClick={() => navigate("/entry/" + entry.id)} className="py-1 px-2.5 bg-gray-50 border border-gray-200 hover:border-[#DB5F5B]/30 text-gray-600 rounded text-[10px] font-bold flex items-center space-x-1">
                  <span>查看详情</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#DB5F5B]" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">存储规范</span>
                  <p className="text-gray-700 leading-relaxed flex items-start">
                    <HardDrive className="w-3.5 h-3.5 text-[#DB5F5B] mr-1 shrink-0 mt-0.5" />
                    <span>PostgreSQL 数据库</span>
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">标签</span>
                  <p className="text-gray-700 leading-relaxed">{(entry.tags as string[])?.join(", ") || "—"}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase">定义</span>
                  <p className="text-gray-600 leading-relaxed">{entry.summary || (entry.content || "").slice(0, 200) || "—"}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
