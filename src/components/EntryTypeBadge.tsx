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
    case 'sandbox_project':
      label = 'Sandbox项目';
      icon = <FolderKanban className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-blue-50 text-blue-700 border-blue-100';
      break;
    case 'academic_paper':
      label = '学术论文';
      icon = <BookOpen className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
      break;
    case 'patent':
      label = '专利成果';
      icon = <Key className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-yellow-50 text-yellow-700 border-yellow-200';
      break;
    case 'data_standard':
      label = '数据标准';
      icon = <Database className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-purple-50 text-purple-700 border-purple-100';
      break;
    case 'tech_doc':
      label = '技术文档';
      icon = <Lightbulb className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-orange-50 text-orange-700 border-orange-100';
      break;
    case 'template':
      label = '模板规范';
      icon = <FileSignature className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-teal-50 text-teal-700 border-teal-100';
      break;
    case 'business_material':
      label = '商业资料';
      icon = <Briefcase className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-rose-50 text-rose-700 border-rose-100';
      break;
      case 'handwritten_note':
      label = '手写笔记';
      icon = <HelpCircle className="w-3.5 h-3.5 mr-1" />;
      colorClass = 'bg-gray-100 text-gray-700 border-gray-200';
      break;
    default:
      label = '手写笔记';
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
