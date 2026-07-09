import { useState } from 'react';
import { FileText, Eye, Code, Check } from 'lucide-react';
import { MarkdownFile } from '../types/wiki';
import { stripDataUriImages } from '../utils/adapter';

interface MarkdownPreviewProps {
  markdownFile: MarkdownFile | null;
  onClose?: () => void;
}

export default function MarkdownPreview({ markdownFile, onClose }: MarkdownPreviewProps) {
  const [copied, setCopied] = useState(false);

  if (!markdownFile) {
    return (
      <div className="p-8 text-center text-gray-400 italic bg-gray-50 rounded-lg border border-dashed border-gray-200" id="markdown-preview-empty">
        未找到转换对应的 Markdown 文档，请联系管理员启动 MarkItDown 数据流水线。
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownFile.markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden" id="markdown-preview-panel">
      {/* Panel Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-[#DB5F5B]" />
          <span className="font-semibold text-xs text-gray-700">
            MarkItDown 转换输出: {markdownFile.mdFilename}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-green-700 bg-green-50 border border-green-150 px-1.5 py-0.5 rounded font-mono">
            {markdownFile.parserName} {markdownFile.parserVersion} • 解析成功
          </span>
          <button
            onClick={handleCopy}
            className="p-1 text-gray-500 hover:text-[#DB5F5B] hover:bg-gray-100 rounded transition-all text-xs flex items-center space-x-1 px-2 border border-gray-200"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-600" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Code className="w-3 h-3" />
                <span>复制 MD 源码</span>
              </>
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 hover:bg-gray-100 rounded border border-gray-200"
            >
              关闭预览
            </button>
          )}
        </div>
      </div>

      {/* Styled Rendered Markdown container */}
      <div className="p-5 max-h-[500px] overflow-y-auto bg-white font-sans text-xs leading-relaxed text-gray-700 select-text">
        <div className="prose prose-sm max-w-none prose-headings:text-[#2B3150] prose-headings:font-bold prose-h1:text-lg prose-h2:text-sm prose-h3:text-xs">
          {/* We will render markdown text by splitting it into sections and displaying nice visual blocks */}
          {stripDataUriImages(markdownFile.markdownContent).split('\n').map((line, idx) => {
            if (line.startsWith('# ')) {
              return (
                <h1 key={idx} className="text-base font-bold text-[#2B3150] border-b border-gray-100 pb-1 mt-4 mb-2">
                  {line.replace('# ', '')}
                </h1>
              );
            }
            if (line.startsWith('## ')) {
              return (
                <h2 key={idx} className="text-xs font-bold text-[#DB5F5B] mt-3 mb-1.5 uppercase tracking-wider">
                  {line.replace('## ', '')}
                </h2>
              );
            }
            if (line.startsWith('### ')) {
              return (
                <h3 key={idx} className="text-xs font-semibold text-gray-800 mt-2 mb-1">
                  {line.replace('### ', '')}
                </h3>
              );
            }
            if (line.startsWith('- ')) {
              return (
                <div key={idx} className="flex items-start space-x-1.5 ml-2.5 my-1">
                  <span className="text-[#DB5F5B] font-bold">•</span>
                  <span>{line.replace('- ', '')}</span>
                </div>
              );
            }
            if (line.trim().startsWith('{') || line.trim().startsWith('"') || line.trim().startsWith('}')) {
              return (
                <pre key={idx} className="bg-gray-900 text-green-400 p-2.5 rounded-md font-mono text-[10px] my-2 overflow-x-auto block border-l-4 border-[#F2D760]">
                  <code>{line}</code>
                </pre>
              );
            }
            if (line.trim() === '```json' || line.trim() === '```') {
              return null; // Skip code wrappers for simplicity
            }
            if (!line.trim()) {
              return <div key={idx} className="h-2" />;
            }
            return (
              <p key={idx} className="my-1.5 text-gray-600 font-sans leading-relaxed">
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
