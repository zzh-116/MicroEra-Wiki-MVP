import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import TopNav from '../components/TopNav';
import WikiSidebar from '../components/WikiSidebar';
import Footer from '../components/Footer';

export default function AppLayout() {
  const location = useLocation();

  // Scroll to top on route change (replaces old handleNavigate behavior)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // Sidebar visibility: same as old showSidebar logic
  const sidebarPaths = [
    '/search', '/ai-query', '/entry/', '/papers',
    '/data-items', '/templates', '/business-value'
  ];
  const showSidebar = sidebarPaths.some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen bg-[#F5F6E5]/20 flex flex-col font-sans text-[#333333]" id="app-shell-root">
      {/* Upper Navigation Rail */}
      <TopNav />

      {/* Main layout container */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-6">
        {showSidebar ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left standard wiki navigation rail */}
            <div className="lg:col-span-3 sticky top-18 hidden lg:block">
              <WikiSidebar />
            </div>

            {/* Middle Main Workspace section */}
            <div className="lg:col-span-9 animate-fade-in">
              <Outlet />
            </div>
          </div>
        ) : (
          /* Full width layout for home dashboards, logins, charts */
          <div className="max-w-7xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        )}
      </main>

      {/* Global Footer (GOV.UK Directory Style) */}
      <Footer />
    </div>
  );
}
