import { Tag } from '../types/tag';
import { apiFetch } from './client';

export const tagsApi = {
  async getTags(): Promise<Tag[]> {
    return apiFetch<Tag[]>('/tags');
  },
};
