// Authentication service — replaces hardcoded admin/admin123
import { userRepository, UserRow } from '../repositories/user.repository.js';

export interface SafeUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

function sanitize(u: UserRow): SafeUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}

export class AuthService {
  async login(username: string, password: string): Promise<SafeUser | null> {
    const user = await userRepository.findByUsername(username);
    if (!user) return null;

    const valid = await userRepository.verifyPassword(user, password);
    if (!valid) return null;

    await userRepository.updateLastLogin(user.id);
    return sanitize(user);
  }

  async getUserById(id: number): Promise<SafeUser | null> {
    const user = await userRepository.findById(id);
    return user ? sanitize(user) : null;
  }
}

export const authService = new AuthService();
