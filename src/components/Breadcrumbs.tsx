import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbsProps {
  paths: { label: string; to?: string }[];
}

export default function Breadcrumbs({ paths }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center space-x-1 text-xs text-gray-500 mb-3 select-none" id="breadcrumbs-nav">
      <Link
        to="/"
        className="flex items-center hover:text-[#DB5F5B] transition-colors"
      >
        <Home className="w-3 h-3 mr-1" />
        <span>首页</span>
      </Link>

      {paths.map((path, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          {idx === paths.length - 1 || !path.to ? (
            <span className="font-semibold text-gray-700 truncate max-w-[200px]" title={path.label}>
              {path.label}
            </span>
          ) : (
            <Link
              to={path.to}
              className="hover:text-[#DB5F5B] transition-colors truncate max-w-[150px]"
            >
              {path.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
