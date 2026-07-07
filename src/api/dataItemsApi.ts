import { DataItem } from '../types/dataItem';
import { apiFetch } from './client';

export const dataItemsApi = {
  async getDataItems(): Promise<DataItem[]> {
    try {
      return await apiFetch<DataItem[]>('/data-items');
    } catch {
      return [];
    }
  },

  async getDataItemByEntryId(entryId: number): Promise<DataItem | null> {
    try {
      return await apiFetch<DataItem>(`/data-items?entry_id=${entryId}`);
    } catch {
      return null;
    }
  },

  async saveDataItem(
    input: Omit<DataItem, 'id' | 'updated_at'> & { id?: number }
  ): Promise<DataItem> {
    return apiFetch<DataItem>('/data-items', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteDataItem(id: number): Promise<void> {
    await apiFetch<{ success: boolean }>(`/data-items/${id}`, {
      method: 'DELETE',
    });
  },
};
