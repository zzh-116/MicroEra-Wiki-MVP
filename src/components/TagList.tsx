import { Tag } from 'lucide-react';

interface TagListProps {
  tags: string[];
}

export default function TagList({ tags }: TagListProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2 mb-4" id="tag-list-container">
      <Tag className="w-3.5 h-3.5 text-gray-400 self-center mr-0.5" />
      {tags.map((tag, idx) => (
        <span
          key={idx}
          className="px-2 py-0.5 text-xs bg-gray-50 text-gray-600 rounded-full border border-gray-100 hover:border-gray-300 transition-all cursor-default"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
