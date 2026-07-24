/**
 * Data adapter utilities.
 *
 * Converts between the backend's snake_case / numeric-ID format and the
 * v0.1.1 frontend's camelCase / string-ID format.
 */

// ── Markdown sanitization ───────────────────────────────────────

/**
 * Strip inline Base64 data-URI images from Markdown.
 *
 * Docling and other parsers may embed images as:
 *   ![alt](data:image/png;base64,iVBORw0KGgo...)
 *
 * These can be tens of KB and break page layout when rendered.
 * This function replaces them with a safe placeholder.
 *
 * Used at both the parser level (docling.ts) and renderer level
 * (all components that display Markdown) — double insurance.
 */
export function stripDataUriImages(markdown: string): string {
  if (!markdown) return markdown;

  // Pass 1: strip markdown image syntax ![alt](data:image/...)
  markdown = markdown.replace(
    /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
    (_fullMatch: string, alt: string) => {
      const label = alt?.trim() || 'Image';
      return `[Embedded image: ${label}]`;
    },
  );

  // Pass 2: strip bare data:image URIs that may appear as raw text
  // (LLM can output these without markdown syntax, or after a broken parse)
  markdown = markdown.replace(
    /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{100,}/g,
    '[Embedded image omitted]',
  );

  return markdown;
}

/** Strip ALL data: URIs from Markdown links/images (broader catch-all) */
export function stripAllDataUris(markdown: string): string {
  if (!markdown) return markdown;
  // Catch any [text](data:...) or ![alt](data:...) pattern
  markdown = markdown.replace(
    /(!?)\[([^\]]*)\]\(data:[^)]+\)/g,
    (_full: string, bang: string, label: string) => {
      const alt = label?.trim() || 'object';
      return bang ? `[Embedded image: ${alt}]` : `[Linked ${alt} omitted]`;
    },
  );
  // Catch bare data: URIs without markdown wrapping
  markdown = markdown.replace(
    /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{100,}/g,
    '[Embedded image omitted]',
  );
  return markdown;
}

// ── Key conversion ────────────────────────────────────────────

/** snake_case → camelCase */
export function snakeToCamel<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

/** camelCase → snake_case */
export function camelToSnake<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    result[snakeKey] = value;
  }
  return result as T;
}

// ── ID conversion ─────────────────────────────────────────────

export function toNumId(id: string): number {
  // Try to parse numeric prefix; fall back to hash
  const num = parseInt(id, 10);
  if (!isNaN(num)) return num;
  // Simple hash for string IDs
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function toStrId(id: number): string {
  return String(id);
}

// ── Entry type mapping ────────────────────────────────────────

/**
 * MVP backend types → v0.1.1 frontend types.
 * MVP set: asset | product | tech | patent | data_item
 * v0.1.1 set: project | paper | patent | data_item | concept |
 *   template | business_value | source_file | service | api | person | general
 */
export function mapEntryType(mvpType: string): string {
  const map: Record<string, string> = {
    sandbox_project: 'sandbox_project',
    academic_paper: 'academic_paper',
    patent: 'patent',
    data_standard: 'data_standard',
    tech_doc: 'tech_doc',
    template: 'template',
    business_material: 'business_material',
    handwritten_note: 'handwritten_note',
  };
  return map[mvpType] || 'general';
}

/** Reverse: v0.1.1 → MVP */
export function reverseEntryType(feType: string): string {
  const map: Record<string, string> = {
    sandbox_project: 'sandbox_project',
    academic_paper: 'academic_paper',
    patent: 'patent',
    data_standard: 'data_standard',
    tech_doc: 'tech_doc',
    template: 'template',
    business_material: 'business_material',
    handwritten_note: 'handwritten_note',
  };
  return map[feType] || 'tech';
}

// ── Entry field adapter (MVP Entry → WikiEntry) ───────────────

export interface MvpEntry {
  id: number;
  title: string;
  entry_type: string;
  summary: string;
  content: string;
  visibility: 'public' | 'internal';
  category_id?: number;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export function mvpEntryToWikiEntry(mvp: MvpEntry): Record<string, unknown> {
  return {
    id: toStrId(mvp.id),
    spaceId: mvp.category_id != null ? toStrId(mvp.category_id) : 's-uncategorized',
    title: mvp.title,
    entryType: mapEntryType(mvp.entry_type),
    summary: mvp.summary,
    content: mvp.content,
    visibility: mvp.visibility,
    tags: mvp.tags,
    owner: '',
    ownerDepartment: '',
    latestUpdatedAt: mvp.updated_at,
    createdAt: mvp.created_at,
    sourceFileIds: [],
    markdownFileIds: [],
    referenceIds: [],
    relatedEntryIds: [],
    graphNodeIds: [],
  };
}

/** Convert MVP user response to v0.1.1 User type */
export function mvpUserToWikiUser(mvp: {
  id: number;
  username: string;
  display_name?: string;
  created_at?: string;
}): Record<string, unknown> {
  return {
    id: toStrId(mvp.id),
    username: mvp.username,
    displayName: mvp.display_name || mvp.username,
    role: 'administrator',
    department: '',
    isLoggedIn: true,
  };
}

/** Convert MVP file to v0.1.1 SourceFile */
export function mvpFileToSourceFile(mvp: {
  id: number;
  entry_id: number;
  original_filename: string;
  stored_filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  usage_type: string;
  created_at: string;
}): Record<string, unknown> {
  return {
    id: toStrId(mvp.id),
    entryId: toStrId(mvp.entry_id),
    originalFilename: mvp.original_filename,
    storedFilename: mvp.stored_filename,
    fileType: mvp.file_type,
    fileSize: formatFileSize(mvp.file_size),
    storagePath: mvp.storage_path,
    sha256: '',
    version: 'v1.0',
    uploadedBy: '',
    uploadedAt: mvp.created_at,
    isLocked: false,
    visibility: 'internal' as const,
  };
}

/** Convert MVP data item to v0.1.1 DataItem */
export function mvpDataItemToDataItem(mvp: {
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
}): Record<string, unknown> {
  return {
    id: toStrId(mvp.id),
    entryId: toStrId(mvp.entry_id),
    dataName: mvp.data_name,
    dataDefinition: mvp.data_definition,
    dataFormat: mvp.data_format,
    schemaVersion: mvp.schema_version,
    storageDescription: mvp.storage_description || '',
    responsiblePerson: mvp.responsible_person,
    latestUpdatedAt: mvp.updated_at,
  };
}

/** Convert MVP category to v0.1.1 WikiSpace (flat, no tree) */
export function mvpCategoryToSpace(mvp: {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
}): Record<string, unknown> {
  return {
    id: toStrId(mvp.id),
    name: mvp.name,
    description: mvp.description || '',
    parentId: undefined,
    visibility: 'internal' as const,
    children: [],
  };
}

// ── Helpers ───────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
