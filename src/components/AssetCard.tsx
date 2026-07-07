import React from 'react';
import { Entry } from '../types/entry';
import { WikiFile } from '../types/file';
import { VisibilityBadge } from './VisibilityBadge';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Download, FileText, ArrowRight, Image as ImageIcon } from 'lucide-react';

interface AssetCardProps {
  entry: Entry;
  file?: WikiFile;
  onSelect: (id: number) => void;
  onDownload: (file: WikiFile) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  entry,
  file,
  onSelect,
  onDownload
}) => {
  const { lang } = useLanguageTheme();

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const renderAssetVisual = (filename?: string) => {
    if (filename?.includes('business-flow')) {
      return (
        <svg viewBox="0 0 400 220" className="w-full h-full bg-[#0b0e1b] pr-1 select-none">
          <rect width="100%" height="100%" fill="#0a0f1d" />
          <defs>
            <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#DB5F5B" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          
          <g transform="translate(20,90)">
            <rect width="80" height="40" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
            <text x="40" y="24" fill="#cbd5e1" fontSize="10" textAnchor="middle" fontWeight="bold">
              {lang === 'zh' ? '商务对接' : 'CRM Pipeline'}
            </text>
          </g>
          
          <g transform="translate(150,90)">
            <rect width="100" height="40" rx="6" fill="url(#flowGrad)" stroke="#DB5F5B" strokeWidth="1" />
            <text x="50" y="24" fill="#ffffff" fontSize="10" textAnchor="middle" fontWeight="bold">
              {lang === 'zh' ? '高通量算力排班' : 'DFT HPC Sched'}
            </text>
          </g>
          
          <g transform="translate(300,90)">
            <rect width="80" height="40" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
            <text x="40" y="24" fill="#cbd5e1" fontSize="10" textAnchor="middle" fontWeight="bold">
              {lang === 'zh' ? '数据智能交付' : 'Smart Delivery'}
            </text>
          </g>

          <path d="M 100 110 L 150 110" stroke="#475569" strokeWidth="2" fill="none" />
          <path d="M 250 110 L 300 110" stroke="#DB5F5B" strokeWidth="2" fill="none" />
          
          <text x="200" y="40" fill="#F2D760" fontSize="11" textAnchor="middle" fontWeight="bold" letterSpacing="1">BUSINESS WORKFLOW</text>
          <text x="200" y="180" fill="#64748b" fontSize="9" textAnchor="middle">
            {lang === 'zh' ? '密级：仅限内部汇报及宣外脱敏展示' : 'Strictness: Declassified for guest deck views'}
          </text>
        </svg>
      );
    }

    if (filename?.includes('product-image')) {
      return (
        <svg viewBox="0 0 400 220" className="w-full h-full bg-[#0a0f1d] select-none">
          <rect width="100%" height="100%" fill="#090d16" />
          <circle cx="200" cy="110" r="45" fill="none" stroke="#2B3150" strokeWidth="2" strokeDasharray="5,5" />
          <circle cx="200" cy="110" r="75" fill="none" stroke="#F2D760" strokeWidth="1" strokeDasharray="2,4" />
          
          <circle cx="200" cy="110" r="16" fill="#2B3150" stroke="#F2D760" strokeWidth="1.5" />
          <text x="200" y="114" fill="#F2D760" fontSize="11" fontWeight="bold" textAnchor="middle">Si</text>
          
          <circle cx="160" cy="80" r="10" fill="#DB5F5B" />
          <text x="160" y="83" fill="#ffffff" fontSize="8" textAnchor="middle">O</text>
          <circle cx="240" cy="140" r="10" fill="#DB5F5B" />
          <text x="240" y="143" fill="#ffffff" fontSize="8" textAnchor="middle">O</text>

          <circle cx="250" cy="70" r="12" fill="#10b981" />
          <text x="250" y="74" fill="#ffffff" fontSize="9" textAnchor="middle">Ti</text>
          <circle cx="150" cy="150" r="12" fill="#10b981" />
          <text x="150" y="154" fill="#ffffff" fontSize="9" textAnchor="middle">Ti</text>

          <line x1="200" y1="110" x2="160" y2="80" stroke="#DB5F5B" strokeWidth="1.5" />
          <line x1="200" y1="110" x2="240" y2="140" stroke="#DB5F5B" strokeWidth="1.5" />
          <line x1="200" y1="110" x2="250" y2="70" stroke="#34d399" strokeWidth="1.5" />
          <line x1="200" y1="110" x2="150" y2="150" stroke="#34d399" strokeWidth="1.5" />

          <text x="35" y="35" fill="#DB5F5B" fontSize="9" fontWeight="bold" letterSpacing="1">QCMDP v2.0 RENDERING</text>
          <text x="200" y="195" fill="#475569" fontSize="9" textAnchor="middle">Si-Ti Supercell Bravais Lattice Orbital Cloud</text>
        </svg>
      );
    }

    if (filename?.includes('factory-photo')) {
      return (
        <svg viewBox="0 0 400 220" className="w-full h-full bg-[#0a0f1d] select-none">
          <rect width="100%" height="100%" fill="#060b13" />
          <path d="M0 40 L400 40 M0 80 L400 80 M0 120 L400 120 M0 160 L400 160" stroke="#0f172a" strokeWidth="1" />
          <path d="M80 0 L80 220 M160 0 L160 220 M240 0 L240 220 M320 0 L320 220" stroke="#0f172a" strokeWidth="1" />
          
          <rect x="60" y="60" width="120" height="100" rx="4" fill="#1e293b" stroke="#F2D760" strokeWidth="1.5" />
          <rect x="80" y="80" width="80" height="40" rx="2" fill="#0f172a" stroke="#DB5F5B" strokeWidth="1" />
          <line x1="120" y1="80" x2="120" y2="120" stroke="#DB5F5B" strokeWidth="2" strokeDasharray="3,3" />

          <rect x="220" y="50" width="120" height="120" rx="4" fill="#1e293b" stroke="#DB5F5B" strokeWidth="1.5" />
          <circle cx="280" cy="110" r="30" fill="#0f172a" stroke="#F2D760" strokeWidth="1" />
          <line x1="280" y1="80" x2="280" y2="140" stroke="#F2D760" strokeWidth="1" />
          <line x1="250" y1="110" x2="310" y2="110" stroke="#F2D760" strokeWidth="1" />

          <text x="200" y="30" fill="#F2D760" fontSize="10" textAnchor="middle" fontWeight="bold" letterSpacing="1">
            {lang === 'zh' ? '微观纪元高精度薄膜真空物理沉积间' : 'MicroEra High Vac Deposition Cleanroom'}
          </text>
          <text x="200" y="195" fill="#475569" fontSize="9" textAnchor="middle">
            {lang === 'zh' ? '图样审核：涉密脱敏已通过，可对公展示' : 'Visual assessment: Passed desensitization audit'}
          </text>
        </svg>
      );
    }

    return (
      <div className="w-full h-full bg-[#0d101e] flex flex-col items-center justify-center p-4">
        <ImageIcon className="w-12 h-12 text-theme-muted mb-2 animate-pulse" />
        <span className="text-xs font-mono text-theme-muted font-bold max-w-[280px] text-center truncate">
          {filename || 'attachment-resource.file'}
        </span>
        <span className="text-[9px] text-[#DB5F5B] uppercase tracking-widest font-extrabold mt-2">
          COMPLEX SCHEMATIC ASSET
        </span>
      </div>
    );
  };

  return (
    <div
      className="bg-theme-card border border-theme-border rounded-xl overflow-hidden hover:shadow-lg hover:border-brand-yellow transition-all flex flex-col justify-between"
      id={`asset-card-${entry.id}`}
    >
      {/* 1. Styled graphic header illustration area */}
      <div className="h-44 w-full bg-theme-bg/60 border-b border-theme-border overflow-hidden relative group font-sans">
        {renderAssetVisual(file?.original_filename)}
        
        {/* Absolute floating usage_type handle */}
        <div className="absolute top-3 left-3 bg-brand-indigo text-brand-yellow text-[9px] font-bold px-2 py-0.5 rounded-md uppercase border border-brand-yellow/30 shadow-xs">
          {file?.usage_type || (lang === 'zh' ? '展示素材' : 'Media')}
        </div>
      </div>

      {/* 2. Body Details Area */}
      <div className="p-5 flex-grow flex flex-col justify-between">
        <div>
          {/* Badge & Scope header */}
          <div className="flex items-center gap-2 mb-2">
            <VisibilityBadge visibility={entry.visibility} />
            <span className="text-[10px] text-theme-muted font-mono select-none">
              ID: {entry.id}
            </span>
          </div>

          <h3 className="text-sm font-extrabold text-theme-text mb-1 font-sans tracking-tight hover:text-brand-coral cursor-pointer" onClick={() => onSelect(entry.id)}>
            {entry.title}
          </h3>
          <p className="text-xs text-theme-muted line-clamp-2 leading-relaxed mb-4">
            {entry.summary}
          </p>
        </div>

        {/* 3. Download information row */}
        <div className="border-t border-theme-border pt-4 mt-2">
          {file ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-theme-text font-semibold">
                <span className="truncate max-w-[150px] text-[#DB5F5B]" title={file.original_filename}>
                  📂 {file.original_filename}
                </span>
                <span>{formatBytes(file.file_size)}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSelect(entry.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-theme-bg hover:bg-brand-indigo/10 border border-theme-border text-[11px] font-extrabold text-theme-text rounded-md transition-all cursor-pointer"
                  id={`asset-card-btn-view-${entry.id}`}
                >
                  <span>{lang === 'zh' ? '查看说明' : 'Read Docs'}</span>
                  <ArrowRight className="w-3 h-3 text-brand-coral" />
                </button>
                <button
                  onClick={() => onDownload(file)}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo text-[11px] font-extrabold rounded-md transition-all shadow-xs cursor-pointer hover:opacity-90"
                  id={`asset-card-btn-dl-${file.id}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '下载素材' : 'Get Item'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-theme-muted italic">{lang === 'zh' ? '未绑定独立附件文件' : 'No attachment file bound'}</span>
              <button
                onClick={() => onSelect(entry.id)}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-indigo dark:text-brand-yellow hover:text-brand-coral transition-colors cursor-pointer"
                id={`asset-card-btn-read-${entry.id}`}
              >
                <span>{lang === 'zh' ? '查看说明' : 'Read Docs'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
