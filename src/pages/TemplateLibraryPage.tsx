import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileSignature, Search, ArrowRight, Download, FileText, CheckCircle, ShieldAlert } from 'lucide-react';
import { TemplateFile } from '../types/wiki';
import { mockTemplates } from '../mock/mockData';
import Unauthorized from '../components/Unauthorized';

interface TemplateLibraryPageProps {
  onNavigate: (view: string, id?: string) => void}

export default function TemplateLibraryPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTemplates, setFilteredTemplates] = useState<TemplateFile[]>([]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      setFilteredTemplates(
        mockTemplates.filter(
          t => t.templateName.toLowerCase().includes(q) || 
               t.projectType.toLowerCase().includes(q) || 
               t.department.toLowerCase().includes(q)
        )
      )} else {
      setFilteredTemplates(mockTemplates)}
  }, [searchQuery]);

  const handleDownload = (name: string) => {
    alert(`[Mock 触发下载] 标准办公模板《${name}》已成功打包并发送至浏览器下载队列。`)};

  if (!isLoggedIn) {
    return (
      <Unauthorized requiredRole="internal"
      />
    )}

  return (
    <div className="space-y-5" id="template-library-page-panel">
      {/* Title Header */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <FileSignature className="w-5 h-5 text-[#DB5F5B]" />
          <span>企业标准办公与实验复盘规范模板库 (Template Registry)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          收录质量保障部与技术安全委员会颁布的标准 Word/Markdown 项目复盘报告格式与科学计算论证提纲。
        </p>
      </div>

      {/* Filter and Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs select-none">
        <span className="font-bold text-gray-700">标准模板列表（支持一键下载办公套件）</span>
        
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#DB5F5B] text-xs font-sans"
            placeholder="搜索标准报告/模板格式..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="template-local-search"
          />
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Grid listing templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl col-span-2">
            未检索到相关格式模板。
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 p-4 rounded-xl flex flex-col justify-between space-y-4 hover:border-[#DB5F5B]/30 hover:shadow-sm transition-all shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between select-none">
                  <span className="text-[10px] text-teal-700 bg-teal-50 border border-teal-150 px-2 py-0.5 rounded font-bold uppercase font-mono">
                    格式: WORD (DOCX)
                  </span>
                  
                  <span className="text-[10px] text-gray-400 font-mono">
                    大小: {template.fileSize || '250 KB'}
                  </span>
                </div>

                <h3 className="font-extrabold text-xs text-gray-800 tracking-tight leading-normal">
                  {template.templateName}
                </h3>
                
                <div className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 p-3 rounded border border-gray-150 space-y-1">
                  <div>
                    <span className="font-bold text-gray-600">归口部门：</span>
                    <span>{template.department}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-600">适用范围：</span>
                    <span>{template.projectType}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-600">核准时间：</span>
                    <span className="font-mono">{template.latestApprovedAt}</span>
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-[10px]">
                <button
                  onClick={() => handleDownload(template.templateName)}
                  className="px-3 py-1.5 bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold rounded flex items-center space-x-1 transition-all select-none"
                >
                  <Download className="w-3.5 h-3.5 text-[#F2D760]" />
                  <span>下载标准模板 (.docx)</span>
                </button>

                <button
                  onClick={() => navigate(`/entry/${template.entryId}`)}
                  className="text-[#DB5F5B] font-bold hover:underline flex items-center"
                >
                  <span>在线查看骨架纲要</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )}
