import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { uploadManager } from '../services/uploadManager';
import type { UploadJob } from '../services/uploadManager';
import {
  FileUp, Play, CheckCircle, AlertCircle, RefreshCw,
  Lock, Globe, FileText, X, ArrowUpRight, Clock,
  FileArchive, FileSpreadsheet, FileImage, FileCode,
  Presentation
} from 'lucide-react';
import Unauthorized from '../components/Unauthorized';

interface AdminImportPageProps {
  onNavigate: (view: string, id?: string) => void;
}

// ─── Format categories for display ───────────────────────────────────────────
const FORMAT_CATEGORIES = [
  {
    label: '文档',
    icon: FileText,
    extensions: ['PDF', 'DOCX', 'DOC'],
  },
  {
    label: '表格',
    icon: FileSpreadsheet,
    extensions: ['XLSX', 'XLS', 'CSV'],
  },
  {
    label: '演示',
    icon: Presentation,
    extensions: ['PPTX', 'PPT'],
  },
  {
    label: '文本与代码',
    icon: FileCode,
    extensions: ['MD', 'TXT', 'JSON', 'XML', 'YAML', 'LOG', 'HTML', 'ADOC'],
  },
  {
    label: '图片',
    icon: FileImage,
    extensions: ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'],
  },
];

const SAMPLE_FILES = [
  'stabilizer_quantum_correction_report_2026.pdf',
  'biochemical_sandbox_binding_protein.md',
  'materials_structure_pgvector_schema.md',
];

const ACCEPT_STRING =
  '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.html,.htm,.md,.adoc,.asciidoc,.csv,.txt,.json,.xml,.yaml,.yml,.log,.png,.jpg,.jpeg,.gif,.webp';

// ─── Stage display metadata ──────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  parse: '解析文档',
  chunk: '智能分块',
  embed: '向量嵌入',
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  parse: 'MarkItDown → 统一 Markdown',
  chunk: '语义分块 + 元数据提取',
  embed: 'BGE-M3 → pgvector 存储',
};

// ─── Helper: derive a display label for a file extension ──────────────────────
function fileTypeLabel(fileName: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  const map: Record<string, string> = {
    PDF: 'PDF 文档', DOCX: 'Word 文档', DOC: 'Word 文档',
    XLSX: 'Excel 表格', XLS: 'Excel 表格', CSV: 'CSV 数据',
    PPTX: 'PowerPoint', PPT: 'PowerPoint',
    MD: 'Markdown', TXT: '纯文本', JSON: 'JSON', XML: 'XML',
    YAML: 'YAML', YML: 'YAML', LOG: '日志',
    HTML: 'HTML', HTM: 'HTML', ADOC: 'AsciiDoc', ASCIIDOC: 'AsciiDoc',
    PNG: 'PNG 图片', JPG: 'JPEG 图片', JPEG: 'JPEG 图片',
    GIF: 'GIF 图片', WEBP: 'WebP 图片',
  };
  return map[ext] || `${ext} 文件`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminImportPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mockFileName, setMockFileName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('internal');
  const [targetSpaceId, setTargetSpaceId] = useState('s-sandbox');
  const [activeJob, setActiveJob] = useState<UploadJob | null>(null);
  const [historyJobs, setHistoryJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const archivedRef = useRef<Set<string>>(new Set());

  // ── Subscribe to the global upload manager ─────────────────────────────────
  useEffect(() => {
    return uploadManager.subscribe(() => {
      if (!activeJobIdRef.current) return;
      const job = uploadManager.getJob(activeJobIdRef.current);
      if (!job) return;

      // Spread into a new object — the manager mutates the source object in place,
      // so passing the same reference would skip React re-render.
      setActiveJob({ ...job });

      if (
        (job.status === 'success' || job.status === 'failed') &&
        !archivedRef.current.has(job.id)
      ) {
        archivedRef.current.add(job.id);
        setHistoryJobs((prev) => [job, ...prev]);
      }
    });
  }, []);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return <Unauthorized requiredRole="admin" />;
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setMockFileName(file.name);
      setCurrentStep(2);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setMockFileName(file.name);
      setCurrentStep(2);
    }
  };

  const handleQuickUploadSample = (name: string) => {
    setSelectedFile(new File([''], name));
    setMockFileName(name);
    setCurrentStep(2);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setMockFileName('');
    setCurrentStep(1);
    setActiveJob(null);
    activeJobIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStartImport = () => {
    if (!selectedFile) return;

    setCurrentStep(3);
    setActiveJob(null);
    const jobId = uploadManager.startUpload(selectedFile, targetSpaceId);
    activeJobIdRef.current = jobId;
    setActiveJob({ ...uploadManager.getJob(jobId)! });
  };

  const handleResetAndNew = () => {
    setCurrentStep(1);
    setSelectedFile(null);
    setMockFileName('');
    setActiveJob(null);
    activeJobIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Derived display state ──────────────────────────────────────────────────
  const hasFile = !!mockFileName && !!selectedFile;
  const isUploading = activeJob?.status === 'uploading';
  const isWaitingForApi = activeJob?.status === 'pending';
  const isPipelineRunning = activeJob?.status === 'running';
  const isSuccess = activeJob?.status === 'success';
  const isFailure = activeJob?.status === 'failed' || activeJob?.status === 'cancelled';
  const isCancelled = activeJob?.status === 'cancelled';
  const showConfig = hasFile && !isUploading && !isWaitingForApi && !isPipelineRunning && !isSuccess && !isFailure;
  const showProcessing = isUploading || isWaitingForApi || isPipelineRunning;
  const showResult = isSuccess || isFailure;
  const showSamples = !hasFile && !showProcessing && !showResult;

  const failedStage = activeJob?.stages.find((s) => s.status === 'failed');
  const pipelineProgress = activeJob
    ? Math.min(Math.round((activeJob.stages.length / 3) * 100), 100)
    : 0;

  // ── Helpers for render ─────────────────────────────────────────────────────
  const renderFileSize = () => {
    if (!selectedFile || selectedFile.size === 0) return null;
    const kb = selectedFile.size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" id="admin-import-panel">
      {/* ═══ Page Header ═══════════════════════════════════════════════════════ */}
      <header className="border-b border-gray-200 pb-5">
        <h1 className="text-2xl font-bold text-ink font-display flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded bg-brand/10">
            <FileUp className="w-5 h-5 text-brand" aria-hidden="true" />
          </span>
          知识导入
        </h1>
        <p className="mt-2 text-sm text-gray-500 max-w-2xl">
          将外部非结构化文档（PDF、DOCX、Markdown 等）导入企业知识库，
          经由 MarkItDown 解析、智能分块与向量嵌入后，挂载至指定空间并激活 RAG 检索。
        </p>
      </header>

      {/* ═══ Main Layout ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left: Main Content ─────────────────────────────────────────── */}
        <div className="lg:col-span-8 space-y-5">
          {/* ─── Upload Zone (Hero) ──────────────────────────────────────── */}
          <section
            aria-label="文件上传区域"
            className={`
              relative border-2 rounded-lg transition-all duration-200
              ${dragOver
                ? 'border-brand border-solid bg-brand/5 shadow-[0_0_0_4px_rgba(219,95,91,0.1)]'
                : 'border-dashed border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50/50'
              }
              ${hasFile ? 'p-5' : 'py-14 px-6'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept={ACCEPT_STRING}
              aria-label="选择文件上传"
            />

            {/* ── Empty state: drag-and-drop prompt ─────────────────────── */}
            {!hasFile && (
              <div
                className="flex flex-col items-center text-center cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                aria-label="点击上传文件"
              >
                <div
                  className={`
                    flex items-center justify-center w-16 h-16 rounded-full mb-4 transition-all duration-200
                    ${dragOver ? 'bg-brand/10 scale-110' : 'bg-gray-100'}
                  `}
                >
                  <FileUp
                    className={`w-8 h-8 transition-colors duration-200 ${dragOver ? 'text-brand' : 'text-gray-400'}`}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  拖拽文件至此处上传
                </h2>
                <p className="text-sm text-gray-500 mb-2">
                  或点击浏览本地文件
                </p>
                <p className="text-xs text-gray-400">
                  支持 PDF、DOCX、MD、CSV、JSON、图片等格式 · 最大 50MB
                </p>
              </div>
            )}

            {/* ── File card state ────────────────────────────────────────── */}
            {hasFile && (
              <div className="flex items-center gap-4">
                {/* File type icon */}
                <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-lg bg-ink/5">
                  <FileText className="w-5 h-5 text-ink" aria-hidden="true" />
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate font-mono">
                    {mockFileName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fileTypeLabel(mockFileName)}
                    {renderFileSize() && (
                      <span className="ml-2 text-gray-400">{renderFileSize()}</span>
                    )}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-brand transition-colors px-2 py-1 rounded hover:bg-brand/5"
                  aria-label="移除文件"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>移除</span>
                </button>
              </div>
            )}
          </section>

          {/* ─── Sample Files (when no file selected) ────────────────────── */}
          {showSamples && (
            <section aria-label="快速开始">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">
                快速装载 Sandbox 量子实测样例
              </p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_FILES.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleQuickUploadSample(name)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                      border transition-all duration-150
                      ${mockFileName === name
                        ? 'border-brand bg-brand/5 text-brand'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    <FileText className="w-3 h-3" aria-hidden="true" />
                    <span className="font-mono text-[11px] truncate max-w-[220px]">
                      {name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ─── Configuration Panel ─────────────────────────────────────── */}
          {showConfig && (
            <section
              aria-label="导入配置"
              className="bg-white border border-gray-200 rounded-lg p-5 space-y-5 animate-fade-in"
            >
              <h3 className="text-sm font-semibold text-ink font-display">
                配置导入选项
              </h3>

              {/* ── Visibility ──────────────────────────────────────────── */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  可见性范围
                </legend>
                <div className="flex flex-wrap gap-3">
                  <label
                    className={`
                      flex items-center gap-2 px-4 py-2.5 rounded-md border-2 cursor-pointer transition-all duration-150
                      ${visibility === 'internal'
                        ? 'border-ink bg-ink/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value="internal"
                      checked={visibility === 'internal'}
                      onChange={() => setVisibility('internal')}
                      className="sr-only"
                    />
                    <Lock className={`w-4 h-4 ${visibility === 'internal' ? 'text-brand' : 'text-gray-400'}`} aria-hidden="true" />
                    <span className={`text-sm font-medium ${visibility === 'internal' ? 'text-ink' : 'text-gray-600'}`}>
                      内网机密
                    </span>
                    <span className="text-xs text-gray-400">仅研发可见</span>
                  </label>

                  <label
                    className={`
                      flex items-center gap-2 px-4 py-2.5 rounded-md border-2 cursor-pointer transition-all duration-150
                      ${visibility === 'public'
                        ? 'border-ink bg-ink/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={visibility === 'public'}
                      onChange={() => setVisibility('public')}
                      className="sr-only"
                    />
                    <Globe className={`w-4 h-4 ${visibility === 'public' ? 'text-green-600' : 'text-gray-400'}`} aria-hidden="true" />
                    <span className={`text-sm font-medium ${visibility === 'public' ? 'text-ink' : 'text-gray-600'}`}>
                      公开可用
                    </span>
                    <span className="text-xs text-gray-400">外部可见</span>
                  </label>
                </div>
              </fieldset>

              {/* ── Target Space ─────────────────────────────────────────── */}
              <div className="space-y-2">
                <label
                  htmlFor="target-space-select"
                  className="text-xs font-semibold text-gray-700 uppercase tracking-wide block"
                >
                  挂载空间
                </label>
                <select
                  id="target-space-select"
                  value={targetSpaceId}
                  onChange={(e) => setTargetSpaceId(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-md px-3 py-2.5 text-sm font-medium bg-white
                             focus:outline-none focus:border-ink focus:ring-2 focus:ring-brand/20
                             transition-all duration-150 appearance-none
                             bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
                             bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10"
                >
                  <option value="s-sandbox">Sandbox 项目</option>
                  <option value="s-papers">学术论文</option>
                  <option value="s-data">数据标准</option>
                  <option value="s-business">商业资料</option>
                  <option value="s-template">模板规范</option>
                  <option value="s-product">技术文档</option>
                  <option value="s-patent">专利成果</option>
                  <option value="s-handwritten">手写笔记</option>
                </select>
              </div>

              {/* ── Action ───────────────────────────────────────────────── */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  onClick={handleRemoveFile}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  取消，重新选择文件
                </button>
                <button
                  onClick={handleStartImport}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink hover:bg-ink/90
                             text-white text-sm font-semibold rounded-md
                             border-2 border-transparent
                             focus:outline-none focus:ring-2 focus:ring-brand/40
                             transition-all duration-150"
                >
                  <Play className="w-4 h-4 text-accent" aria-hidden="true" />
                  启动导入
                </button>
              </div>
            </section>
          )}

          {/* ─── Processing View ─────────────────────────────────────────── */}
          {showProcessing && (
            <section
              aria-label="导入处理进度"
              className="bg-white border border-gray-200 rounded-lg p-5 space-y-5 animate-fade-in"
            >
              <h3 className="text-sm font-semibold text-ink font-display">
                {isUploading ? '正在上传文件...' : isWaitingForApi ? '正在排队等待处理...' : '正在处理中...'}
              </h3>

              {/* ── Upload progress bar ─────────────────────────────────── */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-600">上传进度</span>
                    <span className="font-bold text-ink font-mono">
                      {activeJob!.uploadProgress}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={activeJob!.uploadProgress!} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="h-full bg-ink rounded-full transition-all duration-150 ease-out"
                      style={{ width: `${activeJob!.uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {activeJob!.uploadProgress! < 100 ? '正在传输文件二进制数据...' : '文件已接收，等待后端管道启动...'}
                  </p>
                </div>
              )}

              {/* ── Waiting for API (queued) ─────────────────────────────── */}
              {isWaitingForApi && (
                <div className="flex items-center justify-center gap-3 py-6 text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span className="text-sm font-medium">正在排队等待处理（最多同时处理 2 个）...</span>
                </div>
              )}

              {/* ── Pipeline stages ──────────────────────────────────────── */}
              {isPipelineRunning && (
                <div className="space-y-4">
                  {/* Overall progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-600">管道进度</span>
                      <span className="font-bold text-ink font-mono">
                        {pipelineProgress}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pipelineProgress} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className="h-full bg-gradient-to-r from-ink to-brand rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${pipelineProgress}%` }}
                      />
                    </div>
                  </div>

                  {activeJob!.stages.length === 0 ? (
                    <div className="flex items-center justify-center gap-3 py-6 text-gray-500">
                      <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                      <span className="text-sm font-medium">正在解析文档...</span>
                    </div>
                  ) : (
                    <ul className="space-y-1.5" role="list">
                      {activeJob!.stages.map((st) => {
                        const isComplete = st.status === 'success';
                        const isStepFailed = st.status === 'failed';
                        const isSkipped = st.status === 'skipped';
                        const name = STAGE_LABELS[st.stage] || st.stage;
                        const description = STAGE_DESCRIPTIONS[st.stage] || '';

                        return (
                          <li
                            key={st.stage}
                            className={`
                              flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-300
                              ${isComplete ? 'bg-green-50/50' : ''}
                              ${isStepFailed ? 'bg-red-50 border border-red-200' : ''}
                              ${isSkipped ? 'bg-gray-50' : ''}
                            `}
                          >
                            {/* Status icon */}
                            <span className="flex-shrink-0 flex items-center justify-center w-6 h-6" aria-hidden="true">
                              {isSkipped && <span className="w-2 h-2 rounded-full bg-gray-300" />}
                              {isComplete && <CheckCircle className="w-4 h-4 text-green-600" />}
                              {isStepFailed && <AlertCircle className="w-4 h-4 text-red-600" />}
                            </span>

                            {/* Stage info */}
                            <div className="flex-1 min-w-0">
                              <p className={`
                                text-sm font-medium
                                ${isComplete ? 'text-green-800' : ''}
                                ${isStepFailed ? 'text-red-800' : ''}
                                ${isSkipped ? 'text-gray-500' : ''}
                              `}>
                                {name}
                              </p>
                              {description && (
                                <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                              )}
                              {isStepFailed && st.detail && (
                                <p className="text-xs text-red-600 mt-1 bg-red-100/50 px-2 py-1 rounded">
                                  {st.detail}
                                </p>
                              )}
                            </div>

                            {/* Status label */}
                            <span className={`
                              flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded
                              ${isComplete ? 'text-green-700 bg-green-100' : ''}
                              ${isStepFailed ? 'text-red-700 bg-red-100' : ''}
                              ${isSkipped ? 'text-gray-400 bg-gray-100' : ''}
                            `}>
                              {isSkipped && '跳过'}
                              {isComplete && '完成'}
                              {isStepFailed && '失败'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ─── Result View ─────────────────────────────────────────────── */}
          {showResult && (
            <section
              aria-label={isSuccess ? '导入成功' : '导入失败'}
              className={`
                border rounded-lg p-5 space-y-4 animate-fade-in
                ${isSuccess ? 'bg-green-50/60 border-green-300' : 'bg-red-50/60 border-red-300'}
              `}
            >
              {/* ── Success ──────────────────────────────────────────────── */}
              {isSuccess && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
                      <CheckCircle className="w-5 h-5 text-green-600" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-green-900">
                        导入成功
                      </h3>
                      <p className="text-sm text-green-700 mt-0.5">
                        文件已成功解析、分块并嵌入向量数据库，RAG 服务已就绪。
                      </p>
                    </div>
                  </div>

                  {/* Pipeline summary — show completed steps */}
                  {activeJob && activeJob.stages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeJob.stages.filter((s) => s.status === 'success').map((st) => (
                        <span
                          key={st.stage}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-green-100 text-green-800"
                        >
                          <CheckCircle className="w-3 h-3" aria-hidden="true" />
                          {STAGE_LABELS[st.stage] || st.stage}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {activeJob?.entryId && (
                      <button
                        onClick={() => navigate(`/entry/${activeJob.entryId}`)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-ink/90
                                   text-white text-sm font-medium rounded-md
                                   border-2 border-transparent
                                   focus:outline-none focus:ring-2 focus:ring-brand/40
                                   transition-all duration-150"
                      >
                        查看条目
                        <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      onClick={() => navigate('/search')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50
                                 text-ink text-sm font-medium rounded-md
                                 border-2 border-gray-200 hover:border-ink
                                 focus:outline-none focus:ring-2 focus:ring-brand/40
                                 transition-all duration-150"
                    >
                      搜索知识库
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={handleResetAndNew}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50
                                 text-gray-700 text-sm font-medium rounded-md
                                 border-2 border-gray-200 hover:border-gray-400
                                 focus:outline-none focus:ring-2 focus:ring-brand/40
                                 transition-all duration-150"
                    >
                      继续上传
                    </button>
                  </div>
                </>
              )}

              {/* ── Failure / Cancelled ───────────────────────────────────── */}
              {isFailure && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                      <AlertCircle className="w-5 h-5 text-red-600" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-red-900">
                        {isCancelled ? '已取消' : '导入失败'}
                      </h3>
                      <p className="text-sm text-red-700 mt-0.5">
                        {isCancelled
                          ? '导入已取消。'
                          : activeJob?.error || failedStage?.detail || '管道执行过程中发生未知错误，请重试。'}
                      </p>
                    </div>
                  </div>

                  {/* Show which step failed */}
                  {!isCancelled && failedStage && (
                    <div className="bg-red-100/50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-800">
                      <span className="font-semibold">失败环节：</span>
                      {STAGE_LABELS[failedStage.stage] || failedStage.stage}
                      {STAGE_DESCRIPTIONS[failedStage.stage] && ` — ${STAGE_DESCRIPTIONS[failedStage.stage]}`}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      onClick={() => {
                        setActiveJob(null);
                        activeJobIdRef.current = null;
                        setCurrentStep(2);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-ink/90
                                 text-white text-sm font-medium rounded-md
                                 border-2 border-transparent
                                 focus:outline-none focus:ring-2 focus:ring-brand/40
                                 transition-all duration-150"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      重试导入
                    </button>
                    <button
                      onClick={handleRemoveFile}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50
                                 text-gray-700 text-sm font-medium rounded-md
                                 border-2 border-gray-200 hover:border-gray-400
                                 focus:outline-none focus:ring-2 focus:ring-brand/40
                                 transition-all duration-150"
                    >
                      重新选择文件
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        {/* ── Right: Sidebar ─────────────────────────────────────────────── */}
        <aside className="lg:col-span-4 space-y-5">
          {/* ─── Recent Uploads ────────────────────────────────────────── */}
          <section
            aria-label="最近上传记录"
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <h3 className="text-sm font-semibold text-ink font-display pb-3 border-b border-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" aria-hidden="true" />
              最近导入
            </h3>

            {historyJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileArchive className="w-8 h-8 text-gray-300 mb-2" aria-hidden="true" />
                <p className="text-xs text-gray-400">暂无导入记录</p>
                <p className="text-[11px] text-gray-300 mt-0.5">上传文件后将在此显示</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100" role="list">
                {historyJobs.slice(0, 5).map((job) => {
                  const isJobSuccess = job.status === 'success';
                  const isJobFailed = job.status === 'failed';
                  const isJobCancelled = job.status === 'cancelled';

                  return (
                    <li key={job.id} className="py-3 first:pt-3 last:pb-0">
                      <div className="flex items-start gap-3">
                        {/* Status dot */}
                        <span
                          className={`flex-shrink-0 mt-1 w-2 h-2 rounded-full ${
                            isJobSuccess
                              ? 'bg-green-500'
                              : isJobFailed
                                ? 'bg-red-500'
                                : isJobCancelled
                                  ? 'bg-gray-400'
                                  : 'bg-yellow-500 animate-pulse'
                          }`}
                          aria-hidden="true"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate font-mono">
                            {job.filename}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                            {job.createdAt}
                          </p>

                          {/* Failed detail */}
                          {isJobFailed && job.error && (
                            <p className="text-[11px] text-red-600 mt-1 line-clamp-2">
                              {job.error}
                            </p>
                          )}

                          {/* Success: quick link to entry */}
                          {isJobSuccess && job.entryId && (
                            <button
                              onClick={() => navigate(`/entry/${job.entryId}`)}
                              className="inline-flex items-center gap-1 text-[11px] text-link hover:underline mt-1"
                            >
                              查看条目
                              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        {/* Status badge */}
                        <span
                          className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            isJobSuccess
                              ? 'text-green-700 bg-green-50'
                              : isJobFailed
                                ? 'text-red-700 bg-red-50'
                                : isJobCancelled
                                  ? 'text-gray-600 bg-gray-100'
                                  : 'text-yellow-700 bg-yellow-50'
                          }`}
                        >
                          {isJobSuccess ? '成功' : isJobFailed ? '失败' : isJobCancelled ? '已取消' : '处理中'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Pipeline step legend */}
            {historyJobs.length > 0 && (
              <p className="text-[10px] text-gray-300 mt-2 pt-2 border-t border-gray-50 text-center">
                最近 5 条导入记录
              </p>
            )}
          </section>

          {/* ─── Supported Formats ──────────────────────────────────────── */}
          <section
            aria-label="支持的文件格式"
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <h3 className="text-sm font-semibold text-ink font-display pb-3 border-b border-gray-100">
              支持的文件格式
            </h3>

            <div className="space-y-3 mt-3">
              {FORMAT_CATEGORIES.map((cat) => (
                <div key={cat.label} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <cat.icon className="w-3.5 h-3.5" aria-hidden="true" />
                    {cat.label}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cat.extensions.map((ext) => (
                      <span
                        key={ext}
                        className="inline-block px-2 py-0.5 text-[11px] font-medium text-gray-600 bg-gray-100 rounded font-mono"
                      >
                        .{ext.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
              单个文件最大 50MB · 支持 OCR 图片文字识别
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
