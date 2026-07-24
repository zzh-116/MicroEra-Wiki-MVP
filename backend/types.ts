// Shared type definitions for the entire backend

// ---- Metadata ----

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
  tags: string[]; // tag names, not IDs
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
}

export interface Tag {
  id: number;
  name: string;
}

export interface WikiFile {
  id: number;
  entry_id: number;
  original_filename: string;
  stored_filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  usage_type: string;
  created_at: string;
}

export interface DataItem {
  id: number;
  entry_id: number;
  data_name: string;
  data_definition: string;
  data_format: string;
  storage_description?: string;
  schema_description?: string;
  schema_version: string;
  responsible_person: string;
  updated_at: string;
}

// ---- Document ----

export interface DocumentChunk {
  id: string;
  entryId: number;
  text: string;
  metadata: Record<string, any>;
}

// ---- Parser ----

export interface ParsedProperty {
  code: string;             // C01, E01, X01, P01
  section: string;          // 1.1 几何结构 / 2.2.1 响应性能
  category: 'computational' | 'experimental' | 'cross' | 'condition';
  nameZh: string;
  nameEn: string;
  symbol: string;
  definition: string;
  preferredUnit: string;
  alternativeUnits: string;
  valueRange: string;
  methods: string;
  notes: string;
}

// ---- Embedding ----

export interface EmbeddingResult {
  entryId: number;
  vector: number[];
}

// ---- Vector ----

export interface VectorRecord {
  chunk_id: string;
  entry_id: number;
  embedding: number[];
}

export interface VectorSearchResult {
  entry_id: number;
  chunk_id: string;
  score: number;
}

// ---- Retrieval ----

export interface RetrievalResult {
  entry: Entry;
  score: number;
  chunkId?: string;
  chunkText?: string;
  /** Nearest markdown heading from chunk metadata (e.g. "## Training Data") */
  chunkHeading?: string;
  chunks?: DocumentChunk[];
}

// ---- AI ----

export interface Bookmark {
  userId: number;
  entryId: number;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
