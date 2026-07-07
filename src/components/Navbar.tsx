import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { 
  BookOpen, 
  Home, 
  FolderLock, 
  Database, 
  PlusSquare, 
  Info, 
  LogIn, 
  LogOut,
  User,
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, details?: { editingId?: number }) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { isLoggedIn, user, logout } = useAuth();
  const { theme, toggleTheme, lang, setLang, t } = useLanguageTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    onNavigate('home');
  };

  const navItems = isLoggedIn
    ? [
        { id: 'home', label: lang === 'zh' ? '公开首页' : 'Home', icon: Home },
        { id: 'entries', label: lang === 'zh' ? '资产目录' : 'Asset Catalog', icon: BookOpen },
        { id: 'assets', label: lang === 'zh' ? '宣发素材库' : 'Asset Library', icon: FolderLock },
        { id: 'data_items', label: lang === 'zh' ? '数据对准' : 'R&D Data Spec', icon: Database },
        { id: 'editor', label: lang === 'zh' ? '发布条目' : 'Draft Entry', icon: PlusSquare },
        { id: 'mock_admin', label: lang === 'zh' ? '安全架构' : 'Admin Panel', icon: Info },
      ]
    : [
        { id: 'home', label: lang === 'zh' ? '公开首页' : 'Home', icon: Home },
        { id: 'entries_public', label: lang === 'zh' ? '公开内容' : 'Public Library', icon: BookOpen, viewOverride: 'entries', filter: { visibility: 'public' } },
        { id: 'tech_public', label: lang === 'zh' ? '技术优势' : 'Technical Edge', icon: ShieldCheck, viewOverride: 'entries', filter: { entry_type: 'tech' } },
        { id: 'product_public', label: lang === 'zh' ? '产品业务' : 'Brand Projects', icon: BookOpen, viewOverride: 'entries', filter: { entry_type: 'product' } },
        { id: 'patent_public', label: lang === 'zh' ? '专利成果' : 'IP & Patents', icon: Info, viewOverride: 'entries', filter: { entry_type: 'patent' } },
      ];

  const handleItemClick = (item: any) => {
    setMobileMenuOpen(false);
    if (item.viewOverride) {
      onNavigate(item.viewOverride, item.filter);
    } else {
      onNavigate(item.id);
    }
  };

  return (
    <nav className="bg-theme-card border-b border-theme-border sticky top-0 z-50 shadow-xs transition-colors duration-200" id="main-navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center">
            <button 
              onClick={() => onNavigate('home')} 
              className="flex items-center gap-2.5 hover:opacity-95 transition-opacity focus:outline-hidden cursor-pointer"
              id="nav-logo"
            >
              <div className="w-9 h-9 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-lg flex items-center justify-center font-extrabold text-lg select-none shadow-sm transition-colors duration-200">
                W
              </div>
              <div className="text-left">
                <span className="font-bold text-theme-text leading-none block font-sans tracking-tight text-sm sm:text-base">
                  {t('brandName')}
                </span>
                <span className="text-[9px] text-theme-muted font-mono tracking-wide uppercase block">
                  {t('brandDesc')}
                </span>
              </div>
            </button>

            {/* Desktop Navigation */}
            <div className="hidden lg:ml-8 lg:flex lg:space-x-1">
              {navItems.map((item) => {
                const isActive = item.viewOverride 
                  ? currentView === item.viewOverride
                  : currentView === item.id;
                
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'bg-brand-indigo text-brand-yellow shadow-xs'
                        : 'text-theme-muted hover:bg-theme-bg hover:text-theme-text'
                    }`}
                    id={`nav-item-${item.id}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right hand Side Actions (Theme, Lang, login/logout) */}
          <div className="hidden lg:flex lg:items-center lg:gap-3">
            {/* Dynamic selectors on desktop */}
            <div className="flex items-center gap-1.5 border-r border-theme-border pr-3">
              {/* Language Switcher Button */}
              <button
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="w-8 h-8 rounded-lg bg-theme-bg hover:bg-brand-indigo hover:text-brand-yellow text-theme-text text-xs font-bold font-mono transition-all flex items-center justify-center cursor-pointer border border-theme-border"
                title={lang === 'zh' ? 'English Version' : '中文版'}
              >
                {lang === 'zh' ? 'EN' : '中'}
              </button>

              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-lg bg-theme-bg hover:bg-brand-indigo hover:text-brand-yellow text-theme-text transition-all flex items-center justify-center cursor-pointer border border-theme-border"
                title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              >
                {theme === 'light' ? <Moon className="w-4 h-4 text-brand-indigo" /> : <Sun className="w-4 h-4 text-brand-yellow" />}
              </button>
            </div>

            {isLoggedIn && user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-theme-bg border border-theme-border rounded-full select-none text-xs text-theme-text">
                  <User className="w-3.5 h-3.5 text-brand-indigo dark:text-brand-yellow" />
                  <span>
                    {lang === 'zh' ? '账号' : 'ID'}: <strong className="font-semibold">{user.display_name}</strong>
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-brand-coral/30 hover:bg-brand-coral hover:text-white rounded-lg text-xs text-brand-coral font-bold transition-all cursor-pointer"
                  id="nav-btn-logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t('navLogout')}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('login')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer hover:opacity-90"
                id="nav-btn-login"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t('navLogin')}</span>
              </button>
            )}
          </div>

          {/* Quick theme, lang toggles and mobile hamburger menu */}
          <div className="flex items-center gap-1.5 lg:hidden">
            {/* Quick Language Toggle */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="w-7 h-7 rounded-md bg-theme-bg border border-theme-border text-[10px] font-extrabold font-mono transition-colors text-theme-text flex items-center justify-center"
            >
              {lang === 'zh' ? 'EN' : '中'}
            </button>

            {/* Quick Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-7 h-7 rounded-md bg-theme-bg border border-theme-border transition-colors text-theme-text flex items-center justify-center"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5 text-brand-indigo" /> : <Sun className="w-3.5 h-3.5 text-brand-yellow" />}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-1.5 rounded-md text-theme-muted hover:text-theme-text hover:bg-theme-bg"
              aria-expanded="false"
              id="nav-mobile-hamburger"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-theme-card border-b border-theme-border px-4 pt-2 pb-4 space-y-1 shadow-xs transition-colors duration-200" id="mobile-menu">
          {navItems.map((item) => {
            const isActive = item.viewOverride 
              ? currentView === item.viewOverride
              : currentView === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`flex items-center gap-3 w-full px-3 py-2 text-sm font-semibold rounded-lg ${
                  isActive
                    ? 'bg-brand-indigo text-brand-yellow font-bold'
                    : 'text-theme-muted hover:bg-theme-bg hover:text-theme-text'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
          
          <div className="pt-3 border-t border-theme-border mt-2 text-xs">
            {isLoggedIn && user ? (
              <div className="space-y-2">
                <div className="px-3 py-1.5 bg-theme-bg rounded-lg text-theme-text flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-brand-indigo dark:text-brand-yellow" />
                  <span>
                    {lang === 'zh' ? '当前用户' : 'User'}: <strong>{user.display_name}</strong>
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-brand-coral hover:bg-brand-coral/10 rounded-lg text-left font-bold transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('navLogout')}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate('login');
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo font-bold rounded-lg transition-all"
              >
                <LogIn className="w-4 h-4" />
                <span>{t('navLogin')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
