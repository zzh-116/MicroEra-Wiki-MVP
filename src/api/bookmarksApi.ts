import { WikiEntry } from '../types/wiki';
import { get, post, del } from './client';
import { mvpEntryToWikiEntry, toNumId } from '../utils/adapter';

export const bookmarksApi = {
  /** Get all bookmarked entries for the current user */
  async getBookmarks(): Promise<WikiEntry[]> {
    const data: any[] = await get('/bookmarks');
    return data.map(mvpEntryToWikiEntry) as unknown as WikiEntry[];
  },

  /** Bookmark an entry */
  async addBookmark(entryId: string): Promise<void> {
    const numId = toNumId(entryId);
    await post(`/bookmarks/${numId}`);
  },

  /** Remove a bookmark */
  async removeBookmark(entryId: string): Promise<void> {
    const numId = toNumId(entryId);
    await del(`/bookmarks/${numId}`);
  },

  /** Check if an entry is bookmarked by the current user */
  async isBookmarked(entryId: string): Promise<boolean> {
    const numId = toNumId(entryId);
    const data = await get<{ bookmarked: boolean }>(`/bookmarks/${numId}/status`);
    return data.bookmarked;
  },
};
