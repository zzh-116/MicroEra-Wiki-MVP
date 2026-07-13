import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Home, ChevronRight } from 'lucide-react';
import KnowledgeEntryPage from './KnowledgeEntryPage';
import SandboxProjectPage from './SandboxProjectPage';

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)} else {
      navigate('/papers')}
  };

  if (!id) {
    return (
      <div className="py-16 text-center text-gray-500 font-bold">
        未指定条目 ID
      </div>
    )}

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <button
        onClick={handleBack}
        className="inline-flex items-center space-x-1.5 text-sm font-bold text-gray-600 hover:text-[#DB5F5B] transition-colors select-none group"
        title="返回上一页"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        <span>返回</span>
      </button>

      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-1 text-xs text-gray-500 select-none">
        <Link to="/" className="flex items-center hover:text-[#DB5F5B] transition-colors">
          <Home className="w-3 h-3 mr-1" />
          <span>首页</span>
        </Link>
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <Link to="/papers" className="hover:text-[#DB5F5B] transition-colors truncate max-w-[150px]">
          知识库
        </Link>
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <span className="font-semibold text-gray-700 truncate max-w-[200px]">
          条目详情
        </span>
      </nav>

      {/* Detail Page Content */}
      {id === 'e-stabilizer-project' ? (
        <SandboxProjectPage entryId={id} />
      ) : (
        <KnowledgeEntryPage entryId={id} />
      )}
    </div>
  )}
