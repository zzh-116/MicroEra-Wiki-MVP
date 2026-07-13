import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto my-20 text-center space-y-6 select-none">
      <div className="bg-gray-100 p-6 rounded-full inline-block">
        <FileQuestion className="w-16 h-16 text-gray-400" />
      </div>
      <h1 className="text-2xl font-extrabold text-[#2B3150]">404 — 页面未找到</h1>
      <p className="text-sm text-gray-500">
        您请求的页面不存在或已被移除。请检查 URL 是否正确。
      </p>
      <Link
        to="/"
        className="inline-block px-6 py-2.5 bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold text-xs rounded-lg transition-all"
      >
        返回首页
      </Link>
    </div>
  )}
