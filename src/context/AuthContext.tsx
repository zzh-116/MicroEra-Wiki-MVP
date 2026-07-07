import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthState } from '../types/user';
import { authApi } from '../api/authApi';

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    user: null,
    token: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage and verify with server
    const restoreSession = async () => {
      try {
        const saved = localStorage.getItem('wiki_auth');
        if (saved) {
          const parsed = JSON.parse(saved) as AuthState;
          if (parsed.token) {
            // Verify token is still valid with server
            const { isLoggedIn, user } = await authApi.getMe();
            if (isLoggedIn && user) {
              setAuthState({ isLoggedIn: true, user, token: parsed.token });
              setLoading(false);
              return;
            }
          }
        }
      } catch {
        // Token invalid or server unreachable — clear state
      }
      localStorage.removeItem('wiki_auth');
      setLoading(false);
    };
    restoreSession();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const { token, user } = await authApi.login(username, password);
      const state: AuthState = { isLoggedIn: true, user, token };
      setAuthState(state);
      localStorage.setItem('wiki_auth', JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    localStorage.removeItem('wiki_auth');
    setAuthState({ isLoggedIn: false, user: null, token: null });
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: authState.isLoggedIn,
        user: authState.user,
        token: authState.token,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
