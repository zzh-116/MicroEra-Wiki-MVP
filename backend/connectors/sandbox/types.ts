// Sandbox API response types — mirrors the Sandbox data platform JSON shapes.

export interface SandboxProject {
  projectId: string;
  projectTitle: string;
}

export interface SandboxAsset {
  id: string;
  type: string;
  title: string;
  description?: string;
  tags?: string[];
  status?: string;
  author?: string;
  authorId?: string;
  projectId?: string;
  updateTime?: string;
  createTime?: string;
}

export interface SandboxAssetPage {
  rows: SandboxAsset[];
  total: number;
}

export interface SandboxPageRequest {
  pageNum: number;
  pageSize: number;
  projectId?: string;
  types?: string;
  statuses?: string;
  name?: string;
  authorIds?: string;
  objectDomain?: string;
  propertyDomain?: string;
  methodDomain?: string;
}

export interface SandboxOperatorDetail {
  id: string;
  title?: string;
  name?: string;
  originalName?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  references?: string[];
  environment?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  steps?: { order: number; name: string; description?: string }[];
  property?: Record<string, unknown>;
  updateTime?: string;
  author?: string;
  project?: { projectId: string; projectTitle: string };
}

export interface SandboxDotDetail {
  id: string;
  title?: string;
  name?: string;
  originalName?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  references?: string[];
  environment?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  updateTime?: string;
  author?: string;
  project?: { projectId: string; projectTitle: string };
}

export interface SandboxDatasetDetail {
  id: string;
  title?: string;
  name?: string;
  originalName?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  references?: string[];
  datarecords?: Record<string, unknown>[];
  updateTime?: string;
  author?: string;
  project?: { projectId: string; projectTitle: string };
}

export type SandboxDetail = SandboxOperatorDetail | SandboxDotDetail | SandboxDatasetDetail;

export interface SandboxAuthResponse {
  token: string;
}
