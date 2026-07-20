import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Briefcase, TrendingUp, DollarSign, Clock, ArrowRight, FileText, Tag } from "lucide-react";
import { WikiEntry } from "../types/wiki";
import { entriesApi } from "../api/entriesApi";
import Unauthorized from "../components/Unauthorized";

export default function BusinessValuePage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    entriesApi.getEntries()
      .then((list) => {
        setEntries(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Categorize entries
  const budgetEntries = entries.filter((e) => (e.tags as string[])?.some((t) => t.includes("预算") || t.includes("成本")));
  const procurementEntries = entries.filter((e) => (e.tags as string[])?.some((t) => t.includes("报价") || t.includes("采购")));
  const commercialEntries = entries.filter((e) => (e.tags as string[])?.some((t) => t.includes("商业化")) || e.title.includes("产品") || e.title.includes("市场"));
  const allRelevant = [...new Set([...budgetEntries, ...procurementEntries, ...commercialEntries])];

  if (!isLoggedIn) return <Unauthorized requiredRole="internal" />;

  return (
    <div className="space-y-5" id="business-value-page-panel">
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <Briefcase className="w-5 h-5 text-[#DB5F5B]" />
          <span>商业化价值与 ROI</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          汇集项目预算、成本核算、采购报价与商业化评估数据，共 {allRelevant.length} 项相关文档。
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 select-none">
            <div className="bg-[#2B3150] text-white p-4 rounded-xl border border-[#DB5F5B]/20 shadow-sm">
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className="w-5 h-5 text-[#F2D760]" />
                <span className="text-xs font-bold text-[#F2D760] uppercase tracking-wider">预算与成本</span>
              </div>
              <span className="text-2xl font-extrabold block">{budgetEntries.length}</span>
              <p className="text-xs text-gray-300 mt-1">份预算/成本相关文档</p>
            </div>
            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-5 h-5 text-[#DB5F5B]" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">采购与报价</span>
              </div>
              <span className="text-2xl font-extrabold text-[#2B3150] block">{procurementEntries.length}</span>
              <p className="text-xs text-gray-500 mt-1">份采购/报价记录</p>
            </div>
            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
              <div className="flex items-center space-x-2 mb-2">
                <Briefcase className="w-5 h-5 text-[#DB5F5B]" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">商业化数据</span>
              </div>
              <span className="text-2xl font-extrabold text-[#2B3150] block">{commercialEntries.length}</span>
              <p className="text-xs text-gray-500 mt-1">项商业化评估数据</p>
            </div>
          </div>

          {/* Budget Section */}
          {budgetEntries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-[#2B3150] border-b border-gray-200 pb-1 flex items-center">
                <DollarSign className="w-4 h-4 text-[#DB5F5B] mr-1" />
                <span>预算与成本核算</span>
              </h3>
              {budgetEntries.map((e) => (
                <div key={e.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate("/entry/" + e.id)} className="font-bold text-sm text-[#1D70B8] hover:underline text-left truncate block">{e.title}</button>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{e.entryType}</span>
                      {(e.tags as string[])?.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}

          {/* Procurement Section */}
          {procurementEntries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-[#2B3150] border-b border-gray-200 pb-1 flex items-center">
                <FileText className="w-4 h-4 text-[#DB5F5B] mr-1" />
                <span>采购与报价记录</span>
              </h3>
              {procurementEntries.map((e) => (
                <div key={e.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate("/entry/" + e.id)} className="font-bold text-sm text-[#1D70B8] hover:underline text-left truncate block">{e.title}</button>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{e.entryType}</span>
                      {(e.tags as string[])?.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}

          {/* Commercial Section */}
          {commercialEntries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-[#2B3150] border-b border-gray-200 pb-1 flex items-center">
                <Briefcase className="w-4 h-4 text-[#DB5F5B] mr-1" />
                <span>商业化评估</span>
              </h3>
              {commercialEntries.map((e) => (
                <div key={e.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate("/entry/" + e.id)} className="font-bold text-sm text-[#1D70B8] hover:underline text-left truncate block">{e.title}</button>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{e.entryType}</span>
                      {(e.tags as string[])?.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}

          {allRelevant.length === 0 && (
            <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl">
              暂无商业化相关数据。
            </div>
          )}
        </>
      )}
    </div>
  );
}
