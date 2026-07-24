import { Routes, Route } from 'react-router-dom';
import ScrollToTop from '../components/ScrollToTop';
import AppLayout from '../layouts/AppLayout';
import ProtectedRoute from '../components/ProtectedRoute';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import SearchPage from '../pages/SearchPage';
import AIQueryPage from '../pages/AIQueryPage';
import KnowledgeGraphPage from '../pages/KnowledgeGraphPage';
import PaperLibraryPage from '../pages/PaperLibraryPage';
import DataItemPage from '../pages/DataItemPage';
import TemplateLibraryPage from '../pages/TemplateLibraryPage';
import BusinessValuePage from '../pages/BusinessValuePage';
import EntryDetailPage from '../pages/EntryDetailPage';
import SystemVersionPage from '../pages/SystemVersionPage';
import AdminImportPage from '../pages/AdminImportPage';
import AdminContentManagePage from '../pages/AdminContentManagePage';
import LiteratureSearchPage from '../pages/LiteratureSearchPage';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<AppLayout />}>
        {/* Public & home routes */}
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="literature" element={<LiteratureSearchPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
        <Route path="graph" element={<KnowledgeGraphPage />} />
        <Route path="entry/:id" element={<EntryDetailPage />} />
        <Route path="system-version" element={<SystemVersionPage />} />

        {/* Auth-protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="papers" element={<PaperLibraryPage />} />
          <Route path="data-items" element={<DataItemPage />} />
          <Route path="templates" element={<TemplateLibraryPage />} />
          <Route path="business-value" element={<BusinessValuePage />} />
          <Route path="admin/import" element={<AdminImportPage />} />
          <Route path="admin/manage" element={<AdminContentManagePage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </>
  );
}
