import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Lock, ArrowRight } from 'lucide-react';

interface UnauthorizedProps {
  requiredRole?: string;
}

export default function Unauthorized({ requiredRole = 'internal' }: UnauthorizedProps) {
  const navigate = useNavigate();

  return (
    <div
      className="max-w-md mx-auto my-12 bg-white border border-red-150 rounded-xl p-6 text-center shadow-md flex flex-col items-center space-y-4"
      id="unauthorized-container"
    >
      <div className="bg-red-50 p-4 rounded-full border border-red-100 animate-bounce">
        <Lock className="w-8 h-8 text-[#DB5F5B]" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-sm font-bold text-gray-800 flex items-center justify-center space-x-1.5 uppercase tracking-wide">
          <ShieldAlert className="w-4 h-4 text-[#DB5F5B]" />
          <span>访问权限受限 (Internal Directory Only)</span>
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
          您当前作为 **未登录访客 (Guest)** 访问。本条目包含微观纪元内部专有的
          Sandbox 项目计算细节、原始白皮书及商业敏感数据。
        </p>
      </div>

      <div className="bg-gray-50 p-3 rounded-lg text-left text-[11px] text-gray-500 w-full border border-gray-150 space-y-1">
        <div className="font-bold text-[#2B3150] mb-1">🔐 访问规则说明：</div>
        <div>• <strong>公开内容 (Public)</strong>：任何人均可免密查阅。</div>
        <div>• <strong>内部档案 (Internal)</strong>：仅供登录后的微观纪元员工或研究员查阅。</div>
      </div>

      <button
        onClick={() => navigate('/login')}
        className="w-full py-2 bg-[#2B3150] hover:bg-[#2B3150]/95 text-white font-bold rounded-lg text-xs transition-all flex items-center justify-center space-x-1.5"
      >
        <span>前往企业登录控制台</span>
        <ArrowRight className="w-4 h-4 text-[#F2D760]" />
      </button>
    </div>
  );
}
