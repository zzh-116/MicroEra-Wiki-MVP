// Sandbox Auth — token-based authentication with automatic refresh.
// No browser cookies. Token stored in memory and refreshed on expiry.

import { config } from '../../config.js';

interface TokenState {
  token: string | null;
  expiresAt: number; // epoch ms
}

const state: TokenState = { token: null, expiresAt: 0 };

/** Buffer time before token expiry to proactively refresh (5 minutes) */
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

function baseUrl(): string {
  return config.sandbox.baseUrl.replace(/\/$/, '');
}

export async function login(): Promise<string> {
  const url = `${baseUrl()}/api/login`;
  console.log(`[Sandbox:Auth] Logging in to ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.sandbox.username,
      password: config.sandbox.password,
    }),
  });

  if (!res.ok) {
    throw new Error(`Sandbox login failed: HTTP ${res.status} — ${await res.text()}`);
  }

  const data = await res.json() as { code?: number; data?: { token?: string; expire?: number }; token?: string; access_token?: string };
  // Token can be at: data.token (Sandbox), data.data.token, or top-level token/access_token
  const token = data.data?.token || data.token || data.access_token;

  if (!token) {
    throw new Error(`Sandbox login: no token in response — keys: ${Object.keys(data).join(', ')}`);
  }

  // Use server-provided expiry or default to 24h
  const expireSeconds = data.data?.expire || 86400;
  state.token = token;
  state.expiresAt = Date.now() + (expireSeconds - 60) * 1000; // 60s buffer

  console.log('[Sandbox:Auth] Login successful');
  return token;
}

export async function getToken(): Promise<string> {
  const now = Date.now();
  if (state.token && now < state.expiresAt - TOKEN_BUFFER_MS) {
    return state.token;
  }
  return login();
}

/** Force re-login (e.g. after 401) */
export async function refreshToken(): Promise<string> {
  state.token = null;
  state.expiresAt = 0;
  return login();
}

export function isAuthenticated(): boolean {
  return state.token !== null && Date.now() < state.expiresAt - TOKEN_BUFFER_MS;
}
