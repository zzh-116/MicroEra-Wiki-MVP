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
      const data = await post<{ results: any[]; source: string }>('/search', { query });
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

      // Client-side filter by type if needed (backend doesn't support typeFilter yet)
      if (typeFilter !== 'all') {
        return results.filter((r) => r.type === typeFilter);
      }
      return results;
    } catch {
      return [];
    }
  },
};
