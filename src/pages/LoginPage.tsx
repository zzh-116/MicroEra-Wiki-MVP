import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, User, Lock, AlertCircle, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(username, password);
      setLoading(false);
      if (res.success) {
        const from = (location.state as any)?.from?.pathname || '/';
        navigate(from, { replace: true });
      } else {
        setError(res.error || '登录失败');
      }
    } catch {
      setLoading(false);
      setError('登录失败，请重试');
    }
  };

  const handleQuickFill = () => {
    setUsername('admin');
    setPassword('admin123');
    setError(null);
  };

  return (
    <div className="max-w-md mx-auto my-14 bg-white border border-gray-200 rounded-2xl shadow-lg p-6 space-y-5 select-none" id="login-screen-panel">
      {/* Brand Header */}
      <div className="text-center space-y-1">
        <div className="bg-[#2B3150] p-3 rounded-full inline-block border-2 border-[#F2D760]/30 shadow-md">
          <ShieldCheck className="w-8 h-8 text-[#F2D760]" />
        </div>
        <h2 className="text-base font-extrabold text-[#2B3150] uppercase tracking-wide">
          微观纪元 Wiki 内部登录
        </h2>
        <p className="text-[10px] text-gray-400">
          请输入您的平台研发人员账号，获取 Sandbox 项目过程追溯权限
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-[#DB5F5B] text-xs p-3 rounded-lg border border-red-100 flex items-start space-x-1.5 animate-pulse">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-1">
            企业工号 / 用户名 (Username)：
          </label>
          <div className="relative">
            <input
              type="text"
              required
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B]/30 focus:border-[#DB5F5B] text-xs font-sans transition-all"
              placeholder="请输入企业工号..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              id="login-username-input"
            />
            <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide">
              登录密码 (Password)：
            </label>
            <button
              type="button"
              onClick={handleQuickFill}
              className="text-[9px] text-[#DB5F5B] hover:underline font-bold"
            >
              一键填入演示账号
            </button>
          </div>
          <div className="relative">
            <input
              type="password"
              required
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B]/30 focus:border-[#DB5F5B] text-xs font-sans transition-all"
              placeholder="请输入安全密码..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              id="login-password-input"
            />
            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#2B3150] hover:bg-[#2B3150]/95 text-white font-bold rounded-lg text-xs transition-all flex items-center justify-center"
            id="login-submit-btn"
          >
            {loading ? (
              <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <span>安全验证登录</span>
            )}
          </button>
        </div>
      </form>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-[10px] text-gray-400">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回访客大厅</span>
        </button>

        <span>演示账号密码：admin / admin123</span>
      </div>
    </div>
  );
}
