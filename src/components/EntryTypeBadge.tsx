import { 
  FileText, BookOpen, Key, Database, Lightbulb, 
  Settings, FolderKanban, Briefcase, FileSignature, HelpCircle 
} from 'lucide-react';
import { EntryType } from '../types/wiki';

interface EntryTypeBadgeProps {
  type: EntryType;
}

export default function EntryTypeBadge({ type }: EntryTypeBadgeProps) {
  let label = '知识条目';
  let icon = <FileText className="w-3.5 h-3.5 mr-1" />;
  let colorClass = 'bg-gray-100 text-gray-700 border-gray-200';

  switch (type) {
    case 'project':
      label = 'Sandbox 项目';
      icon = <FolderKanban className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-blue-50 text-blue-700 border-blue-100';
      break;
    case 'paper':
      label = '论文文献';
      icon = <BookOpen className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
      break;
    case 'patent':
      label = '发明专利';
      icon = <Key className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-yellow-50 text-yellow-700 border-yellow-200';
      break;
    case 'data_item':
      label = '数据结构';
      icon = <Database className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-purple-50 text-purple-700 border-purple-100';
      break;
    case 'concept':
      label = '技术优势';
      icon = <Lightbulb className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-orange-50 text-orange-700 border-orange-100';
      break;
    case 'template':
      label = '标准模板';
      icon = <FileSignature className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-teal-50 text-teal-700 border-teal-100';
      break;
    case 'business_value':
      label = '商业价值';
      icon = <Briefcase className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-rose-50 text-rose-700 border-rose-100';
      break;
    case 'service':
      label = '知识服务';
      icon = <Settings className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-[#F5F6E5] text-[#2B3150] border-[#DB5F5B]/30';
      break;
    default:
      label = '一般概念';
      icon = <HelpCircle className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-gray-100 text-gray-700 border-gray-200';
  }

  return (
    <span
      id={`entry-type-badge-${type}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
