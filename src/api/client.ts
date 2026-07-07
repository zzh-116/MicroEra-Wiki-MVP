const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const auth = localStorage.getItem('wiki_auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      if (parsed?.token) {
        headers['Authorization'] = `Bearer ${parsed.token}`;
      }
    }
  } catch {
    // ignore parse errors
  }
  return headers;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const fullUrl = `${API_BASE}${url}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.message || errorBody?.error || response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/** Check if user has internal access based on localStorage auth state */
export function hasInternalAccess(): boolean {
  try {
    const auth = localStorage.getItem('wiki_auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      return !!(parsed?.token);
    }
  } catch {
    // ignore
  }
  return false;
}
