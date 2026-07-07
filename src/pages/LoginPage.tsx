import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { ShieldCheck, Server, Key, AlertTriangle, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const { lang, t } = useLanguageTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg(lang === 'zh' ? '请填写完整的账号与密码。' : 'Please provide both username and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const success = await login(username.trim(), password.trim());
      if (success) {
        onNavigate('entries'); // Redirect to internal entry list page
      } else {
        setErrorMsg(lang === 'zh' ? '账号或密码不正确，请重新检查。' : 'Incorrect username or password.');
      }
    } catch (e) {
      setErrorMsg(lang === 'zh' ? '登录失败，发生异常。' : 'Authentication failed with an unexpected error.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async () => {
    setUsername('admin');
    setPassword('admin123');
    setErrorMsg(null);
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 border border-theme-border rounded-2xl overflow-hidden bg-theme-card shadow-xs transition-colors" id="login-container">
      
      {/* Visual Banner Area - Left */}
      <div className="md:col-span-5 bg-brand-indigo p-8 sm:p-10 text-white flex flex-col justify-between relative overflow-hidden h-64 md:h-auto select-none">
        <div className="absolute inset-x-0 bottom-0 top-0 opacity-10 bg-[radial-gradient(#F2D760_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="relative z-10 space-y-3">
          <span className="text-[10px] bg-brand-yellow/10 border border-brand-yellow/20 px-2 py-0.5 rounded-md font-mono text-brand-yellow uppercase tracking-widest font-bold">
            Internal Secure Auth
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight text-white leading-tight">
            {lang === 'zh' ? '企业机密访问认证' : 'Corporate Secure SSO Gate'}
          </h2>
          <p className="text-xs text-gray-300 leading-relaxed max-w-[240px]">
            {lang === 'zh' 
              ? '请使用您的统一 LDAP 系统域账号，或由管理员分发的特权证书进行后台系统登录。' 
              : 'Sign in utilizing your official corporate domain credentials or sandbox tickets.'}
          </p>
        </div>

        <div className="relative z-10 space-y-4 pt-6 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4.5 h-4.5 text-brand-yellow flex-shrink-0" />
            <span>{lang === 'zh' ? '开启 public + internal 条目透出' : 'Authorize public + internal catalogs'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="w-4.5 h-4.5 text-brand-coral flex-shrink-0" />
            <span>{lang === 'zh' ? '解锁实验数据库结构与 Schema 记录' : 'Unlock direct sandbox specs and edits'}</span>
          </div>
        </div>
      </div>

      {/* Form Area - Right */}
      <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-center bg-theme-card" id="login-form-area">
        <h2 className="text-xl font-extrabold text-theme-text font-sans tracking-tight mb-2">
          {t('loginPageTitle')}
        </h2>
        <p className="text-xs sm:text-sm text-theme-muted mb-8 font-sans">
          {t('loginPageSubtitle')}
        </p>

        {errorMsg && (
          <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-brand-coral/10 border border-brand-coral/20 text-brand-coral rounded-lg text-xs" id="login-error-alert">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-extrabold">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4.5">
          <div>
            <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider mb-1.5" htmlFor="login-username">
              {t('lblUsername')}
            </label>
            <input
              type="text"
              id="login-username"
              className="block w-full px-3.5 py-2.5 bg-theme-bg hover:bg-theme-bg/85 border border-theme-border focus:bg-theme-bg focus:border-brand-yellow rounded-lg text-xs sm:text-sm text-theme-text font-semibold focus:outline-hidden transition-all duration-150"
              placeholder={lang === 'zh' ? "请输入 LDAP 登录名 (例如 admin)" : "Username (e.g., admin)"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[10px] font-bold text-theme-muted uppercase tracking-wider" htmlFor="login-password">
                {t('lblPassword')}
              </label>
            </div>
            <input
              type="password"
              id="login-password"
              className="block w-full px-3.5 py-2.5 bg-theme-bg hover:bg-theme-bg/85 border border-theme-border focus:bg-theme-bg focus:border-brand-yellow rounded-lg text-xs sm:text-sm text-theme-text font-semibold focus:outline-hidden transition-all duration-150"
              placeholder={lang === 'zh' ? "请输入密码（演示为 admin123）" : "Password (e.g., admin123)"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-indigo dark:bg-brand-yellow text-brand-yellow dark:text-brand-indigo font-extrabold rounded-lg text-xs sm:text-sm transition-all shadow-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
              id="login-btn-submit"
            >
              <span>{loading ? (lang === 'zh' ? '正在验证数字签名中...' : 'Verifying signature...') : t('btnLoginSubmit')}</span>
              {!loading && <ArrowRight className="w-4 h-4 text-brand-coral" />}
            </button>
          </div>
        </form>

        {/* Demo Quickfill Hint block */}
        <div className="mt-8 pt-6 border-t border-theme-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-2 max-w-[70%]">
            <Key className="w-4 h-4 text-theme-muted mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-theme-muted leading-relaxed font-sans">
              <span className="font-extrabold tracking-tight block mb-0.5">{t('tipAccountDetails')}</span>
              {t('tipTester')}
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleQuickLogin}
            className="flex-shrink-0 self-start sm:self-center px-3 py-1.5 border border-theme-border hover:border-brand-yellow text-[10px] font-extrabold text-theme-text rounded-lg bg-theme-bg hover:bg-brand-indigo hover:text-brand-yellow transition-all cursor-pointer"
            id="login-btn-quickfill"
          >
            {lang === 'zh' ? '一键配齐测试账号' : 'Quick Fill admin'}
          </button>
        </div>
      </div>
    </div>
  );
};
