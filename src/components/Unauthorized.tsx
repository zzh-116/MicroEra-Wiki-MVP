import React from 'react';
import { Lock, ArrowRight, Home } from 'lucide-react';

interface UnauthorizedProps {
  onGoToLogin: () => void;
  onGoToHome: () => void;
}

export const Unauthorized: React.FC<UnauthorizedProps> = ({ onGoToLogin, onGoToHome }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto" id="unauthorized-container">
      <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center border border-amber-200 text-amber-600 mb-6 animate-pulse">
        <Lock className="w-8 h-8" />
      </div>
      
      <h2 className="text-xl font-semibold text-gray-900 mb-2 font-sans tracking-tight">
        该内容仅内部人员可见
      </h2>
      <p className="text-sm text-gray-500 mb-8 max-w-sm leading-relaxed">
        您当前处于未登录状态（访客/客户视图），此条目被标记为内部机密 (internal)。请使用内部员工账号登录后继续查看。
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
        <button
          onClick={onGoToLogin}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
          id="btn-unauthorized-login"
        >
          立即登录
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onGoToHome}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm border border-gray-300 transition-colors shadow-xs"
          id="btn-unauthorized-home"
        >
          <Home className="w-4 h-4" />
          返回公开首页
        </button>
      </div>
    </div>
  );
};
