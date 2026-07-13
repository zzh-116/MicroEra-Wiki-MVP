// Unified Document Model — all Connectors produce this shape.
// Downstream pipeline (chunk → embed → vector) consumes Documents,
// regardless of whether they came from a Parser (PDF, DOCX) or a
// Connector (Sandbox, Feishu, Confluence, etc.).

export interface DocumentSummary {
  /** Unique identifier from the source system */
  id: string;
  /** Display title */
  title: string;
  /** Asset / document type (source-specific) */
  type: string;
  /** ISO timestamp of last modification in source */
  updatedAt: string;
  /** Optional short description */
  description?: string;
  /** Source-specific metadata for filtering */
  metadata?: Record<string, unknown>;
}

export interface Document extends DocumentSummary {
  /** Full Markdown content — ready for chunking */
  content: string;
  /** Attachments (file references, URLs, etc.) */
  attachments: Attachment[];
  /** Source system identifier for traceability */
  source: string;
  /** Entry-level tags inferred from the document */
  tags: string[];
  /** Author / owner from the source system */
  author?: string;
}

export interface Attachment {
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

export interface SyncResult {
  connector: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface Connector {
  /** Unique connector name (e.g. "sandbox", "feishu", "confluence") */
  readonly name: string;
  /** Human-readable label */
  readonly label: string;
  /** Version string */
  readonly version: string;

  /** Establish connection / authenticate. Called before first use. */
  connect(): Promise<void>;

  /** List all available document summaries (lightweight, no full content) */
  list(params?: ListParams): Promise<DocumentSummary[]>;

  /** Fetch full detail for a single document (including content) */
  detail(id: string): Promise<Document>;

  /** Run full sync — list + detail for all documents */
  sync(params?: SyncParams): Promise<SyncResult>;
}

export interface ListParams {
  projectId?: string;
  keyword?: string;
  type?: string;
  status?: string;
  author?: string;
  /** Only return items updated after this ISO timestamp */
  since?: string;
}

export interface SyncParams {
  /** Incremental: only sync items updated after lastSyncTime */
  since?: string;
  projectId?: string;
  dryRun?: boolean;
}
