// Knowledge Layer Types — unified document model independent of Sandbox JSON shape.
// Downstream consumers (chunk, embed, search, frontend) depend ONLY on these types,
// never on SandboxDetail / SandboxOperatorDetail etc. directly.

// ---- Core Knowledge Document ----

export interface KnowledgeDocument {
  /** Unique identifier (source-prefixed, e.g. "sandbox:abc123") */
  id: string;
  /** Human-readable display title */
  title: string;
  /** Document type: "project" | "paper" | "dataset" | "operator" | "module" | "other" */
  type: KnowledgeType;
  /** Short abstract / description (1-3 sentences) */
  abstract: string;
  /** Full body text in clean Markdown (excludes properties/references sections) */
  body: string;
  /** Structured properties as key-value pairs */
  properties: KnowledgeProperty[];
  /** Resolved references (citations, datasets, related projects) */
  references: KnowledgeReference[];
  /** Attachments (files, URLs) */
  attachments: KnowledgeAttachment[];
  /** Normalized tags */
  tags: string[];
  /** Source metadata (for provenance, NOT displayed to end users by default) */
  metadata: KnowledgeMetadata;
  /** ISO timestamp */
  updatedAt: string;
  /** Author / owner display name */
  author?: string;
}

// ---- Enums ----

export type KnowledgeType = 'project' | 'paper' | 'dataset' | 'operator' | 'module' | 'other';

// ---- Structured Properties ----

export interface KnowledgeProperty {
  /** Display key (e.g. "计算精度", "Input Dimension") */
  key: string;
  /** Display value (always a string — objects are JSON-serialized or described) */
  value: string;
  /** Optional group for UI categorization (e.g. "Input", "Output", "Environment") */
  group?: string;
  /** Optional data type hint for UI rendering */
  type?: 'text' | 'number' | 'code' | 'link' | 'json' | 'list';
}

// ---- Resolved References ----

export interface KnowledgeReference {
  /** Display label (e.g. "Gottesman 1997", "Dataset: MOF-5-screening") */
  label: string;
  /** Reference type */
  type: 'citation' | 'dataset' | 'project' | 'task' | 'file' | 'link' | 'other';
  /** Optional resolvable URL or ID */
  target?: string;
  /** Optional description */
  description?: string;
}

// ---- Attachments ----

export interface KnowledgeAttachment {
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

// ---- Metadata (dev/debug only) ----

export interface KnowledgeMetadata {
  source: string;           // "sandbox"
  sourceId: string;         // original sandbox asset ID
  sourceType: string;       // original sandbox type (operator/dot/dataset/post)
  projectName?: string;     // resolved project name
  unresolvedIds: string[];  // IDs that failed resolution
  rawKeys: string[];        // top-level keys in original JSON (for debug)
}
