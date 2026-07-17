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

  /** Sandbox data platform connector */
  sandbox: {
    baseUrl: process.env.SANDBOX_BASE_URL || 'http://139.196.211.120:6810',
    username: process.env.SANDBOX_USERNAME || 'admin',
    password: process.env.SANDBOX_PASSWORD || '123456',
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
