import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, File, Loader2 } from 'lucide-react';
import { UsageType } from '../types/file';

interface FileUploadProps {
  onUpload: (file: { name: string; size: number; type: string }) => void;
  usageType: UsageType;
  onUsageTypeChange: (type: UsageType) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  usageType,
  onUsageTypeChange
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const usageTypes: UsageType[] = ['PPT素材', '宣发素材', '客户展示', '研发资料', '产品资料', '内部归档'];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    setUploadState('uploading');
    
    // Simulate real upload timing delay for UX
    setTimeout(() => {
      setUploadedFile({
        name: file.name,
        size: file.size
      });
      setUploadState('success');
      onUpload({
        name: file.name,
        size: file.size,
        type: file.type
      });
    }, 1200);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  const handleReset = () => {
    setUploadState('idle');
    setUploadedFile(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs" id="wiki-file-uploader">
      <h4 className="text-xs font-bold text-gray-400 font-mono uppercase tracking-wider mb-4">
        附件与媒体上传 (Mock Upload)
      </h4>

      {/* Usage type selection */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          文件推荐用途 (Usage Area)
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {usageTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onUsageTypeChange(type)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg text-center cursor-pointer border transition-all ${
                usageType === type
                  ? 'bg-gray-950 text-white border-gray-950 font-semibold'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Drag & Drop Box */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${
          dragActive
            ? 'border-gray-900 bg-gray-50'
            : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        id="upload-drag-area"
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleChange}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.json,.zip,.txt,.cif"
          id="upload-file-input"
        />

        {uploadState === 'idle' && (
          <>
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-gray-400 border border-gray-150 mb-3.5 shadow-xs">
              <UploadCloud className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-1">
              拖拽文件到此处，或{' '}
              <button
                type="button"
                onClick={onButtonClick}
                className="text-gray-950 underline hover:text-gray-700 font-bold focus:outline-hidden"
              >
                浏览电脑文件
              </button>
            </p>
            <p className="text-xs text-gray-400">
              支持图片 (png, jpg), 文档 (xlsx, pdf), 材料坐标 (cif) 等，最大限额 50M
            </p>
          </>
        )}

        {uploadState === 'uploading' && (
          <div className="flex flex-col items-center py-4">
            <Loader2 className="w-8 h-8 text-gray-700 animate-spin mb-3.5" />
            <p className="text-sm font-semibold text-gray-800 mb-1">正在模拟上传到物理目录...</p>
            <p className="text-xs text-gray-400">正在调用 POST /api/files/upload 预留端点</p>
          </div>
        )}

        {uploadState === 'success' && uploadedFile && (
          <div className="flex flex-col items-center py-2">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100 mb-3.5">
              <CheckCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-emerald-800 mb-1">
              文件上传接入手动注入成功！
            </p>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-150 rounded-lg text-xs text-gray-600 font-mono mb-4">
              <File className="w-3.5 h-3.5 text-gray-400" />
              <span>{uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              继续上传新附件
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
