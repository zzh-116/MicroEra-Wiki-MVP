import { Eye, ShieldAlert } from 'lucide-react';

interface VisibilityBadgeProps {
  visibility: 'public' | 'internal';
}

export default function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  const isPublic = visibility === 'public';

  return (
    <span
      id={`visibility-badge-${visibility}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        isPublic
          ? 'bg-[#F5F6E5] text-green-700 border-green-200'
          : 'bg-red-50 text-[#DB5F5B] border-red-100'
      }`}
    >
      {isPublic ? (
        <>
          <Eye className="w-3 h-3 mr-1 text-green-600" />
          <span>公开 (Public)</span>
        </>
      ) : (
        <>
          <ShieldAlert className="w-3 h-3 mr-1 text-[#DB5F5B]" />
          <span>内部 (Internal)</span>
        </>
      )}
    </span>
  );
}
