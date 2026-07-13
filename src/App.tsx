import { AuthProvider } from './context/AuthContext';
import AppRoutes from './router';

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
