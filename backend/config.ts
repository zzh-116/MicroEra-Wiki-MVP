// Centralized configuration — all env vars read once here
import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'microera-wiki-mvp-secret-2026',

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
    host: process.env.SANDBOX_DB_HOST || '10.36.160.33',
    port: parseInt(process.env.SANDBOX_DB_PORT || '3306', 10),
    database: process.env.SANDBOX_DB_NAME || 'miqroproject',
    user: process.env.SANDBOX_DB_USER || 'root',
    password: process.env.SANDBOX_DB_PASSWORD || '',
  },

  /** Feishu document connector */
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    wikiSpaceId: process.env.FEISHU_WIKI_SPACE_ID || '',
  },

  dataDir: process.env.DATA_DIR || './backend/data',

  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/microera_wiki',
};
