import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbsProps {
  paths: { label: string; view?: string; id?: string }[];
  onNavigate: (view: string, id?: string) => void;
}

export default function Breadcrumbs({ paths, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center space-x-1 text-xs text-gray-500 mb-3 select-none" id="breadcrumbs-nav">
      <button
        onClick={() => onNavigate('public-home')}
        className="flex items-center hover:text-[#DB5F5B] transition-colors"
      >
        <Home className="w-3 h-3 mr-1" />
        <span>首页</span>
      </button>
      
      {paths.map((path, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          {idx === paths.length - 1 ? (
            <span className="font-semibold text-gray-700 truncate max-w-[200px]" title={path.label}>
              {path.label}
            </span>
          ) : (
            <button
              onClick={() => path.view && onNavigate(path.view, path.id)}
              className="hover:text-[#DB5F5B] transition-colors truncate max-w-[150px]"
            >
              {path.label}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
