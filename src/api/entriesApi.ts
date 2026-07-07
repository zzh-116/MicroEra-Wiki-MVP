import { WikiEntry } from '../types/wiki';
import { get, post, put, del } from './client';
import { mvpEntryToWikiEntry, toNumId, reverseEntryType } from '../utils/adapter';

export const entriesApi = {
  async getEntries(params?: {
    keyword?: string;
    entry_type?: string;
    visibility?: string;
    category_id?: string;
    tag?: string;
  }): Promise<WikiEntry[]> {
    const searchParams = new URLSearchParams();
    if (params?.keyword) searchParams.set('keyword', params.keyword);
    if (params?.visibility) searchParams.set('visibility', params.visibility);
    if (params?.category_id) searchParams.set('category_id', params.category_id);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.entry_type && params.entry_type !== 'all') {
      searchParams.set('entry_type', reverseEntryType(params.entry_type));
    }

    const qs = searchParams.toString();
    const url = `/entries${qs ? '?' + qs : ''}`;
    const data: any[] = await get(url);
    return data.map(mvpEntryToWikiEntry) as unknown as WikiEntry[];
  },

  async getEntryById(id: string): Promise<WikiEntry> {
    const numId = toNumId(id);
    const data = await get<any>(`/entries/${numId}`);
    return mvpEntryToWikiEntry(data) as unknown as WikiEntry;
  },

  async createEntry(
    entry: Omit<WikiEntry, 'id' | 'createdAt' | 'latestUpdatedAt'>,
  ): Promise<WikiEntry> {
    const body = {
      title: entry.title,
      entry_type: reverseEntryType(entry.entryType),
      summary: entry.summary,
      content: entry.content,
      visibility: entry.visibility,
      category_id: entry.spaceId ? toNumId(entry.spaceId) : undefined,
      tags: entry.tags,
    };
    const data = await post<any>('/entries', body);
    return mvpEntryToWikiEntry(data) as unknown as WikiEntry;
  },

  async updateEntry(id: string, updates: Partial<WikiEntry>): Promise<WikiEntry> {
    const numId = toNumId(id);
    const body: Record<string, unknown> = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.summary !== undefined) body.summary = updates.summary;
    if (updates.content !== undefined) body.content = updates.content;
    if (updates.visibility !== undefined) body.visibility = updates.visibility;
    if (updates.tags !== undefined) body.tags = updates.tags;
    if (updates.entryType !== undefined) body.entry_type = reverseEntryType(updates.entryType);
    if (updates.spaceId !== undefined) body.category_id = toNumId(updates.spaceId);
    const data = await put<any>(`/entries/${numId}`, body);
    return mvpEntryToWikiEntry(data) as unknown as WikiEntry;
  },

  async deleteEntry(id: string): Promise<void> {
    await del(`/entries/${toNumId(id)}`);
  },
};
