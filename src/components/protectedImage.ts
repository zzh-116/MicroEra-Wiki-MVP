// Blob-backed rendering of a protected `/api/images/*` URL.
//
// A plain <img> cannot send an `Authorization: Bearer` header, so protected
// images must be fetched with the token and rendered from an object URL. The
// fetch → object-URL → revoke lifecycle is factored out of the React layer into
// `ProtectedImageLoader` so the security property can be unit-tested against a
// simulated browser (real fetch + object-URL callbacks), not just a mock.

/** A protected local image is exactly the parser's `/api/images/<name>` form. */
export function isProtectedImage(src: string): boolean {
  return src.startsWith('/api/images/');
}

export interface BlobUrlEnvironment {
  fetch: (url: string, init: { headers: Record<string, string> }) => Promise<{
    ok: boolean;
    blob: () => Promise<Blob>;
  }>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

/**
 * Drives the async fetch → object-URL lifecycle for one protected image. The
 * object URL is revoked exactly once (on `dispose`), so a logout, token change,
 * or identity change that re-runs the effect (and thus disposes the previous
 * loader) can never leave a stale, still-valid blob URL on the page.
 */
export class ProtectedImageLoader {
  private objectUrl: string | null = null;
  private disposed = false;

  constructor(
    private readonly src: string,
    private readonly token: string,
    private readonly env: BlobUrlEnvironment,
  ) {}

  async load(onResolve: (url: string | null) => void): Promise<void> {
    try {
      const res = await this.env.fetch(this.src, { headers: { Authorization: `Bearer ${this.token}` } });
      if (this.disposed) return;
      if (!res.ok) {
        // Inaccessible (e.g. 401 after token expiry) → render nothing, leak nothing.
        onResolve(null);
        return;
      }
      const blob = await res.blob();
      if (this.disposed) return;
      this.objectUrl = this.env.createObjectURL(blob);
      onResolve(this.objectUrl);
    } catch {
      // Network/parse failure → render nothing rather than a broken <img>.
      if (!this.disposed) onResolve(null);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.objectUrl) {
      this.env.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
