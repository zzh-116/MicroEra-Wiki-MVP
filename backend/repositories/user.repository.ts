import { BaseRepository } from './base.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export interface UserRow {
  id: number;
  username: string;
  passwordHash: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt: Date;
  lastLoginAt: Date | null;
}

export class UserRepository extends BaseRepository {
  async findById(id: number): Promise<UserRow | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? undefined;
  }

  async findByUsername(username: string): Promise<UserRow | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return rows[0] ?? undefined;
  }

  async create(input: {
    username: string;
    password: string;
    displayName?: string;
    role?: 'admin' | 'editor' | 'viewer';
  }): Promise<UserRow> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const [row] = await this.db
      .insert(users)
      .values({
        username: input.username,
        passwordHash,
        displayName: input.displayName ?? input.username,
        role: input.role ?? 'viewer',
      })
      .returning();
    return row;
  }

  async verifyPassword(user: UserRow, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, id));
  }

  /** Seed the default admin user if no users exist */
  async seedAdmin(): Promise<void> {
    const existing = await this.db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) return;

    await this.create({
      username: 'admin',
      password: 'admin123',
      displayName: '管理员',
      role: 'admin',
    });
    console.log('[Seed] Admin user created (admin / admin123)');
  }
}

export const userRepository = new UserRepository();
