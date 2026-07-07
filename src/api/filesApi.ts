import { WikiFile, UsageType } from '../types/file';
import { apiFetch } from './client';

export const filesApi = {
  async getFiles(entryId?: number): Promise<WikiFile[]> {
    const qs = entryId ? `?entry_id=${entryId}` : '';
    return apiFetch<WikiFile[]>(`/files${qs}`);
  },

  async uploadFile(
    fileInput: { name: string; size: number; type: string; base64Data?: string },
    entryId: number,
    usageType: UsageType
  ): Promise<WikiFile> {
    return apiFetch<WikiFile>('/files', {
      method: 'POST',
      body: JSON.stringify({
        name: fileInput.name,
        size: fileInput.size,
        type: fileInput.type,
        base64Data: fileInput.base64Data,
        entryId,
        usageType,
      }),
    });
  },

  async deleteFile(id: number): Promise<void> {
    await apiFetch<{ success: boolean }>(`/files/${id}`, {
      method: 'DELETE',
    });
  },
};
