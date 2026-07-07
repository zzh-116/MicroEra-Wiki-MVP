import { Entry, EntryType, VisibilityType } from '../types/entry';
import { apiFetch } from './client';

export interface EntryQueryParams {
  keyword?: string;
  entry_type?: EntryType | 'all';
  visibility?: VisibilityType | 'all';
  category_id?: number | 'all';
  tag?: string;
}

export const entriesApi = {
  async getEntries(params?: EntryQueryParams): Promise<Entry[]> {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.keyword) searchParams.set('keyword', params.keyword);
      if (params.entry_type && params.entry_type !== 'all') searchParams.set('entry_type', params.entry_type);
      if (params.visibility && params.visibility !== 'all') searchParams.set('visibility', params.visibility);
      if (params.category_id && params.category_id !== 'all') searchParams.set('category_id', String(params.category_id));
      if (params.tag) searchParams.set('tag', params.tag);
    }
    const qs = searchParams.toString();
    return apiFetch<Entry[]>(`/entries${qs ? `?${qs}` : ''}`);
  },

  async getEntryById(id: number): Promise<Entry | null> {
    try {
      return await apiFetch<Entry>(`/entries/${id}`);
    } catch (err: any) {
      if (err.message?.includes('UNAUTHORIZED') || err.message?.includes('无权')) {
        throw new Error('UNAUTHORIZED_INTERNAL_VIEW');
      }
      throw err;
    }
  },

  async createEntry(input: Omit<Entry, 'id' | 'created_at' | 'updated_at'>): Promise<Entry> {
    return apiFetch<Entry>('/entries', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateEntry(id: number, input: Partial<Entry>): Promise<Entry> {
    return apiFetch<Entry>(`/entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteEntry(id: number): Promise<void> {
    await apiFetch<{ success: boolean }>(`/entries/${id}`, {
      method: 'DELETE',
    });
  },
};
