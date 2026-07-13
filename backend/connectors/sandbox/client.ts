// Sandbox HTTP Client — unified interface for all Sandbox API calls.
// Handles Authorization header injection and automatic token refresh on 401.

import { getToken, refreshToken } from './auth.js';
import { config } from '../../config.js';
import type {
  SandboxProject,
  SandboxAssetPage,
  SandboxPageRequest,
  SandboxOperatorDetail,
  SandboxDotDetail,
  SandboxDatasetDetail,
} from './types.js';

function baseUrl(): string {
  return config.sandbox.baseUrl.replace(/\/$/, '');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retryAuth = true,
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const token = await getToken();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retryAuth) {
    console.log('[Sandbox:Client] 401 received — refreshing token and retrying');
    await refreshToken();
    return request<T>(method, path, body, false);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sandbox API ${method} ${path} failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  // Handle empty responses (204, etc.)
  const text = await res.text();
  if (!text || !text.trim()) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ---- Public API ----

export async function getProjects(): Promise<SandboxProject[]> {
  const raw = await request<any>('GET', '/api/da/asset/project-select');
  // Unwrap possible { data: [...] } or { data: { rows: [...] } } wrapper
  const list = raw?.data?.rows || raw?.data || raw;
  return Array.isArray(list) ? list : [];
}

export async function getAssets(params: SandboxPageRequest): Promise<SandboxAssetPage> {
  const raw = await request<any>('POST', '/api/da/asset/page', params);
  // Sandbox wraps the response in { data: { rows, total } }
  const data = raw?.data || raw;
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    total: data?.total ?? 0,
  };
}

function unwrap<T>(raw: any): T {
  return (raw?.data !== undefined) ? raw.data as T : raw as T;
}

export async function getOperator(id: string): Promise<SandboxOperatorDetail> {
  return unwrap<SandboxOperatorDetail>(await request<any>('GET', `/api/da/asset/operator/${encodeURIComponent(id)}`));
}

export async function getDot(id: string): Promise<SandboxDotDetail> {
  return unwrap<SandboxDotDetail>(await request<any>('GET', `/api/da/asset/dot/${encodeURIComponent(id)}`));
}

export async function getDataset(id: string): Promise<SandboxDatasetDetail> {
  return unwrap<SandboxDatasetDetail>(await request<any>('GET', `/api/da/asset/dataset/${encodeURIComponent(id)}`));
}

export async function getPost(id: string): Promise<SandboxOperatorDetail> {
  return unwrap<SandboxOperatorDetail>(await request<any>('GET', `/api/da/asset/post/${encodeURIComponent(id)}`));
}

/** Fetch detail for any asset type — tries known endpoints in order */
export async function getDetail(type: string, id: string): Promise<any> {
  const endpoints: Record<string, () => Promise<any>> = {
    operator: () => getOperator(id),
    dot: () => getDot(id),
    dataset: () => getDataset(id),
    post: () => getPost(id),
  };

  if (endpoints[type]) {
    return endpoints[type]();
  }

  // Unknown type — try all known endpoints as fallback
  for (const [name, fn] of Object.entries(endpoints)) {
    try {
      const result = await fn();
      if (result && result.id === id) return result;
    } catch { /* continue */ }
  }
  throw new Error(`Cannot fetch detail for type "${type}" (id: ${id})`);
}
