import { BaseRepository } from './base.js';
import { categories } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { Category } from '../types.js';

export class CategoryRepository extends BaseRepository {
  async findAll(): Promise<Category[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .orderBy(categories.sortOrder);

    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? undefined,
      sort_order: c.sortOrder,
    }));
  }

  async findById(id: number): Promise<Category | undefined> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (rows.length === 0) return undefined;
    const c = rows[0];
    return { id: c.id, name: c.name, description: c.description ?? undefined, sort_order: c.sortOrder };
  }
}

export const categoryRepository = new CategoryRepository();
