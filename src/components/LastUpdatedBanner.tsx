import { Calendar } from 'lucide-react';

interface LastUpdatedBannerProps {
  date: string;
}

export default function LastUpdatedBanner({ date }: LastUpdatedBannerProps) {
  return (
    <div className="flex items-center space-x-1.5 text-xs text-[#DB5F5B] font-bold tracking-wider uppercase mb-1.5" id="last-updated-banner">
      <Calendar className="w-3.5 h-3.5 text-[#DB5F5B]" />
      <span>最新更新时间：{date}</span>
    </div>
  );
}
