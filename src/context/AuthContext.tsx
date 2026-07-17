import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types/wiki';
import { authApi } from '../api/authApi';
import { storage } from '../lib/storage';

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => storage.getUser<User>());
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    authApi.getMe().then((u) => {
      if (u) {
        setUser(u);
        storage.setUser(u);
      } else {
        setUser(null);
        storage.removeUser();
      }
      setLoading(false);
    });
  }, []);

  const isLoggedIn = !!user;

  const login = async (username: string, password: string) => {
    // Also accept the mock credentials for offline/dev fallback
    if (username === 'admin' && password === 'admin123') {
      // Try real backend first
      const result = await authApi.login(username, password);
      if (result.success && result.user) {
        setUser(result.user);
        return { success: true };
      }
      // Fallback: mock login
      const fallbackUser: User = {
        id: 'u-1',
        username: 'admin',
        displayName: '管理员 (Admin)',
        role: 'administrator',
        department: '平台研发部',
        isLoggedIn: true,
      };
      setUser(fallbackUser);
      storage.setUser(fallbackUser);
      return { success: true };
    }
    return { success: false, error: '用户名或密码错误。演示账号：admin / admin123' };
  };

  const logout = () => {
    setUser(null);
    storage.clearAll();
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
