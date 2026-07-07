import React from 'react';
import { Shield, Eye } from 'lucide-react';
import { VisibilityType } from '../types/entry';
import { useLanguageTheme } from '../context/LanguageThemeContext';

interface VisibilityBadgeProps {
  visibility: VisibilityType;
}

export const VisibilityBadge: React.FC<VisibilityBadgeProps> = ({ visibility }) => {
  const { lang } = useLanguageTheme();
  const isPublic = visibility === 'public';

  const label = isPublic 
    ? (lang === 'zh' ? '公开 (Public)' : 'Public Scope')
    : (lang === 'zh' ? '内部 (Internal)' : 'Confidential');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border select-none ${
        isPublic
          ? 'bg-[#F5F6E5] text-[#2B3150] border-brand-yellow/50 dark:bg-brand-indigo dark:text-brand-yellow'
          : 'bg-brand-coral/10 text-brand-coral border-brand-coral/20'
      }`}
    >
      {isPublic ? (
        <Eye className="w-3 h-3 text-brand-coral" />
      ) : (
        <Shield className="w-3 h-3 text-brand-coral" />
      )}
      <span>{label}</span>
    </span>
  );
};
