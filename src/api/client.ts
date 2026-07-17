/**
 * Unified API HTTP client.
 *
 * Talks to the Express backend (dev: proxied by Vite to localhost:3001;
 * production: same origin). Token persistence is delegated to storage.ts.
 */
import { storage } from '../lib/storage';

const API_BASE = '/api';

export function getToken(): string | null {
  return storage.getToken();
}

export function setToken(token: string): void {
  storage.setToken(token);
}

export function clearToken(): void {
  storage.removeToken();
}

/** Build headers with optional auth */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Low-level fetch wrapper — all API calls go through this */
export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.message || body?.error || response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/** Convenience: GET */
export function get<T>(url: string): Promise<T> {
  return request<T>(url);
}

/** Convenience: POST */
export function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Convenience: PUT */
export function put<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Convenience: DELETE */
export function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' });
}
