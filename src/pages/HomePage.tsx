import { useAuth } from '../context/AuthContext';
import PublicHomePage from './PublicHomePage';
import InternalHomePage from './InternalHomePage';

export default function HomePage() {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-500 font-bold animate-pulse">
        正在加载 MicroEra Wiki...
      </div>
    )}

  return isLoggedIn ? <InternalHomePage /> : <PublicHomePage />}
