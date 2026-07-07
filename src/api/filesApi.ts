import { SourceFile } from '../types/wiki';
import { get, post } from './client';
import { mvpFileToSourceFile, toNumId } from '../utils/adapter';

export const filesApi = {
  async getFilesByEntryId(entryId: string): Promise<SourceFile[]> {
    try {
      const numId = toNumId(entryId);
      const data: any[] = await get(`/files?entry_id=${numId}`);
      return data.map(mvpFileToSourceFile) as unknown as SourceFile[];
    } catch {
      return [];
    }
  },

  async uploadFile(
    entryId: string,
    file: { name: string; size: number; type: string },
  ): Promise<SourceFile> {
    const body = {
      name: file.name,
      size: file.size,
      type: file.type,
      entryId: toNumId(entryId),
      usageType: 'document',
    };
    const data = await post<any>('/files', body);
    return mvpFileToSourceFile(data) as unknown as SourceFile;
  },
};
