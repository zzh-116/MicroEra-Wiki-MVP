import { User } from '../types/wiki';
import { post, get } from './client';
import { setToken } from './client';
import { storage } from '../lib/storage';

export const authApi = {
  async login(
    username: string,
    password: string,
  ): Promise<{ success: boolean; user: User; error?: string }> {
    try {
      const data = await post<{
        token: string;
        user: { id: number; username: string; display_name: string; created_at: string };
      }>('/auth/login', { username, password });

      setToken(data.token);

      const user: User = {
        id: String(data.user.id),
        username: data.user.username,
        displayName: data.user.display_name,
        role: 'administrator',
        department: '',
        isLoggedIn: true,
      };
      storage.setUser(user);
      return { success: true, user };
    } catch (err: any) {
      return { success: false, user: null as any, error: err.message || '登录失败' };
    }
  },

  async getMe(): Promise<User | null> {
    try {
      const data = await get<{
        isLoggedIn: boolean;
        user: { id: number; username: string; display_name: string; created_at: string };
      }>('/auth/me');
      if (data.isLoggedIn && data.user) {
        return {
          id: String(data.user.id),
          username: data.user.username,
          displayName: data.user.display_name,
          role: 'administrator',
          department: '',
          isLoggedIn: true,
        };
      }
      return null;
    } catch {
      storage.removeUser();
      return null;
    }
  },
};
