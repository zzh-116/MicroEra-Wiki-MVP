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

export interface SearchResponse {
  results: SearchResult[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  source: string;
}

export const searchApi = {
  async search(
    query: string,
    typeFilter: string = 'all',
    searchMode: 'keyword' | 'nlp' | 'title' = 'keyword',
    page = 1,
    pageSize = 10,
  ): Promise<SearchResponse> {
    try {
      const backendTypeMap: Record<string, string> = {
        project: 'product', paper: 'tech', data_item: 'data_item',
        template: 'asset', patent: 'patent', concept: 'tech', service: 'tech',
      };
      const backendType = typeFilter !== 'all' ? (backendTypeMap[typeFilter] || typeFilter) : undefined;

      const body: any = { query, page, pageSize };
      if (backendType) body.type = backendType;

      const data = await post<any>('/search', body);
      const results: SearchResult[] = (data.results || []).map((r: any) => {
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
      return { results, page: data.page || 1, pageSize: data.pageSize || 10, total: data.total || results.length, totalPages: data.totalPages || 1, source: data.source || 'database' };
    } catch {
      return { results: [], page: 1, pageSize: 10, total: 0, totalPages: 0, source: 'error' };
    }
  },
};
