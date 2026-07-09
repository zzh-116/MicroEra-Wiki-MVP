import React, { useState } from 'react';
import { History, Award, CheckCircle, ShieldAlert, ArrowLeftRight, Clock, User, FileText, RotateCcw, HelpCircle } from 'lucide-react';
import { WikiEntry, EntryVersionHistoryItem } from '../types/wiki';
import { mockSystemVersionInfo } from '../mock/mockData';
import { stripDataUriImages } from '../utils/adapter';

// Component 1: VersionBadge
export function VersionBadge({ 
  version, 
  type = 'product', 
  isStable = false 
}: { 
  version: string; 
  type?: 'product' | 'document' | 'entry'; 
  isStable?: boolean;
}) {
  const getStyle = () => {
    switch (type) {
      case 'product':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'document':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'entry':
        return isStable 
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
          : 'bg-gray-50 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getStyle()} select-none`}>
      {type === 'product' && <Award className="w-3 h-3 mr-1 text-amber-500" />}
      {type === 'document' && <FileText className="w-3 h-3 mr-1 text-blue-500" />}
      {type === 'entry' && isStable && <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" />}
      {version}
    </span>
  );
}

// Component 2: VersionInfoPanel (Wikipedia / gov.uk style, clean, structured, low-distraction)
export function VersionInfoPanel() {
  const info = mockSystemVersionInfo;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm" id="system-version-info-panel">
      <div className="border-b border-gray-100 pb-3">
        <h3 className="text-sm font-extrabold text-[#2B3150] uppercase tracking-wide flex items-center">
          <History className="w-4 h-4 mr-1.5 text-[#DB5F5B]" />
          <span>Wiki 平台版本与系统合规档案</span>
        </h3>
        <p className="text-[10px] text-gray-400 mt-0.5 font-sans">
          关于微观纪元企业内部知识库的产品开发周期、文档演进说明及内部业务归口。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Project Context */}
        <div className="space-y-3 p-3.5 bg-gray-50 rounded-lg border border-gray-150 text-xs">
          <h4 className="font-extrabold text-gray-700 uppercase tracking-wider text-[10px] pb-1 border-b border-gray-200 flex items-center">
            🏢 基础项目与需求归口
          </h4>
          <div className="space-y-2 leading-relaxed">
            <div>
              <span className="text-gray-400">项目名称：</span>
              <span className="font-bold text-gray-800">{info.projectName}</span>
            </div>
            <div>
              <span className="text-gray-400">提出需求方：</span>
              <span className="font-bold text-gray-800">{info.demander}</span>
            </div>
            <div>
              <span className="text-gray-400">当前所处阶段：</span>
              <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-100 rounded text-[10px] font-bold font-mono">
                {info.productStage.toUpperCase()} ({info.productStage === 'alpha' ? '原型验证阶段' : '测试阶段'})
              </span>
            </div>
          </div>
        </div>

        {/* Current Versions Map */}
        <div className="space-y-3 p-3.5 bg-gray-50 rounded-lg border border-gray-150 text-xs">
          <h4 className="font-extrabold text-gray-700 uppercase tracking-wider text-[10px] pb-1 border-b border-gray-200 flex items-center">
            📌 当前核准版本号索引
          </h4>
          <div className="space-y-2 leading-relaxed">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">产品总版本：</span>
              <VersionBadge version={info.productVersion} type="product" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">设计文档版本：</span>
              <VersionBadge version={info.documentVersion} type="document" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">文档核准时间：</span>
              <span className="font-mono text-gray-700 font-bold">{info.documentLastUpdated}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Version Descriptions */}
      <div className="space-y-3 text-xs">
        <div className="bg-[#F5F6E5]/40 p-4 rounded-lg border border-[#F2D760]/30 space-y-1.5">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
            🚀 现行产品版本说明 (Product Release Note):
          </span>
          <p className="text-gray-700 leading-relaxed font-sans text-xs">
            {info.productVersionDescription}
          </p>
        </div>

        <div className="bg-[#F5F6E5]/40 p-4 rounded-lg border border-[#F2D760]/30 space-y-1.5">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
            📄 对应需求设计说明 (PRD Specification Note):
          </span>
          <p className="text-gray-700 leading-relaxed font-sans text-xs">
            {info.documentVersionDescription}
          </p>
        </div>
      </div>

      {/* Wikipedia-style Clean Rule Box */}
      <div className="border border-gray-200 bg-white rounded-lg p-4 space-y-2.5 text-xs">
        <h4 className="font-extrabold text-gray-800 flex items-center text-[11px] uppercase tracking-wide">
          <HelpCircle className="w-4 h-4 text-gray-500 mr-1.5" />
          <span>企业三类版本控制与编码规范 (Versioning Norms)</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1.5 text-gray-600 leading-relaxed">
          <div className="space-y-1 bg-gray-50 p-2.5 rounded border border-gray-150">
            <span className="font-bold text-gray-800 text-[10px] block border-b border-gray-200 pb-0.5 mb-1 text-amber-700 uppercase">
              1. 产品版本号
            </span>
            <p className="text-[10px] text-gray-500">
              标识整个 Wiki 产品阶段。主版本用于大版本重构；功能版本用于新增大模块（如知识图谱）；修订版本用于 UI 微调及缺陷修复。
            </p>
          </div>
          <div className="space-y-1 bg-gray-50 p-2.5 rounded border border-gray-150">
            <span className="font-bold text-gray-800 text-[10px] block border-b border-gray-200 pb-0.5 mb-1 text-blue-700 uppercase">
              2. 文档版本号
            </span>
            <p className="text-[10px] text-gray-500">
              对应 PRD 演进。v0.1初版；v0.2补充权限架构；v0.3融合 RAG、MCP 与 MarkItDown 设计；v1.0定稿可开发。
            </p>
          </div>
          <div className="space-y-1 bg-gray-50 p-2.5 rounded border border-gray-150">
            <span className="font-bold text-gray-800 text-[10px] block border-b border-gray-200 pb-0.5 mb-1 text-gray-700 uppercase">
              3. 条目版本号
            </span>
            <p className="text-[10px] text-gray-500">
              单篇知识条目版本。每轮人工审核或物理修订将累加版本，全量备份内容；经过技术合规审查后核准为 stable (稳定) 态。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component 3: EntryVersionMeta (Sidebar display of single entry version metadata)
export function EntryVersionMeta({ entry }: { entry: WikiEntry }) {
  const currentVersion = entry.entryVersion || 'v0.1';
  const updatedDate = entry.lastUpdatedAt || entry.latestUpdatedAt;
  const updater = entry.updatedBy || entry.owner;
  const note = entry.versionNote || '初始导入，包含基础提纲。';
  const isStable = entry.isStableVersion || false;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm space-y-3 text-xs" id="entry-version-meta-panel">
      <div className="flex items-center justify-between pb-1.5 border-b border-gray-100 select-none">
        <h3 className="font-extrabold text-gray-800 uppercase tracking-wide flex items-center">
          <Clock className="w-3.5 h-3.5 text-[#DB5F5B] mr-1" />
          <span>条目现行版本 (Revision)</span>
        </h3>
        <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
          isStable 
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {isStable ? '✓ 已核准发布 (STABLE)' : '⚠️ 演进草案 (DRAFT)'}
        </span>
      </div>

      <div className="space-y-2 leading-relaxed">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">条目版本号：</span>
          <span className="font-mono font-extrabold text-[#2B3150]">{currentVersion}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">最后更新：</span>
          <span className="font-mono text-gray-700 font-semibold">{updatedDate.substring(0, 16)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">核准提交人：</span>
          <span className="font-bold text-gray-700 flex items-center">
            <User className="w-3 h-3 text-gray-400 mr-0.5" />
            {updater}
          </span>
        </div>

        <div className="bg-gray-50 p-2.5 rounded border border-gray-150 mt-1">
          <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wide mb-0.5 select-none">
            📝 现行修订说明:
          </span>
          <p className="text-[11px] text-gray-600 italic leading-snug">
            {note}
          </p>
        </div>
      </div>
    </div>
  );
}

// Component 4: EntryVersionHistory (Detailed timeline showing history versions and supporting rollback in local state)
interface EntryVersionHistoryProps {
  entry: WikiEntry;
  onRollbackSuccess?: (restoredEntry: WikiEntry) => void;
}

export function EntryVersionHistory({ entry, onRollbackSuccess }: EntryVersionHistoryProps) {
  // Use a local default history if none exists on the object
  const defaultHistory: EntryVersionHistoryItem[] = [
    {
      version: entry.entryVersion || 'v0.1',
      date: entry.lastUpdatedAt || entry.latestUpdatedAt,
      updatedBy: entry.updatedBy || entry.owner,
      note: entry.versionNote || '初始录入，包含基础定义、附件和关联条目。',
      current: true,
      contentBackup: entry.content,
      titleBackup: entry.title,
      summaryBackup: entry.summary
    }
  ];

  const historyList = entry.entryVersionHistory && entry.entryVersionHistory.length > 0 
    ? entry.entryVersionHistory 
    : defaultHistory;

  const [selectedHistory, setSelectedHistory] = useState<EntryVersionHistoryItem | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const handleRollback = (hist: EntryVersionHistoryItem) => {
    if (hist.current) {
      alert('此版本已经是该条目的当前活动版本。');
      return;
    }

    const confirmMsg = `警告：您确定要将本条目回溯到版本 [${hist.version}] 吗？\n该操作将覆盖当前的标题、摘要和主要 Markdown 内容。系统将会自动生成一个新的回滚版本作为当前的最新备份。`;
    if (!confirm(confirmMsg)) {
      return;
    }

    setIsRollingBack(true);

    setTimeout(() => {
      // Create new rollback history item
      const newVersionNum = `v${(parseFloat(entry.entryVersion?.replace('v', '') || '1.0') + 0.1).toFixed(1)}`;
      const rollbackDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
      
      const newHistoryItem: EntryVersionHistoryItem = {
        version: newVersionNum,
        date: rollbackDate,
        updatedBy: '合规管理员 (Rollback Trigger)',
        note: `自动执行版本回退：将内容回滚至历史版本 ${hist.version} (由 ${hist.updatedBy} 提交于 ${hist.date})。`,
        current: true,
        contentBackup: hist.contentBackup || entry.content,
        titleBackup: hist.titleBackup || entry.title,
        summaryBackup: hist.summaryBackup || entry.summary
      };

      // Set other histories to current: false
      const updatedHistory: EntryVersionHistoryItem[] = historyList.map(h => ({
        ...h,
        current: false
      }));

      // Insert the new recovery rollback node at the top
      updatedHistory.unshift(newHistoryItem);

      // Create updated entry
      const updatedEntry: WikiEntry = {
        ...entry,
        title: hist.titleBackup || entry.title,
        summary: hist.summaryBackup || entry.summary,
        content: hist.contentBackup || entry.content,
        entryVersion: newVersionNum,
        lastUpdatedAt: rollbackDate,
        latestUpdatedAt: rollbackDate,
        updatedBy: '合规管理员',
        versionNote: `自动回滚恢复至版本 ${hist.version}`,
        isStableVersion: false, // Rollbacks need re-audit
        entryVersionHistory: updatedHistory
      };

      // Apply update directly to memory references if possible or trigger callback
      if (onRollbackSuccess) {
        onRollbackSuccess(updatedEntry);
      }
      
      setSelectedHistory(null);
      setIsRollingBack(false);
      alert(`[合规安全触发] 知识回溯执行成功！条目已被全量回滚至版本 ${hist.version}，系统生成了新版标记 ${newVersionNum} 以留存备份。`);
    }, 500);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm" id="entry-version-history-panel">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100 select-none">
        <h3 className="text-xs font-extrabold text-[#2B3150] uppercase tracking-wide flex items-center">
          <History className="w-4 h-4 mr-1.5 text-[#DB5F5B]" />
          <span>条目物理修订与全量备份链 (Auditing Timeline)</span>
        </h3>
        <span className="text-[9px] text-gray-400 font-mono">
          共 {historyList.length} 个历史节点
        </span>
      </div>

      <div className="space-y-3">
        {/* Horizontal or Vertical clean list */}
        <div className="relative border-l-2 border-gray-150 pl-4 ml-2.5 py-1 space-y-4">
          {historyList.map((hist, idx) => (
            <div key={idx} className="relative text-xs">
              {/* Timeline Indicator dot */}
              <span className={`absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                hist.current 
                  ? 'bg-[#DB5F5B] border-white ring-2 ring-[#DB5F5B]/30' 
                  : 'bg-gray-300 border-white'
              }`} />

              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`font-mono font-bold text-xs ${hist.current ? 'text-[#DB5F5B]' : 'text-gray-700'}`}>
                    {hist.version}
                  </span>
                  
                  {hist.current && (
                    <span className="bg-red-50 text-[#DB5F5B] border border-red-100 text-[8px] px-1 py-0.1 rounded font-bold uppercase scale-90">
                      当前最新版本
                    </span>
                  )}

                  <span className="text-[10px] text-gray-400 font-mono">{hist.date}</span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500 font-bold flex items-center scale-90">
                    <User className="w-3 h-3 mr-0.5 text-gray-300" />
                    {hist.updatedBy}
                  </span>
                </div>

                <div className="bg-gray-50 hover:bg-gray-100/70 border border-gray-150 rounded-lg p-2.5 mt-1 transition-all">
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    {hist.note}
                  </p>
                  
                  {/* Expand historical details link */}
                  <div className="mt-1.5 pt-1.5 border-t border-gray-200/50 flex justify-between select-none">
                    <button
                      onClick={() => setSelectedHistory(hist)}
                      className="text-[#DB5F5B] font-bold text-[10px] hover:underline"
                    >
                      查看此版本全量备份 & 恢复 →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Backup Details Modal/Drawer */}
      {selectedHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in text-xs">
          <div className="bg-white border border-gray-200 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            
            {/* Header row */}
            <div className="flex justify-between items-start pb-2 border-b border-gray-150">
              <div className="space-y-0.5">
                <h4 className="font-extrabold text-sm text-[#2B3150]">
                  历史备份快照详情 (Snapshot Preview)
                </h4>
                <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono">
                  <span>版本: {selectedHistory.version}</span>
                  <span>•</span>
                  <span>备份时间: {selectedHistory.date}</span>
                  <span>•</span>
                  <span>提交人: {selectedHistory.updatedBy}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedHistory(null)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold bg-gray-50 hover:bg-gray-100 w-6 h-6 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Note */}
            <div className="bg-amber-50 border border-amber-200/50 p-3 rounded-lg">
              <span className="font-bold text-[10px] text-amber-800 uppercase block tracking-wider mb-1 select-none">
                💡 修订日志:
              </span>
              <p className="text-gray-700 text-[11px] leading-relaxed italic">
                {selectedHistory.note}
              </p>
            </div>

            {/* Simulated file fields backup */}
            <div className="space-y-2 select-text font-sans">
              <div>
                <span className="font-bold text-gray-400 text-[10px] uppercase tracking-wide block select-none">备份标题 (Title Backup):</span>
                <p className="font-bold text-gray-800 bg-gray-50 border border-gray-150 p-2 rounded">{selectedHistory.titleBackup || entry.title}</p>
              </div>

              <div>
                <span className="font-bold text-gray-400 text-[10px] uppercase tracking-wide block select-none">备份摘要 (Summary Backup):</span>
                <p className="text-gray-600 bg-gray-50 border border-gray-150 p-2 rounded leading-relaxed">{selectedHistory.summaryBackup || entry.summary}</p>
              </div>

              <div>
                <span className="font-bold text-gray-400 text-[10px] uppercase tracking-wide block select-none">全量 Markdown 备份内容 (Content Backup):</span>
                <pre className="text-[10px] font-mono text-gray-600 bg-gray-900 border border-gray-950 text-emerald-400 p-3 rounded overflow-x-auto max-h-48 leading-relaxed">
                  {stripDataUriImages(selectedHistory.contentBackup || entry.content)}
                </pre>
              </div>
            </div>

            {/* Rollback and cancel buttons */}
            <div className="flex gap-2 pt-3 border-t border-gray-100 select-none">
              <button
                disabled={isRollingBack}
                onClick={() => handleRollback(selectedHistory)}
                className={`flex-1 py-2 rounded text-white font-bold transition-all flex items-center justify-center space-x-1.5 ${
                  selectedHistory.current 
                    ? 'bg-gray-300 cursor-not-allowed' 
                    : 'bg-[#DB5F5B] hover:bg-[#DB5F5B]/90'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRollingBack ? '正在还原快照数据...' : '一键物理回退至此版本 (Rollback)'}</span>
              </button>

              <button
                onClick={() => setSelectedHistory(null)}
                className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded"
              >
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
