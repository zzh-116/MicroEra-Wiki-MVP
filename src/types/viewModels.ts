// UI ViewModels — clean types for rendering. Components consume these,
// never raw API responses. Formatters in utils/ produce these from backend data.

// ---- Detail Page ----

export interface DetailViewModel {
  id: string;
  title: string;
  entryType: string;
  author: string;
  updatedAt: string;
  createdAt: string;
  visibility: 'public' | 'internal';
  metadata: MetadataSection;
  summary: string;
  content: string;        // raw Markdown, rendered by MarkdownPreview
  tags: string[];         // cleaned, no IDs
  records: RecordCardViewModel[];
  references: ReferenceViewModel[];
  attachments: AttachmentViewModel[];
  sandboxRaw?: unknown;   // kept for debug toggle ONLY
}

// ---- Metadata ----

export interface MetadataSection {
  items: KeyValuePair[];
}

export interface KeyValuePair {
  key: string;
  value: string;
  type?: 'text' | 'link' | 'code' | 'badge';
}

// ---- Record Cards (Sandbox Data Records) ----

export interface RecordCardViewModel {
  index: number;
  title: string;
  domain?: string;
  description?: string;
  properties: KeyValuePair[];
  references: ReferenceViewModel[];
  images: ImageViewModel[];
  tables: TableViewModel[];
}

export interface ImageViewModel {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface TableViewModel {
  title?: string;
  headers: string[];
  rows: string[][];
}

// ---- References ----

export interface ReferenceViewModel {
  index: number;
  label: string;
  doi?: string;
  url?: string;
  description?: string;
  type: 'citation' | 'document' | 'dataset' | 'project' | 'file' | 'link';
}

// ---- Attachments ----

export interface AttachmentViewModel {
  name: string;
  url?: string;
  mimeType?: string;
  size?: string;
}

// ---- Chat / Conversation ----

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sources?: ChatSource[];
}

export interface ChatSource {
  id: number;
  title: string;
  entry_type: string;
}

export interface ConversationState {
  conversationId?: number;
  messages: ChatMessage[];
}
