import { User } from '../types/user';
import { apiFetch } from './client';

interface LoginResponse {
  token: string;
  user: User;
}

interface MeResponse {
  isLoggedIn: boolean;
  user: User | null;
}

export const authApi = {
  async login(username: string, password: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async getMe(): Promise<MeResponse> {
    try {
      const user = await apiFetch<User>('/auth/me');
      return { isLoggedIn: true, user };
    } catch {
      return { isLoggedIn: false, user: null };
    }
  },
};
