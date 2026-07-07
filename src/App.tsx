import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import TopNav from './components/TopNav';
import WikiSidebar from './components/WikiSidebar';
import PublicHomePage from './pages/PublicHomePage';
import InternalHomePage from './pages/InternalHomePage';
import SearchPage from './pages/SearchPage';
import AIQueryPage from './pages/AIQueryPage';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage';
import PaperLibraryPage from './pages/PaperLibraryPage';
import DataItemPage from './pages/DataItemPage';
import TemplateLibraryPage from './pages/TemplateLibraryPage';
import BusinessValuePage from './pages/BusinessValuePage';
import KnowledgeEntryPage from './pages/KnowledgeEntryPage';
import SandboxProjectPage from './pages/SandboxProjectPage';
import AdminImportPage from './pages/AdminImportPage';
import AdminContentManagePage from './pages/AdminContentManagePage';
import SystemVersionPage from './pages/SystemVersionPage';
import LoginPage from './pages/LoginPage';
import Footer from './components/Footer';
import { Sparkles, Library, FileSignature, ShieldAlert, Cpu } from 'lucide-react';

function AppShell() {
  const { isLoggedIn, login, logout } = useAuth();
  const [currentView, setCurrentView] = useState<string>('public-home');
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');

  // Handle default redirect on authentication change
  useEffect(() => {
    if (isLoggedIn) {
      if (currentView === 'public-home' || currentView === 'login') {
        setCurrentView('internal-home');
      }
    } else {
      if (currentView === 'internal-home' || currentView === 'admin-import' || currentView === 'admin-manage') {
        setCurrentView('public-home');
      }
    }
  }, [isLoggedIn]);

  const handleNavigate = (view: string, id?: string) => {
    if (id) {
      setSelectedEntryId(id);
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Determine whether to show the left WikiSpace tree sidebar
  const showSidebar = [
    'search', 'ai-query', 'entry-detail', 'papers', 
    'data-items', 'templates', 'business-value'
  ].includes(currentView);

  const renderActiveView = () => {
    switch (currentView) {
      case 'public-home':
        return <PublicHomePage onNavigate={handleNavigate} />;
      
      case 'internal-home':
        return <InternalHomePage onNavigate={handleNavigate} />;
      
      case 'search':
        return <SearchPage onNavigate={handleNavigate} />;
      
      case 'ai-query':
        return <AIQueryPage onNavigate={handleNavigate} />;
      
      case 'graph-view':
        return <KnowledgeGraphPage onNavigate={handleNavigate} />;
      
      case 'papers':
        return <PaperLibraryPage onNavigate={handleNavigate} />;
      
      case 'data-items':
        return <DataItemPage onNavigate={handleNavigate} />;
      
      case 'templates':
        return <TemplateLibraryPage onNavigate={handleNavigate} />;
      
      case 'business-value':
        return <BusinessValuePage onNavigate={handleNavigate} />;

      case 'entry-detail':
        // If it's the core Sandbox project, route to SandboxProjectPage for maximum rich visual details!
        if (selectedEntryId === 'e-stabilizer-project') {
          return <SandboxProjectPage entryId={selectedEntryId} onNavigate={handleNavigate} />;
        }
        return <KnowledgeEntryPage entryId={selectedEntryId} onNavigate={handleNavigate} />;
      
      case 'admin-import':
        return <AdminImportPage onNavigate={handleNavigate} />;
      
      case 'admin-manage':
        return <AdminContentManagePage onNavigate={handleNavigate} />;

      case 'system-version':
        return <SystemVersionPage onNavigate={handleNavigate} />;
      
      case 'login':
        return (
          <LoginPage
            onSuccess={() => handleNavigate('internal-home')}
            onBack={() => handleNavigate('public-home')}
          />
        );
      
      default:
        return <PublicHomePage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6E5]/20 flex flex-col font-sans text-[#333333]" id="app-shell-root">
      {/* Upper Navigation Rail */}
      <TopNav currentView={currentView} onNavigate={handleNavigate} />

      {/* Main layout container */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-6">
        {showSidebar ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left standard wiki navigation rail */}
            <div className="lg:col-span-3 sticky top-18 hidden lg:block">
              <WikiSidebar
                currentEntryId={currentView === 'entry-detail' ? selectedEntryId : undefined}
                onNavigate={handleNavigate}
                isLoggedIn={isLoggedIn}
              />
            </div>

            {/* Middle Main Workspace section */}
            <div className="lg:col-span-9 animate-fade-in">
              {renderActiveView()}
            </div>
          </div>
        ) : (
          /* Full width layout for home dashboards, logins, charts */
          <div className="max-w-7xl mx-auto animate-fade-in">
            {renderActiveView()}
          </div>
        )}
      </main>

      {/* Global Footer (GOV.UK Directory Style) */}
      <Footer onNavigate={handleNavigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
