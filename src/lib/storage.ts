// Storage abstraction — single access point for all browser persistence.
// Components and hooks never touch localStorage/sessionStorage directly.
// If the persistence mechanism changes (IndexedDB, backend sync, etc.),
// only this file needs to change.
// ─────────────────────────────────────────────────────────────

// ── Keys ──────────────────────────────────────────────────

const KEYS = {
  token: 'miqro_wiki_token',
  user: 'miqro_wiki_user',
  quickQuestion: 'miqro_wiki_quick_q',
  searchQuery: 'miqro_wiki_search_query',
  conversation: (entryId: string) => `miqro_wiki_conv_${entryId}`,
} as const;

// ── Low-level helpers ─────────────────────────────────────

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or unavailable */ }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

function getRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

// Session storage helpers

function sessionGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sessionSet<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

function sessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────

export const storage = {
  // ── Token ──────────────────────────────────────────────
  getToken(): string | null {
    return getRaw(KEYS.token);
  },

  /**
   * Persist token WITHOUT JSON.stringify wrapping.
   * Client uses getRaw/setRaw so token is a bare string.
   */
  setToken(token: string): void {
    setRaw(KEYS.token, token);
  },

  removeToken(): void {
    remove(KEYS.token);
  },

  // ── User ───────────────────────────────────────────────
  getUser<T>(): T | null {
    return get<T>(KEYS.user);
  },

  setUser<T>(user: T): void {
    set(KEYS.user, user);
  },

  removeUser(): void {
    remove(KEYS.user);
  },

  // ── Quick question (cross-page routing) ────────────────
  getQuickQuestion(): string | null {
    return getRaw(KEYS.quickQuestion);
  },

  setQuickQuestion(q: string): void {
    setRaw(KEYS.quickQuestion, q);
  },

  removeQuickQuestion(): void {
    remove(KEYS.quickQuestion);
  },

  // ── Search query (cross-page routing) ──────────────────
  getSearchQuery(): string | null {
    return getRaw(KEYS.searchQuery);
  },

  setSearchQuery(q: string): void {
    setRaw(KEYS.searchQuery, q);
  },

  removeSearchQuery(): void {
    remove(KEYS.searchQuery);
  },

  // ── Conversation state (sessionStorage — ephemeral) ────
  getConversation<T>(entryId: string): T | null {
    return sessionGet<T>(KEYS.conversation(entryId));
  },

  setConversation<T>(entryId: string, state: T): void {
    sessionSet(KEYS.conversation(entryId), state);
  },

  removeConversation(entryId: string): void {
    sessionRemove(KEYS.conversation(entryId));
  },

  // ── Bulk cleanup ───────────────────────────────────────
  /** Clear all Wiki-related state (used on logout) */
  clearAll(): void {
    this.removeToken();
    this.removeUser();
    this.removeQuickQuestion();
    this.removeSearchQuery();
    // Session conversations survive intentionally — refreshed per-tab
  },
};
