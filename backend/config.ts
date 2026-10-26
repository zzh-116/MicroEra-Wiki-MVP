// Centralized configuration — all env vars read once here
import 'dotenv/config';

/** Known-insecure built-in defaults. These exist only so a developer checkout
 *  boots without configuration; production MUST override them (see
 *  `validateProductionSecrets`). Never reference these literals anywhere else. */
export const DEFAULT_JWT_SECRET = 'microera-wiki-mvp-secret-2026';
export const DEFAULT_ADMIN_PASSWORD = 'admin123';

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Hard-fail on known-insecure defaults when running in production. Call from
 * bootstrap BEFORE the server starts accepting traffic. Does nothing in dev so
 * a fresh checkout still boots.
 */
export function validateProductionSecrets(): void {
  if (!isProduction) return;
  const missing: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    missing.push('JWT_SECRET (must be set and not the built-in default)');
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    missing.push('ADMIN_PASSWORD (must be set and not the built-in default)');
  }
  if (missing.length > 0) {
    throw new Error(`Refusing to start in production with insecure secrets: ${missing.join('; ')}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,

  /** LLM provider selection: 'ollama' (local) or 'deepseek' (cloud) */
  llmProvider: (process.env.LLM_PROVIDER || 'ollama') as 'ollama' | 'deepseek',

  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'deepseek-r1:8b',
    chatModel: process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b',
    embeddingModel: process.env.OLLAMA_EMBED_MODEL || 'bge-m3',
  },

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    chatModel: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-v4-flash',
  },

  embeddingDimension: parseInt(process.env.EMBEDDING_DIM || '1024', 10),

  /** Sandbox MySQL direct connection.
   *  Read-only access — only SELECT queries, no writes.
   *  Set SANDBOX_DB_ENABLED=true to use DB mode instead of HTTP connector. */
  sandboxDB: {
    enabled: process.env.SANDBOX_DB_ENABLED === 'true',
    host: process.env.SANDBOX_DB_HOST || '',
    port: parseInt(process.env.SANDBOX_DB_PORT || '3306', 10),
    database: process.env.SANDBOX_DB_NAME || '',
    user: process.env.SANDBOX_DB_USER || '',
    password: process.env.SANDBOX_DB_PASSWORD || '',
  },

  /** Feishu document connector */
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    wikiSpaceId: process.env.FEISHU_WIKI_SPACE_ID || '',
  },

  dataDir: process.env.DATA_DIR || './backend/data',

  /** MinIO / S3-compatible object storage (optional; Wiki still boots without it). */
  objectStorage: {
    enabled: Boolean(process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY),
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    bucket: process.env.MINIO_BUCKET || 'wiki-docs',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },

  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/microera_wiki',

  /** Parse job worker (2b) — the durable-queue consumer process. */
  worker: {
    owner: process.env.WORKER_OWNER || `worker-${process.pid}`,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    pollMs: parseInt(process.env.WORKER_POLL_MS || '2000', 10),
    leaseSeconds: parseInt(process.env.WORKER_LEASE_SECONDS || '60', 10),
    heartbeatMs: parseInt(process.env.WORKER_HEARTBEAT_MS || '15000', 10),
  },

  /** Docling CLI (document parser) — environment-reproducible, no per-user
   *  absolute install path baked in. `command` is an explicit executable path or
   *  bare command name (e.g. `C:\...\Python312\Scripts\docling.exe`); when empty
   *  the parser probes `docling` on PATH, then verifies the module import via
   *  `python`. `python` is the interpreter used for that import probe + version
   *  check. Set either (or both) so a fresh checkout works without editing code. */
  docling: {
    command: process.env.DOCLING_CMD || '',
    python: process.env.DOCLING_PYTHON || 'python',
  },

  /** Runtime logging configuration */
  logging: {
    /** Minimum log level: debug | info | warn | error */
    level: (process.env.LOG_LEVEL || 'info') as string,
    /** Max number of log entries to retain (auto-cleanup threshold) */
    maxEntries: parseInt(process.env.LOG_MAX_ENTRIES || '10000', 10),
    /** Max age of log entries in days before auto-cleanup */
    maxAgeDays: parseInt(process.env.LOG_MAX_AGE_DAYS || '30', 10),
  },
};
