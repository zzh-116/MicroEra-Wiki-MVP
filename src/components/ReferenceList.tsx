import { useNavigate } from 'react-router-dom';
import { Quote, FileText, ChevronRight } from 'lucide-react';
import { Reference } from '../types/wiki';

interface ReferenceListProps {
  references: Reference[];
}

export default function ReferenceList({ references }: ReferenceListProps) {
  const navigate = useNavigate();
  if (!references || references.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-2" id="no-references">
        无直接引用文献或源文件标注
      </div>
    );
  }

  return (
    <div className="space-y-3" id="reference-list-container">
      {references.map((ref) => (
        <div
          key={ref.id}
          className="p-3 bg-[#F5F6E5]/40 rounded-lg border border-[#DB5F5B]/10 hover:border-[#DB5F5B]/30 transition-all text-xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-[#2B3150] flex items-center">
              <FileText className="w-3.5 h-3.5 mr-1 text-[#DB5F5B]" />
              {ref.title || '引用文献'}
            </span>
            <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-100">
              位置：{ref.locator}
            </span>
          </div>

          <div className="pl-3 border-l-2 border-[#DB5F5B]/20 text-gray-600 italic mb-2 select-all">
            <Quote className="w-3 h-3 text-gray-300 inline mr-1 -mt-1.5" />
            {ref.quote}
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1.5 border-t border-dashed border-gray-200">
            <span>引用类型：{ref.referenceType === 'paper' ? '学术论文' : 'Sandbox 结果文件'}</span>
            {ref.toEntryId && (
              <button
                onClick={() => navigate(`/entry/${ref.toEntryId}`)}
                className="text-[#DB5F5B] hover:underline flex items-center font-medium"
              >
                <span>跳转至关联条目</span>
                <ChevronRight className="w-3 h-3 ml-0.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
