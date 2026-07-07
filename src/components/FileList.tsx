import React from 'react';
import { WikiFile } from '../types/file';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { Download, File, Trash2 } from 'lucide-react';

interface FileListProps {
  files: WikiFile[];
  onDownload: (file: WikiFile) => void;
  onDelete?: (id: number) => void;
  isLoggedIn: boolean;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onDownload,
  onDelete,
  isLoggedIn
}) => {
  const { lang } = useLanguageTheme();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const Sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + Sizes[i];
  };

  if (files.length === 0) {
    return (
      <div className="text-xs text-theme-muted italic py-2 pr-2">
        {lang === 'zh' ? '暂无关联的演示素材或说明附件。' : 'No linked visual assets or supplementary attachments bound.'}
      </div>
    );
  }

  return (
    <div className="space-y-2" id="wiki-file-list">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between p-3 bg-theme-bg/60 hover:bg-theme-bg/95 border border-theme-border rounded-lg transition-colors text-xs sm:text-sm"
          id={`file-item-${file.id}`}
        >
          <div className="flex items-center gap-2.5 overflow-hidden pr-4">
            <div className="p-2 bg-theme-card rounded-md border border-theme-border text-theme-text flex-shrink-0">
              <File className="w-4 h-4 text-brand-coral" />
            </div>
            <div className="overflow-hidden">
              <p className="font-extrabold text-theme-text truncate" title={file.original_filename}>
                {file.original_filename}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-theme-muted font-mono mt-0.5">
                <span>{formatBytes(file.file_size)}</span>
                <span>•</span>
                <span className="truncate max-w-[80px]">{file.file_type}</span>
                <span>•</span>
                <span className="text-theme-text font-bold bg-theme-border/60 px-1 py-0.25 rounded-xs scale-90">{file.usage_type}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onDownload(file)}
              className="p-1.5 hover:bg-theme-card text-theme-muted hover:text-theme-text border border-transparent hover:border-theme-border rounded-md transition-all cursor-pointer"
              title={lang === 'zh' ? '下载附件' : 'Get file'}
              id={`file-btn-dl-${file.id}`}
            >
              <Download className="w-4 h-4" />
            </button>
            {isLoggedIn && onDelete && (
              <button
                onClick={() => {
                  const askMsg = lang === 'zh' 
                    ? `确认要从系统中永久移除附件「${file.original_filename}」吗？` 
                    : `Confirm removal of complementary attachment: "${file.original_filename}"?`;
                  if (confirm(askMsg)) {
                    onDelete(file.id);
                  }
                }}
                className="p-1.5 hover:bg-brand-coral/10 text-theme-muted hover:text-brand-coral rounded-md transition-colors cursor-pointer"
                title={lang === 'zh' ? '删除附件' : 'Delete file'}
                id={`file-btn-delete-${file.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
