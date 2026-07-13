import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminApi, ImportJob } from '../api/adminApi';
import { 
  FileUp, Settings, Play, CheckCircle, AlertCircle, RefreshCw, 
  Database, Info, Lock, Globe, FileText, ChevronRight, ArrowLeft, ArrowRight, Activity 
} from 'lucide-react';
import Unauthorized from '../components/Unauthorized';

interface AdminImportPageProps {
  onNavigate: (view: string, id?: string) => void}

export default function AdminImportPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  // Wizard Step State: 1 = Upload, 2 = Configure, 3 = Pipeline Execution & Audits
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mockFileName, setMockFileName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('internal');
  const [targetSpaceId, setTargetSpaceId] = useState('s-sandbox');

  // Upload and Job states
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [jobState, setJobState] = useState<ImportJob | null>(null);
  const [historyJobs, setHistoryJobs] = useState<ImportJob[]>([]);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileData = useRef<ArrayBuffer | string | undefined>(undefined);
  const jobTriggered = useRef<boolean>(false);

  if (!isLoggedIn) {
    return (
      <Unauthorized requiredRole="admin"
      />
    )}

  // Watch for upload progress reaching 100%, then trigger the actual import API
  useEffect(() => {
    if (uploadProgress !== null && uploadProgress >= 100 && !jobTriggered.current) {
      jobTriggered.current = true;
      console.log('[Import] Upload animation done → calling API');
      triggerJob()}
  }, [uploadProgress]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()};

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setMockFileName(file.name)}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setMockFileName(file.name)}
  };

  const handleQuickUploadSample = (name: string) => {
    setSelectedFile(new File([''], name));
    setMockFileName(name)};

  const handleStartImport = async () => {
    if (!mockFileName || !selectedFile) return;

    console.log('[Import] Step 1: Starting import pipeline');
    console.log('[Import] File:', mockFileName, 'Size:', selectedFile.size, 'Visibility:', visibility, 'Space:', targetSpaceId);

    // Reset states
    setCurrentStep(3);
    setUploadProgress(10);
    setJobState(null);
    setPipelineError(null);
    jobTriggered.current = false;

    // Read file content
    try {
      const isText = /\.(md|txt|csv|json|xml|yaml|yml)$/i.test(selectedFile.name);
      if (isText) {
        pendingFileData.current = await selectedFile.text();
        console.log('[Import] File read as text:', (pendingFileData.current as string).length, 'chars')} else {
        pendingFileData.current = await selectedFile.arrayBuffer();
        console.log('[Import] File read as binary:', (pendingFileData.current as ArrayBuffer).byteLength, 'bytes')}
    } catch (err: any) {
      console.error('[Import] File read error:', err);
      setPipelineError(`文件读取失败: ${err.message || '未知错误'}`);
      setUploadProgress(null);
      return}

    // Verify file data is not empty
    const data = pendingFileData.current;
    const isEmpty = !data ||
      (typeof data === 'string' && data.length === 0) ||
      (data instanceof ArrayBuffer && data.byteLength === 0);

    if (isEmpty) {
      console.log('[Import] File is empty — will use sample content generator')}

    // Upload progress animation — side-effect-free: clamp at 100 to avoid overshoot
    console.log('[Import] Starting upload progress animation');
    const uploadInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev === null) return 10;
        const next = prev + 25;
        if (next >= 100) {
          clearInterval(uploadInterval);
          return 100; // ← clamp to exactly 100, triggers the useEffect once
        }
        return next})}, 100)};

  const triggerJob = async () => {
    const fileData = pendingFileData.current;
    console.log('[Import] Step 2: Calling adminApi.startImportJob...');
    try {
      const job = await adminApi.startImportJob(
        { name: mockFileName, size: selectedFile?.size || 0, data: fileData },
        targetSpaceId
      );
      console.log('[Import] API response — status:', job.status, 'entryId:', job.entryId);
      console.log('[Import] Stages:', JSON.stringify(job.steps.map(s => ({ name: s.name, status: s.status, error: s.error }))));

      setJobState(job);
      setUploadProgress(null);

      if (job.status === 'success') {
        setHistoryJobs(prev => [job, ...prev])} else if (job.status === 'failed') {
        setHistoryJobs(prev => [job, ...prev]);
        const failedStep = job.steps.find(s => s.status === 'failed');
        setPipelineError(failedStep?.error || '管道执行失败')}
    } catch (err: any) {
      console.error('[Import] API call failed:', err);
      setPipelineError(`API 调用失败: ${err.message || '网络错误'}`);
      setUploadProgress(null);
      setJobState(null)}
  };

  const jobStep = jobState ? jobState.steps[jobState.currentStepIndex] : null;
  const progressPercent = jobState 
    ? Math.round(((jobState.currentStepIndex + 1) / jobState.steps.length) * 100) 
    : 0;

  return (
    <div className="space-y-6" id="admin-import-panel">
      
      {/* Header Info */}
      <div className="border-b border-gray-200 pb-4 select-none">
        <h1 className="text-2xl font-extrabold text-[#2B3150] font-sans flex items-center">
          <Settings className="w-6 h-6 text-[#DB5F5B] mr-2" />
          <span>MarkItDown 智能文本加工服务 (Ingestion Service)</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          将外部非结构化研究报告（PDF、Docx、Drizzle schema 脚本）进行自适应清洗、公式高保真提取、分块索引并全量挂载发布。
        </p>
      </div>

      {/* Wizard Progress Stepper Header */}
      <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs font-bold border-b border-gray-100 pb-3 select-none">
        {[
          { step: 1, name: '1. 选择与导入物理文件' },
          { step: 2, name: '2. 设定挂载空间与密级' },
          { step: 3, name: '3. 执行 MarkItDown 提取流水线' }
        ].map((item) => (
          <div
            key={item.step}
            className={`flex items-center space-x-1 ${
              currentStep === item.step 
                ? 'text-[#DB5F5B]' 
                : currentStep > item.step 
                ? 'text-[#2B3150]' 
                : 'text-gray-400'
            }`}
          >
            <span>{item.name}</span>
            {item.step < 3 && <ChevronRight className="w-4 h-4 text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Main interactive area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Main Stepper Content */}
        <div className="lg:col-span-8 space-y-6">

          {/* STEP 1: Upload File */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="space-y-1.5 select-none">
                <h3 className="text-sm font-extrabold text-gray-900 uppercase">第一步：选择需要分析的物理文件</h3>
                <p className="text-xs text-gray-500">
                  支持 PDF / Word / Excel / PPT / HTML / Markdown / CSV / 图片（OCR）及纯文本格式。
                </p>
              </div>

              {/* Drag & Drop Frame */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-gray-900 bg-white hover:bg-gray-50 rounded py-12 px-4 text-center cursor-pointer transition-all space-y-3 select-none"
              >
                <FileUp className="w-10 h-10 text-gray-400 mx-auto" />
                <div className="text-xs text-gray-700 font-bold">
                  {mockFileName ? `已装载文件: ${mockFileName}` : '拖拽物理文件至此，或点击浏览本地文件'}
                </div>
                <p className="text-[10px] text-gray-400">支持 *.pdf, *.docx, *.doc, *.xlsx, *.xls, *.pptx, *.ppt, *.html, *.htm, *.md, *.adoc, *.csv, *.txt, *.json, *.xml, *.yaml, *.log, *.png, *.jpg, *.jpeg, *.gif, *.webp</p>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.html,.htm,.md,.adoc,.asciidoc,.csv,.txt,.json,.xml,.yaml,.yml,.log,.png,.jpg,.jpeg,.gif,.webp"
                />
              </div>

              {/* Sample files list */}
              <div className="space-y-2 text-xs select-none">
                <span className="font-bold text-gray-500 text-[11px] block">快速装载 Sandbox 量子实测样例成果：</span>
                <div className="space-y-1.5 pl-1">
                  {[
                    'stabilizer_quantum_correction_report_2026.pdf',
                    'biochemical_sandbox_binding_protein.md',
                    'materials_structure_pgvector_schema.md'
                  ].map((name) => (
                    <button
                      key={name}
                      onClick={() => handleQuickUploadSample(name)}
                      className={`w-full text-left p-2 border rounded font-mono text-[11px] block transition-all ${
                        mockFileName === name 
                          ? 'border-[#DB5F5B] bg-[#F5F6E5]/40 text-[#DB5F5B] font-bold' 
                          : 'border-gray-200 hover:border-gray-400 bg-white text-gray-600'
                      }`}
                    >
                      + {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action row */}
              <div className="flex justify-end pt-4 select-none">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!mockFileName}
                  className="bg-[#2B3150] hover:bg-[#2B3150]/90 disabled:opacity-50 text-white font-bold text-xs px-5 py-2 border-2 border-gray-900 transition-all flex items-center space-x-1"
                >
                  <span>下一步：设定挂载空间</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Configure Scope & Space */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="space-y-1.5 select-none">
                <h3 className="text-sm font-extrabold text-gray-900 uppercase">第二步：设定本条目密级权限与发布空间</h3>
                <p className="text-xs text-gray-500">
                  确保选择正确的范围，防止机密算法公开。挂载的空间将决定大模型调用 RAG 时搜寻的默认切片集。
                </p>
              </div>

              {/* Form config options */}
              <div className="bg-white border border-gray-200 rounded p-5 space-y-4 font-sans text-xs">
                
                {/* File info */}
                <div>
                  <span className="text-gray-400 block text-[10px]">待加工文件:</span>
                  <span className="font-bold font-mono text-gray-800 text-sm">{mockFileName}</span>
                </div>

                {/* Scope */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-gray-800 uppercase tracking-wide">
                    安全可见性密级 (Visibility Scope)：
                  </label>
                  <div className="flex items-center space-x-4 bg-gray-50 p-2.5 rounded border border-gray-150 select-none">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="visibility"
                        checked={visibility === 'internal'}
                        onChange={() => setVisibility('internal')}
                        className="text-[#DB5F5B] h-4 w-4"
                      />
                      <span className="font-bold text-gray-700 flex items-center">
                        <Lock className="w-3.5 h-3.5 mr-0.5 text-red-500" />
                        内网机密 (Internal - 仅研发可见)
                      </span>
                    </label>

                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="visibility"
                        checked={visibility === 'public'}
                        onChange={() => setVisibility('public')}
                        className="text-[#DB5F5B] h-4 w-4"
                      />
                      <span className="font-bold text-gray-700 flex items-center">
                        <Globe className="w-3.5 h-3.5 mr-0.5 text-green-600" />
                        公开可用 (Public - 访客外部可见)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Space Node */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-gray-800 uppercase tracking-wide">
                    发布挂载空间 (Target Space Node)：
                  </label>
                  <select
                    value={targetSpaceId}
                    onChange={(e) => setTargetSpaceId(e.target.value)}
                    className="w-full border-2 border-gray-900 rounded p-2.5 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-[#DB5F5B]"
                  >
                    <option value="s-sandbox">Sandbox 物理计算项目知识库</option>
                    <option value="s-papers">前沿科研文献白皮书库</option>
                    <option value="s-data">企业研发数据结构定义规范</option>
                  </select>
                </div>
              </div>

              {/* Action row */}
              <div className="flex justify-between pt-4 select-none">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs px-5 py-2 border-2 border-gray-900 transition-all flex items-center space-x-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>上一步</span>
                </button>

                <button
                  onClick={handleStartImport}
                  className="bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-xs px-5 py-2 border-2 border-gray-900 transition-all flex items-center space-x-1.5"
                >
                  <Play className="w-4 h-4 text-yellow-400" />
                  <span>一键启动 MarkItDown 加工并发布 &rarr;</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Execution Progress Stream */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="space-y-1.5 select-none">
                <h3 className="text-sm font-extrabold text-gray-900 uppercase">第三步：实时加工监控及计算日志</h3>
                <p className="text-xs text-gray-500">
                  文件二进制正在传输，稍后将由 MarkItDown 工具链自动提取表格、高保真 LaTeX 算子，并将 RAG 活性服务自动注册就绪。
                </p>
              </div>

              {/* Processing Block */}
              <div className="bg-white border border-gray-200 rounded p-5 space-y-4 font-mono text-xs">
                
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="font-bold text-gray-800">
                    {uploadProgress !== null ? '二进制挂载传输中...' : 'MarkItDown 解析流水线就绪'}
                  </span>
                  <span className="text-[10px] text-gray-400">SESSION: {jobState?.id || 'PENDING'}</span>
                </div>

                {/* Error state */}
                {pipelineError && (
                  <div className="bg-red-50 border border-red-300 rounded p-4 text-xs text-red-800 space-y-2">
                    <div className="font-extrabold flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1 text-red-600" />
                      <span>管道启动失败</span>
                    </div>
                    <p className="text-[11px]">{pipelineError}</p>
                    <button
                      onClick={() => { setPipelineError(null); setCurrentStep(2)}}
                      className="bg-white border border-red-300 hover:bg-red-50 text-red-700 font-bold px-3 py-1 rounded text-[11px]"
                    >
                      返回重试
                    </button>
                  </div>
                )}

                {/* Upload progress bar — stays visible until jobState arrives */}
                {!pipelineError && uploadProgress !== null && (
                  <div className="space-y-2 py-4">
                    <div className="flex justify-between font-bold text-xs">
                      <span>传输物理流 (Raw Data Pipeline):</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden border">
                      <div className="h-full bg-blue-700 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    {uploadProgress >= 100 && (
                      <p className="text-[10px] text-blue-600 animate-pulse text-center">正在等待后端管道响应...</p>
                    )}
                  </div>
                )}

                {/* API call in progress — no job yet, progress bar done */}
                {!pipelineError && uploadProgress === null && !jobState && (
                  <div className="flex items-center justify-center py-8 space-x-2 text-gray-500">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-xs">正在启动 Ingestion Pipeline...</span>
                  </div>
                )}

                {jobState && jobStep ? (
                  <div className="space-y-4">
                    
                    {/* Live step */}
                    {jobState.status === 'failed' ? (
                      <div className="bg-red-50 border border-red-200 rounded p-3 text-[11px] text-red-800 flex items-start">
                        <AlertCircle className="w-4 h-4 mr-1.5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">管道执行失败</span>
                          <p className="text-[10px] text-red-700/80 mt-0.5">
                            {jobState.steps.find((s) => s.status === 'failed')?.error || '未知错误，请检查日志'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-[11px] text-yellow-800 flex items-start">
                        <RefreshCw className="w-4 h-4 mr-1.5 text-yellow-600 animate-spin shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">当前环节：{jobStep?.name || '就绪中...'}</span>
                          <p className="text-[10px] text-yellow-700/80 mt-0.5">{jobStep?.description || ''}</p>
                        </div>
                      </div>
                    )}

                    {/* Progress slider bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-gray-500 font-bold">
                        <span>总计算进度 (Task Progress):</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                        <div className="h-full bg-gradient-to-r from-blue-700 to-green-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>

                    {/* Sequential step timeline representation */}
                    <div className="space-y-2 text-[11px] pt-2 border-t border-gray-100">
                      {jobState.steps.map((st, i) => (
                        <div key={st.id} className="space-y-0.5">
                          <div className="flex items-center justify-between select-none py-0.5">
                            <span className={`${
                              st.status === 'running'
                                ? 'text-yellow-600 font-bold'
                                : st.status === 'success'
                                ? 'text-green-600 font-bold'
                                : st.status === 'failed'
                                ? 'text-red-600 font-bold'
                                : 'text-gray-400'
                            }`}>
                              {st.status === 'success' ? '✓' : st.status === 'failed' ? '✗' : st.status === 'running' ? '▶' : '○'} {st.name}
                            </span>
                            <span className={`text-[9px] ${
                              st.status === 'failed' ? 'text-red-500' : 'text-gray-400'
                            }`}>{st.status === 'failed' ? 'FAILED' : st.status}</span>
                          </div>
                          {st.status === 'failed' && st.error && (
                            <p className="text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 ml-4">
                              {st.error}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                  </div>
                ) : null}

                {/* Successful Done prompt */}
                {jobState && jobState.status === 'success' && (
                  <div className="bg-green-50 border border-green-200 p-3.5 rounded text-[11px] text-green-800 space-y-2 select-none">
                    <div className="font-extrabold flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1 text-green-600" />
                      <span>加工发布就绪 (Task Completed successfully)</span>
                    </div>
                    <p className="text-[10px] leading-relaxed">
                      已将 <strong className="font-mono">{mockFileName}</strong> 物理实体利用 MarkItDown 完成了公式提取，并注册为全新 Wiki 活性大模型 RAG 服务！
                    </p>
                    <div className="pt-1 flex gap-2">
                      <button
                        onClick={() => {
                          // reset state
                          setCurrentStep(1);
                          setSelectedFile(null);
                          setMockFileName('');
                          setJobState(null)}}
                        className="bg-white border border-green-300 hover:bg-green-100 text-green-800 font-bold px-2 py-1 rounded transition-all"
                      >
                        继续上传物理文件 &rarr;
                      </button>
                      
                      <button
                        onClick={() => navigate('/search')}
                        className="bg-green-700 hover:bg-green-800 text-white font-bold px-2.5 py-1 rounded transition-all"
                      >
                        去搜索页查阅条目 &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: History logs and Auditing */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-gray-200 rounded p-4 space-y-3 select-none">
            <h3 className="font-extrabold text-xs text-gray-900 pb-1.5 border-b border-gray-100 uppercase tracking-wide">
              全域上传审计日志 (Ingestion Audits)
            </h3>

            <div className="space-y-3 text-xs font-sans">
              {historyJobs.length === 0 && (
                <p className="text-gray-400 italic text-[11px] py-4 text-center">暂无导入记录</p>
              )}
              {historyJobs.map((job) => (
                <div key={job.id} className={`p-2.5 border rounded ${
                  job.status === 'success' ? 'bg-green-50 border-green-200' :
                  job.status === 'failed' ? 'bg-red-50 border-red-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-gray-800 block truncate max-w-[150px]">{job.filename}</span>
                    <span className={`text-[9px] px-1 rounded font-bold uppercase font-mono ${
                      job.status === 'success' ? 'text-green-800 bg-green-100' :
                      job.status === 'failed' ? 'text-red-800 bg-red-100' :
                      'text-yellow-800 bg-yellow-100'
                    }`}>
                      {job.status === 'success' ? '✓ Success' : job.status === 'failed' ? '✗ Failed' : '⋯ Running'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 block mt-0.5 font-mono">{job.startedAt}</span>
                  {job.status === 'failed' && job.steps.find((s) => s.status === 'failed')?.error && (
                    <p className="text-[10px] text-red-600 mt-1 leading-normal bg-red-50 p-1 rounded">
                      {job.steps.find((s) => s.status === 'failed')!.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  )}
