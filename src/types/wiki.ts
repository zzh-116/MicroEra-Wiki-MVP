export interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
  department: string;
  isLoggedIn: boolean;
}

export interface WikiSpace {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  visibility: 'public' | 'internal';
  children?: WikiSpace[];
}

export type EntryType =
  | 'sandbox_project'
  | 'academic_paper'
  | 'patent'
  | 'data_standard'
  | 'tech_doc'
  | 'template'
  | 'business_material'
  | 'handwritten_note';

export interface EntryVersionHistoryItem {
  version: string;
  date: string;
  updatedBy: string;
  note: string;
  current?: boolean;
  contentBackup?: string; // full content backup for rollback
  titleBackup?: string;   // full title backup for rollback
  summaryBackup?: string; // full summary backup for rollback
}

export interface WikiEntry {
  id: string;
  spaceId: string;
  title: string;
  entryType: EntryType;
  summary: string;
  content: string; // Markdown formatted main text
  visibility: 'public' | 'internal';
  tags: string[];
  owner: string;
  ownerDepartment: string;
  latestUpdatedAt: string;
  createdAt: string;
  sourceFileIds: string[];
  markdownFileIds: string[];
  referenceIds: string[];
  relatedEntryIds: string[];
  graphNodeIds: string[];

  // Version Control Properties
  entryVersion?: string;
  lastUpdatedAt?: string;
  updatedBy?: string;
  versionNote?: string;
  isStableVersion?: boolean;
  entryVersionHistory?: EntryVersionHistoryItem[];
}

export interface SourceFile {
  id: string;
  entryId: string;
  originalFilename: string;
  storedFilename: string;
  fileType: string;
  fileSize: string; // e.g. "1.2 MB"
  storagePath: string;
  sha256: string;
  version: string;
  uploadedBy: string;
  uploadedAt: string;
  isLocked: boolean;
  visibility: 'public' | 'internal';
}

export interface MarkdownFile {
  id: string;
  sourceFileId: string;
  mdFilename: string;
  mdStoragePath: string;
  markdownContent: string;
  parserName: string;
  parserVersion: string;
  parseStatus: 'pending' | 'running' | 'success' | 'failed';
  parseError?: string;
  createdAt: string;
}

export interface Reference {
  id: string;
  fromEntryId: string;
  toEntryId?: string; // Optional if it references external or just a file
  sourceFileId?: string;
  markdownFileId?: string;
  locator: string; // section, page, chunk etc. e.g. "section=计算结果", "page=12"
  quote: string; // Short snippet
  referenceType: 'document' | 'paper' | 'patent' | 'source_file' | 'sandbox_result' | 'markdown_chunk';
  title?: string; // Cache title
  updatedAt?: string;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: EntryType;
  entryId: string;
  description: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string; // references, produces, depends_on, belongs_to, etc.
  description: string;
}

export interface ServiceCard {
  id: string;
  entryId: string;
  serviceType: 'rag' | 'mcp' | 'miqi';
  name: string;
  description: string;
  inputSchema: string; // JSON or text description
  outputSchema: string; // JSON or text description
  status: 'planning' | 'connected' | 'demo';
  mockEndpoint: string;
}

export interface DataItem {
  id: string;
  entryId: string;
  dataName: string;
  dataDefinition: string;
  dataFormat: string; // JSON, CSV, HDF5, CIF etc.
  schemaVersion: string;
  storageDescription: string;
  responsiblePerson: string;
  latestUpdatedAt: string;
}

export interface Paper {
  id: string;
  entryId: string;
  title: string;
  authors: string;
  year: number;
  doi: string;
  abstract: string;
  field: string; // 量子计算, 生物, 材料, etc.
  relatedProjectIds: string[];
  sourceFileId?: string;
  markdownFileId?: string;
}

export interface TemplateFile {
  id: string;
  entryId: string;
  templateName: string;
  approvedStatus: 'pending' | 'approved' | 'rejected';
  version: string;
  department: string;
  projectType: string;
  downloadUrl: string;
  latestApprovedAt: string;
  fileSize?: string;
  sha256?: string;
  downloads?: number;
}

export interface BusinessMetric {
  id: string;
  projectEntryId: string;
  metricName: string;
  metricValue: string; // e.g. "120%", "$50k"
  unit?: string;
  source: string;
  updatedAt: string;
}
