import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Search, LogIn, LogOut, User, FolderKanban, Network, Layout, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function TopNav() {
  const { isLoggedIn, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="bg-[#2B3150] text-white border-b border-[#DB5F5B]/20 sticky top-0 z-50 select-none shadow-sm" id="global-header">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left Side Logo & Branding */}
        <div className="flex items-center space-x-3.5">
          <div
            onClick={() => navigate('/')}
            className="flex items-center space-x-2 cursor-pointer group"
          >
            {/* Custom SVG logo representing a quantum-orbit node lattice */}
            <div className="bg-[#DB5F5B] p-1.5 rounded-lg border border-[#F2D760]/30 group-hover:rotate-12 transition-transform">
              <svg className="w-5 h-5 text-white fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" />
              </svg>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-sm tracking-wider text-[#F2D760] font-sans">
                  Miqro Wiki
                </span>
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[8px] font-mono px-1 rounded font-bold select-none uppercase scale-90">
                  v0.1.0-alpha
                </span>
              </div>
              <span className="text-[9px] text-[#F5F6E5] font-mono tracking-tight font-bold -mt-0.5 uppercase">
                微观纪元 AI Wiki
              </span>
            </div>
          </div>

          {/* Navigation Items (Middle Rail) */}
          <nav className="hidden md:flex items-center space-x-1.5 text-xs">
            <button
              onClick={() => navigate('/')}
              className={`px-2.5 py-1 rounded transition-all font-bold ${
                isActive('/')
                  ? 'bg-white/10 text-[#F2D760]'
                  : 'text-gray-200 hover:text-white hover:bg-white/5'
              }`}
            >
              首页
            </button>
            <button
              onClick={() => navigate('/search')}
              className={`px-2.5 py-1 rounded transition-all font-bold flex items-center space-x-1 ${
                isActive('/search')
                  ? 'bg-white/10 text-[#F2D760]'
                  : 'text-gray-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>知识索引</span>
            </button>
            <button
              onClick={() => navigate('/ai-query')}
              className={`px-2.5 py-1 rounded transition-all font-bold flex items-center space-x-1 ${
                isActive('/ai-query')
                  ? 'bg-white/10 text-[#F2D760]'
                  : 'text-gray-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F2D760] animate-pulse" />
              <span>AI 查询问答</span>
            </button>
            <button
              onClick={() => navigate('/graph')}
              className={`px-2.5 py-1 rounded transition-all font-bold flex items-center space-x-1 ${
                isActive('/graph')
                  ? 'bg-white/10 text-[#F2D760]'
                  : 'text-gray-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>知识图谱</span>
            </button>
            <button
              onClick={() => navigate('/system-version')}
              className={`px-2.5 py-1 rounded transition-all font-bold ${
                isActive('/system-version')
                  ? 'bg-white/10 text-[#F2D760]'
                  : 'text-gray-200 hover:text-white hover:bg-white/5'
              }`}
            >
              系统版本
            </button>

            {isLoggedIn && (
              <>
                <button
                  onClick={() => navigate('/templates')}
                  className={`px-2.5 py-1 rounded transition-all font-bold ${
                    isActive('/templates')
                      ? 'bg-white/10 text-[#F2D760]'
                      : 'text-gray-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  标准文件库
                </button>
                <button
                  onClick={() => navigate('/admin/import')}
                  className={`px-2.5 py-1 rounded transition-all font-bold flex items-center space-x-1 ${
                    isActive('/admin')
                      ? 'bg-white/10 text-[#F2D760]'
                      : 'text-gray-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>管理维护端</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Right Side Auth Status & Quick Action */}
        <div className="flex items-center space-x-2.5 text-xs">
          {/* Natural Language Prompt Shortcut Button */}
          <button
            onClick={() => navigate('/ai-query')}
            className="hidden lg:flex items-center space-x-1 bg-[#DB5F5B] hover:bg-[#DB5F5B]/90 text-white font-extrabold px-3 py-1.5 rounded-md transition-all shadow-md text-xs border border-[#F2D760]/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F2D760] animate-bounce" />
            <span>问答 MiQi</span>
          </button>

          {isLoggedIn && user ? (
            <div className="relative">
              {/* User Profiler button */}
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/15 px-2.5 py-1.5 rounded-lg border border-[#F2D760]/10 transition-all cursor-pointer"
                id="top-nav-profile-btn"
              >
                <div className="bg-[#F2D760] text-[#2B3150] w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]">
                  AD
                </div>
                <span className="font-semibold text-gray-100 hidden sm:inline">
                  {user.displayName}
                </span>
              </button>

              {/* Profile Dropdown Drawer */}
              {showProfile && (
                <div
                  className="absolute right-0 mt-2 w-48 bg-white text-[#333333] rounded-lg border border-gray-200 shadow-xl py-2 z-50 text-xs"
                  onMouseLeave={() => setShowProfile(false)}
                  id="top-nav-profile-dropdown"
                >
                  <div className="px-3.5 py-2 border-b border-gray-100">
                    <span className="font-bold block text-gray-800">{user.displayName}</span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">
                      角色: 研发组长 / 管理员
                    </span>
                    <span className="text-[10px] text-gray-500 block">
                      部门: {user.department}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setShowProfile(false);
                      navigate('/admin/import');
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    MarkItDown 上传管理
                  </button>

                  <button
                    onClick={() => {
                      setShowProfile(false);
                      navigate('/admin/manage');
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    知识库内容管理
                  </button>

                  <button
                    onClick={() => {
                      logout();
                      setShowProfile(false);
                      navigate('/');
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-red-50 text-red-600 font-semibold border-t border-gray-100 transition-colors flex items-center space-x-1"
                    id="top-nav-logout-btn"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>退出登录</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center space-x-1 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg border border-gray-300/30 font-bold transition-all"
              id="top-nav-login-btn"
            >
              <LogIn className="w-3.5 h-3.5 text-[#F2D760]" />
              <span>内部登录</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
