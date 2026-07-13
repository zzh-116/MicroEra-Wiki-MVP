import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-[#2B3150] text-gray-300 text-xs mt-12 border-t-8 border-[#DB5F5B] select-none" id="gov-style-footer">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Four Column Directory */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-8 border-b border-gray-700/60">

          {/* Col 1: Wiki内容 */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#F2D760] text-xs uppercase tracking-wider pb-1 border-b border-gray-700/55">
              Wiki 内容
            </h4>
            <ul className="space-y-2 text-[11px] text-gray-300">
              <li><Link to="/search" className="hover:underline hover:text-white">公开知识 (Public Knowledge)</Link></li>
              <li><Link to="/search" className="hover:underline hover:text-white">内部知识 (Internal Directory)</Link></li>
              <li><Link to="/entry/e-stabilizer-project" className="hover:underline hover:text-white">Sandbox 项目 (Sandbox Process)</Link></li>
              <li><Link to="/papers" className="hover:underline hover:text-white">论文知识库 (Papers Archive)</Link></li>
              <li><Link to="/data-items" className="hover:underline hover:text-white">数据条目 (Data Items)</Link></li>
              <li><Link to="/templates" className="hover:underline hover:text-white">模板库 (Template Library)</Link></li>
            </ul>
          </div>

          {/* Col 2: 服务与工具 */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#F2D760] text-xs uppercase tracking-wider pb-1 border-b border-gray-700/55">
              服务与工具
            </h4>
            <ul className="space-y-2 text-[11px] text-gray-300">
              <li><Link to="/ai-query" className="hover:underline hover:text-white">RAG 服务 (RAG Q&A)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">MCP 工具 (MCP Sandbox)</Link></li>
              <li><Link to="/ai-query" className="hover:underline hover:text-white">MiQi 智能调用 (MiQi Assistance)</Link></li>
              <li><Link to="/search" className="hover:underline hover:text-white">查询接口 (Search Hub)</Link></li>
              <li><Link to="/admin/import" className="hover:underline hover:text-white">导入任务 (Import Pipeline)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">API 文档 (Integrations)</Link></li>
            </ul>
          </div>

          {/* Col 3: 管理与规范 */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#F2D760] text-xs uppercase tracking-wider pb-1 border-b border-gray-700/55">
              管理与规范
            </h4>
            <ul className="space-y-2 text-[11px] text-gray-300">
              <li><Link to="/admin/manage" className="hover:underline hover:text-white">内容管理 (Content Management)</Link></li>
              <li><Link to="/admin/import" className="hover:underline hover:text-white">文件入库规范 (Ingestion Specs)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">Reference 引用规范</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">权限说明 (Access Control)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">数据标准化说明 (Standards)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">版本记录 (Revision Log)</Link></li>
            </ul>
          </div>

          {/* Col 4: 支持 */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#F2D760] text-xs uppercase tracking-wider pb-1 border-b border-gray-700/55">
              支持
            </h4>
            <ul className="space-y-2 text-[11px] text-gray-300">
              <li><Link to="/system-version" className="hover:underline hover:text-white">使用说明 (User Guide)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">需求反馈 (Feedback Hub)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">联系维护人 (Contact Xue Yue)</Link></li>
              <li><Link to="/system-version" className="hover:underline hover:text-white">常见问题 (FAQs)</Link></li>
            </ul>
          </div>

        </div>

        {/* Brand footer bar with license detail */}
        <div className="pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm tracking-wider text-[#F2D760] font-sans">
                微观纪元 Wiki (Miqro Wiki)
              </span>
              <span className="border border-gray-500 text-gray-400 text-[8px] font-mono px-1 rounded uppercase">
                Alpha
              </span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              用于组织 Sandbox 项目过程、结果、引用文献、数据条目和知识服务。
              本平台所有信息受公司内部机密协议保护，严禁二次向公网非授权泄露。
            </p>
          </div>

          <div className="text-left md:text-right space-y-1 text-[10px] text-gray-500 font-mono shrink-0">
            <p>© 2026 微观纪元 (Miqro Phisica Inc.) 算法平台部.</p>
            <p>Powered by MarkItDown Parser & pgvector RAG Neural Grounding • v1.3.0</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
