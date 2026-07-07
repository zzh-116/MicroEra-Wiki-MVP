import { Category } from '../types/category';
import { apiFetch } from './client';

export const categoriesApi = {
  async getCategories(): Promise<Category[]> {
    return apiFetch<Category[]>('/categories');
  },
};
