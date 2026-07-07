import { FileDown, Lock, Unlock, ShieldCheck } from 'lucide-react';
import { SourceFile } from '../types/wiki';

interface SourceFileListProps {
  files: SourceFile[];
  onDownloadMock?: (filename: string) => void;
  onPreviewMarkdown?: (sourceFileId: string) => void;
}

export default function SourceFileList({ files, onDownloadMock, onPreviewMarkdown }: SourceFileListProps) {
  if (!files || files.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-3 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200" id="no-source-files">
        该条目暂无物理源文件关联
      </div>
    );
  }

  const handleDownload = (f: SourceFile) => {
    if (onDownloadMock) {
      onDownloadMock(f.originalFilename);
    } else {
      alert(`[Mock下载成功] 文件：${f.originalFilename}\n存储路径：${f.storagePath}\nSHA256哈希校验成功！`);
    }
  };

  return (
    <div className="space-y-2.5" id="source-file-list-container">
      {files.map((file) => (
        <div
          key={file.id}
          className="p-3 bg-white border border-gray-150 rounded-lg shadow-sm hover:border-gray-300 transition-all text-xs"
        >
          <div className="flex items-start justify-between mb-1.5">
            <div className="min-w-0 pr-2">
              <span className="font-semibold text-gray-800 break-all flex items-center">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-500 font-mono uppercase mr-1.5">
                  {file.fileType}
                </span>
                {file.originalFilename}
              </span>
              <p className="text-[10px] text-gray-500 mt-0.5 font-mono truncate" title={file.storagePath}>
                路径: {file.storagePath}
              </p>
            </div>

            <div className="flex items-center space-x-1 flex-shrink-0">
              <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-1 rounded">
                {file.version}
              </span>
              {file.isLocked ? (
                <Lock className="w-3 h-3 text-red-400" title="锁定只读 (防篡改)" />
              ) : (
                <Unlock className="w-3 h-3 text-green-400" title="可编辑更新" />
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-1.5 rounded text-[10px] font-mono text-gray-500 break-all border border-gray-100 mb-2">
            <div className="flex items-center text-[#2B3150] font-bold text-[9px] uppercase tracking-wider mb-0.5">
              <ShieldCheck className="w-3 h-3 mr-0.5 text-[#DB5F5B]" />
              <span>SHA-256 完整性哈希：</span>
            </div>
            {file.sha256}
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-100">
            <span className="text-gray-400">
              大小: {file.fileSize} | 由 {file.uploadedBy} 上传于 {file.uploadedAt}
            </span>

            <div className="flex items-center space-x-2">
              {onPreviewMarkdown && (
                <button
                  onClick={() => onPreviewMarkdown(file.id)}
                  className="px-2 py-1 bg-[#F5F6E5] text-[#2B3150] hover:bg-[#F2D760]/30 rounded transition-all font-medium border border-[#DB5F5B]/10 hover:border-[#DB5F5B]/30"
                >
                  查看 MarkItDown 结果
                </button>
              )}
              <button
                onClick={() => handleDownload(file)}
                className="px-2 py-1 text-white bg-[#2B3150] hover:bg-[#2B3150]/90 rounded transition-all font-medium flex items-center space-x-1"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>下载</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
