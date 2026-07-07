import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AiProvider } from './context/AiContext';
import { AiChatWidget } from './components/AiChatWidget';

import { LanguageThemeProvider, useLanguageTheme } from './context/LanguageThemeContext';

// Pages
import { PublicHome } from './pages/PublicHome';
import { LoginPage } from './pages/LoginPage';
import { EntryListPage } from './pages/EntryListPage';
import { EntryDetailPage } from './pages/EntryDetailPage';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import { DataItemPage } from './pages/DataItemPage';
import { EntryEditorPage } from './pages/EntryEditorPage';
import { AdminMockPage } from './pages/AdminMockPage';

import { ShieldAlert, BookOpen, ExternalLink, HelpCircle } from 'lucide-react';

function AppContent() {
  const { isLoggedIn, loading } = useAuth();
  const { theme, lang, t } = useLanguageTheme();
  
  // Router States
  const [currentView, setCurrentView] = useState<string>('home');
  const [viewDetails, setViewDetails] = useState<any>(null);

  const handleNavigate = (view: string, details: any = null) => {
    setCurrentView(view);
    setViewDetails(details);
    // Smooth scroll to top on page switches
    window.scrollTo({ top: 0, behavior: 'instant' as any });
  };

  const renderActiveView = () => {
    switch (currentView) {
      case 'home':
        return <PublicHome onNavigate={handleNavigate} isLoggedIn={isLoggedIn} />;
      
      case 'login':
        return <LoginPage onNavigate={handleNavigate} />;
      
      case 'entries':
        return (
          <EntryListPage
            initialFilters={viewDetails}
            onNavigate={handleNavigate}
            isLoggedIn={isLoggedIn}
            key={JSON.stringify(viewDetails || {})} // Force re-render on navbar clicks to reset queries
          />
        );
      
      case 'detail':
        return (
          <EntryDetailPage
            id={viewDetails?.id || 1}
            onNavigate={handleNavigate}
            isLoggedIn={isLoggedIn}
          />
        );
      
      case 'assets':
        return <AssetLibraryPage onNavigate={handleNavigate} isLoggedIn={isLoggedIn} />;
      
      case 'data_items':
        return <DataItemPage onNavigate={handleNavigate} isLoggedIn={isLoggedIn} />;
      
      case 'editor':
        return (
          <EntryEditorPage
            editingId={viewDetails?.editingId}
            forceType={viewDetails?.forceType}
            onNavigate={handleNavigate}
            isLoggedIn={isLoggedIn}
            key={viewDetails?.editingId || 'new'}
          />
        );
      
      case 'mock_admin':
        return <AdminMockPage />;

      default:
        return (
          <div className="text-center py-20 bg-gray-50 border border-dashed rounded-xl max-w-sm mx-auto px-4">
            <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">页面不存在</h3>
            <p className="text-xs text-gray-500 mb-6">对应的微前端子应用视图主键未注册。</p>
            <button
              onClick={() => handleNavigate('home')}
              className="px-3.5 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold font-sans"
            >
              返回公开首页
            </button>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center space-y-4 bg-theme-bg text-theme-text font-sans">
        <div className="w-10 h-10 border-4 border-brand-indigo border-t-brand-yellow rounded-full animate-spin" />
        <span className="text-xs font-mono text-theme-muted font-semibold uppercase tracking-wider">
          Initializing Platform MVP Kernel...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col justify-between font-sans transition-colors duration-200">
      <div>
        {/* Core responsive top navbar */}
        <Navbar currentView={currentView} onNavigate={handleNavigate} />
        
        {/* Viewport Main Container */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          {renderActiveView()}
        </main>

        {/* AI Chat Widget (floating) */}
        <AiChatWidget />
      </div>

      {/* Corporate Footprint banner */}
      <footer className="bg-theme-card border-t border-theme-border py-8 select-none transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-theme-muted">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-indigo text-brand-yellow rounded-md flex items-center justify-center font-bold text-xs">
              W
            </div>
            <span className="font-semibold text-theme-text">{t('brandName')} {t('brandDesc')} (MVP Prototype)</span>
          </div>
          
          <div className="flex items-center gap-5 mt-1 sm:mt-0 font-sans text-theme-muted">
            <span>{lang === 'zh' ? '机密等级：内部资料 & 对客公开隔离' : 'Classification: Confidential & Guest Isolated'}</span>
            <span>{lang === 'zh' ? '更新纪' : 'Release'}: 2026-06-10 (UTC)</span>
            <span className="text-theme-border">|</span>
            <span className="text-theme-muted flex items-center gap-1 hover:text-theme-text cursor-pointer transition-colors duration-150">
              <span>{lang === 'zh' ? '架构文档' : 'Architecture Docs'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageThemeProvider>
      <AuthProvider>
        <AiProvider>
          <AppContent />
        </AiProvider>
      </AuthProvider>
    </LanguageThemeProvider>
  );
}
