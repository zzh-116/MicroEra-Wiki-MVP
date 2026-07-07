export type EntryType = 'asset' | 'product' | 'tech' | 'patent' | 'data_item';
export type VisibilityType = 'public' | 'internal';

export interface Entry {
  id: number;
  title: string;
  entry_type: EntryType;
  summary: string;
  content: string;
  visibility: VisibilityType;
  category_id?: number;
  created_at: string;
  updated_at: string;
  tags: string[]; // Associated tag names for convenience in frontend MVP
}
