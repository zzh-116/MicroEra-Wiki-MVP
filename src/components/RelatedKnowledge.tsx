import { useNavigate } from 'react-router-dom';
import { Link2, ArrowRight } from 'lucide-react';
import { WikiEntry } from '../types/wiki';
import EntryTypeBadge from './EntryTypeBadge';

interface RelatedKnowledgeProps {
  relatedEntries: WikiEntry[];
}

export default function RelatedKnowledge({ relatedEntries }: RelatedKnowledgeProps) {
  const navigate = useNavigate();
  if (!relatedEntries || relatedEntries.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-2" id="no-related-knowledge">
        暂无相关关联知识
      </div>
    );
  }

  return (
    <div className="space-y-2" id="related-knowledge-container">
      {relatedEntries.map((entry) => (
        <div
          key={entry.id}
          onClick={() => navigate(`/entry/${entry.id}`)}
          className="p-2.5 bg-white rounded-lg border border-gray-100 hover:border-[#DB5F5B]/30 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div className="flex items-start justify-between gap-1 mb-1">
            <span className="font-medium text-xs text-gray-800 line-clamp-1 group-hover:text-[#DB5F5B] transition-colors" title={entry.title}>
              {entry.title}
            </span>
            <Link2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
          </div>
          
          <p className="text-[10px] text-gray-500 line-clamp-2 mb-1.5 leading-relaxed">
            {entry.summary}
          </p>

          <div className="flex items-center justify-between text-[10px]">
            <EntryTypeBadge type={entry.entryType} />
            <span className="text-[#DB5F5B] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
              <span>阅读</span>
              <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
