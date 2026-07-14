import { Tag } from 'lucide-react';

interface TagListProps {
  tags: (string | { id?: number | string; name?: string; label?: string; title?: string })[];
}

/** Safely extract display text from a tag — handles both strings and objects */
function tagText(tag: string | Record<string, unknown>): string {
  if (typeof tag === 'string') return tag.trim();
  if (tag && typeof tag === 'object') {
    return String(tag.name || tag.label || tag.title || tag.value || '').trim();
  }
  return '';
}

export default function TagList({ tags }: TagListProps) {
  if (!tags || tags.length === 0) return null;

  const cleaned = tags.map(tagText).filter(Boolean);

  if (cleaned.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2 mb-4" id="tag-list-container">
      <Tag className="w-3.5 h-3.5 text-gray-400 self-center mr-0.5" />
      {cleaned.map((tag, idx) => (
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
