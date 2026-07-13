import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Database, Search, ArrowRight, ShieldAlert, Cpu, Code, User, Calendar, HardDrive, Info } from 'lucide-react';
import { DataItem } from '../types/wiki';
import { mockDataItems } from '../mock/mockData';
import Unauthorized from '../components/Unauthorized';

interface DataItemPageProps {
  onNavigate: (view: string, id?: string) => void}

export default function DataItemPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<DataItem[]>([]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      setFilteredItems(
        mockDataItems.filter(
          item => item.dataName.toLowerCase().includes(q) || 
                  item.dataDefinition.toLowerCase().includes(q) ||
                  item.dataFormat.toLowerCase().includes(q)
        )
      )} else {
      setFilteredItems(mockDataItems)}
  }, [searchQuery]);

  if (!isLoggedIn) {
    return (
      <Unauthorized requiredRole="internal"
      />
    )}

  return (
    <div className="space-y-5" id="data-item-page-panel">
      {/* Title Header */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <Database className="w-5 h-5 text-[#DB5F5B]" />
          <span>算法仿真与研发数据表映射中心 (Data Schema Directory)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          公示了 Sandbox 计算程序输出、高维物理状态和切片特征在 PostgreSQL + Drizzle ORM 中的数据规格字典。
        </p>
      </div>

      {/* Filter and Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <span className="font-extrabold text-[#2B3150] uppercase tracking-wide flex items-center">
          <Cpu className="w-4 h-4 mr-1 text-[#DB5F5B]" />
          <span>PG Vector 关系数据表字典 ({filteredItems.length} 表模型)</span>
        </span>

        <div className="relative max-w-xs w-full">
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs font-sans"
            placeholder="在数据字典中检索名/内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="data-item-local-search"
          />
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Grid: Data items lists */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl">
            未在图谱库中找到满足条件的数据模型。可在管理后台一键导入新的 Drizzle ORM 定义。
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm"
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-sm text-[#2B3150] tracking-tight leading-relaxed">
                    {item.dataName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10px] text-gray-400">
                    <span className="flex items-center">
                      <User className="w-3 h-3 mr-0.5" />
                      负责人: {item.responsiblePerson}
                    </span>
                    <span className="flex items-center font-mono">
                      <Calendar className="w-3 h-3 mr-0.5" />
                      更新时间: {item.latestUpdatedAt}
                    </span>
                    <span className="bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.2 rounded font-mono font-bold">
                      版本: {item.schemaVersion}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 select-none">
                  <button
                    onClick={() => navigate(`/entry/${item.entryId}`)}
                    className="py-1 px-2.5 bg-gray-50 border border-gray-200 hover:border-[#DB5F5B]/30 hover:bg-white text-gray-600 rounded text-[10px] font-bold transition-all flex items-center space-x-1"
                  >
                    <span>跳转至 Wiki 解析条目</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#DB5F5B]" />
                  </button>
                </div>
              </div>

              {/* Data Specifications Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">
                    📦 存储规范与介质路径
                  </span>
                  <p className="text-gray-700 leading-relaxed flex items-start">
                    <HardDrive className="w-3.5 h-3.5 text-[#DB5F5B] mr-1 shrink-0 mt-0.5" />
                    <span>{item.storageDescription}</span>
                  </p>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">
                    📑 序列化与编解码格式
                  </span>
                  <p className="text-gray-700 font-mono leading-relaxed">
                    {item.dataFormat}
                  </p>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wide">
                    💡 业务与学术语义释义
                  </span>
                  <p className="text-gray-600 leading-relaxed">
                    {item.dataDefinition}
                  </p>
                </div>
              </div>

              {/* Drizzle Schema representation code block */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-2 select-text">
                <div className="flex items-center space-x-1 text-[10px] font-bold text-gray-500">
                  <Code className="w-3.5 h-3.5 text-[#DB5F5B]" />
                  <span>Drizzle ORM 物理表映射参考规范 (PostgreSQL Schema DSL)：</span>
                </div>
                <pre className="text-[10px] font-mono text-gray-600 leading-relaxed overflow-x-auto p-1 bg-white border border-gray-150 rounded">
{`import { pgTable, serial, text, varchar, integer, vector, timestamp } from 'drizzle-orm/pg-core';

export const stabilizerResultTable = pgTable('simulation_outputs', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  stabilizerNodes: integer('stabilizer_nodes').notNull(),
  logicalErrorThreshold: text('logical_error_rate_threshold').notNull(),
  monteCarloRuns: integer('monte_carlo_runs').notNull(),
  embeddingVector: vector('embedding_vector', { dimensions: 1536 }), // pgvector 神经检索
  updatedAt: timestamp('updated_at').defaultNow()
});`}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )}
