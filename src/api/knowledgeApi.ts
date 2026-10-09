/**
 * Knowledge-domain API client (P1-05). Thin wrapper over the /api/v2/ops wire
 * surface. Every endpoint returns the { ok, data, meta } envelope, so we unwrap
 * `data` and surface the typed `error` on failure.
 */
import { get, post, request } from './client';

export interface Kb {
  id: number;
  name: string;
  slug: string;
  description: string;
  visibility: 'public' | 'internal';
  created_at: string;
  updated_at: string;
  document_count?: number;
}

export interface Folder {
  id: number;
  kb_id: number;
  parent_id: number | null;
  name: string;
}

export interface Document {
  id: number;
  kb_id: number;
  folder_id: number | null;
  title: string;
  summary: string;
  content: string;
  visibility: 'public' | 'internal';
  parse_status: string;
  updated_at: string;
}

async function unwrap<T>(p: Promise<{ ok: boolean; data: T; error?: { message?: string } }>): Promise<T> {
  const res = await p;
  if (!res?.ok) throw new Error(res?.error?.message ?? 'request failed');
  return res.data;
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const knowledgeApi = {
  // KB
  listKbs(): Promise<{ items: Kb[]; total: number }> {
    return unwrap(get('/v2/ops/kb/list'));
  },
  createKb(input: { name: string; description?: string; visibility?: string }): Promise<Kb> {
    return unwrap(post('/v2/ops/kb/create', input));
  },
  viewKb(kbId: number): Promise<Kb> {
    return unwrap(get(`/v2/ops/kb/view${qs({ kb_id: kbId })}`));
  },

  // Folders
  listFolders(kbId: number): Promise<{ items: Folder[]; kb_id: number }> {
    return unwrap(get(`/v2/ops/kb/folder_list${qs({ kb_id: kbId })}`));
  },
  createFolder(input: { kb_id: number; parent_id?: number | null; name: string }): Promise<Folder> {
    return unwrap(post('/v2/ops/kb/folder_create', input));
  },

  // Documents
  listDocuments(params: { kb_id?: number; folder_id?: number }): Promise<{ items: Document[]; total: number }> {
    return unwrap(get(`/v2/ops/doc/list${qs({ kb_id: params.kb_id, folder_id: params.folder_id })}`));
  },
  viewDocument(docId: number): Promise<Document> {
    return unwrap(get(`/v2/ops/doc/view${qs({ doc_id: docId })}`));
  },
  updateDocument(docId: number, patch: Partial<Pick<Document, 'title' | 'summary' | 'content' | 'visibility'>>): Promise<Document> {
    return unwrap(request(`/v2/ops/doc/update`, { method: 'PATCH', body: JSON.stringify({ doc_id: docId, ...patch }) }));
  },
  previewDocument(docId: number): Promise<{ doc_id: number; title: string; format: string; preview: string }> {
    return unwrap(post('/v2/ops/doc/preview', { doc_id: docId }));
  },
};
