import { mockEntries } from '../mock/mockEntries';
import { mockFiles } from '../mock/mockFiles';
import { mockCategories } from '../mock/mockCategories';
import { mockTags } from '../mock/mockTags';
import { mockDataItems } from '../mock/mockDataItems';

export const KEYS = {
  ENTRIES: 'wiki_entries',
  FILES: 'wiki_files',
  CATEGORIES: 'wiki_categories',
  TAGS: 'wiki_tags',
  DATA_ITEMS: 'wiki_data_items',
  AUTH: 'wiki_auth'
};

export function initializeStorage() {
  if (typeof window === 'undefined') return;

  if (!localStorage.getItem(KEYS.ENTRIES)) {
    localStorage.setItem(KEYS.ENTRIES, JSON.stringify(mockEntries));
  }
  if (!localStorage.getItem(KEYS.FILES)) {
    localStorage.setItem(KEYS.FILES, JSON.stringify(mockFiles));
  }
  if (!localStorage.getItem(KEYS.CATEGORIES)) {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(mockCategories));
  }
  if (!localStorage.getItem(KEYS.TAGS)) {
    localStorage.setItem(KEYS.TAGS, JSON.stringify(mockTags));
  }
  if (!localStorage.getItem(KEYS.DATA_ITEMS)) {
    localStorage.setItem(KEYS.DATA_ITEMS, JSON.stringify(mockDataItems));
  }
}

// Helper methods to get & set
export function getFromStorage<T>(key: string, defaultValue: T): T {
  initializeStorage();
  const value = localStorage.getItem(key);
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch (e) {
    console.error(`Failed to parse localStorage key ${key}`, e);
    return defaultValue;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
