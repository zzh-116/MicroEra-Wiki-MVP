import { EntryType, WikiEntry } from '../types/wiki';
import { post } from './client';
import { mvpEntryToWikiEntry } from '../utils/adapter';

export interface SearchResult {
  id: string;
  title: string;
  summary: string;
  type: EntryType;
  tags: string[];
  updatedAt: string;
  owner: string;
  visibility: 'public' | 'internal';
  matchReason: string;
  referenceSource?: string;
}

export const searchApi = {
  async search(
    query: string,
    typeFilter: string = 'all',
    searchMode: 'keyword' | 'nlp' | 'title' = 'keyword',
  ): Promise<SearchResult[]> {
    try {
      // Map frontend type to backend entry_type
      const backendTypeMap: Record<string, string> = {
        project: 'product',
        paper: 'tech',
        data_item: 'data_item',
        template: 'asset',
        patent: 'patent',
        concept: 'tech',
        service: 'tech',
      };
      const backendType = typeFilter !== 'all' ? (backendTypeMap[typeFilter] || typeFilter) : undefined;

      const body: any = { query };
      if (backendType) body.type = backendType;

      const data = await post<{ results: any[]; source: string }>('/search', body);
      const results: SearchResult[] = data.results.map((r: any) => {
        const entry = mvpEntryToWikiEntry(r);
        return {
          id: entry.id as string,
          title: entry.title as string,
          summary: entry.summary as string,
          type: entry.entryType as EntryType,
          tags: (entry.tags as string[]) || [],
          updatedAt: entry.latestUpdatedAt as string,
          owner: (entry.owner as string) || '',
          visibility: entry.visibility as 'public' | 'internal',
          matchReason: data.source === 'semantic' ? '语义搜索匹配' : '关键词匹配',
          referenceSource: data.source,
        };
      });
      return results;
    } catch {
      return [];
    }
  },
};
