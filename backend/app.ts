// Express App Factory — creates and configures the Express application
// Separated from server startup so it can be imported for testing

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';

// Backend services
import { seedMetadata, metadataStore } from './metadata/store.js';
import { milvusClient } from './vector/milvus.js';
import { memoryVectorStore } from './vector/memory.js';
import { ollamaEmbedder } from './embedding/ollama.js';
import { config } from './config.js';

// Route imports — thin controllers
// Note: these are imported from server/routes/ (Express-dependent layer)
import type { Router } from 'express';

export interface AppOptions {
  /** Enable CORS (default: true) */
  cors?: boolean;
  /** Serve static files from dist/ (default: true) */
  serveStatic?: boolean;
  /** Run bootstrap (seed + vector store init) on creation (default: true) */
  bootstrap?: boolean;
  /** Additional route mount points */
  extraRoutes?: Array<{ path: string; router: Router }>;
}

export async function createApp(options: AppOptions = {}) {
  const { cors = true, serveStatic = true, bootstrap = true, extraRoutes = [] } = options;

  const app = express();

  // ---- Middleware ----
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (cors) {
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      if (_req.method === 'OPTIONS') { res.sendStatus(200); return; }
      next();
    });
  }

  // ---- API Routes ----
  // Import route modules dynamically (they live in server/routes/)
  const { authRouter } = await import('../server/routes/auth.js');
  const { categoriesRouter } = await import('../server/routes/categories.js');
  const { tagsRouter } = await import('../server/routes/tags.js');
  const { entriesRouter } = await import('../server/routes/entries.js');
  const { filesRouter } = await import('../server/routes/files.js');
  const { dataItemsRouter } = await import('../server/routes/dataItems.js');
  const { aiRouter } = await import('../server/routes/ai.js');
  const { searchRouter } = await import('../server/routes/search.js');
  const { pipelineRouter } = await import('../server/routes/pipeline.js');

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/data-items', dataItemsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/pipeline', pipelineRouter);

  // Mount any extra routes
  for (const { path: routePath, router } of extraRoutes) {
    app.use(routePath, router);
  }

  // ---- Swagger UI (if available) ----
  const swaggerDir = path.resolve(import.meta.dirname, 'swagger');
  if (fs.existsSync(swaggerDir)) {
    app.use('/api/docs', express.static(swaggerDir));
    console.log('[App] Swagger UI at /api/docs');
  }

  // ---- Static Files (production) ----
  if (serveStatic) {
    const distPath = path.resolve(import.meta.dirname, '..', 'dist');
    app.use(express.static(distPath));

    // SPA fallback
    app.get('*', (_req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).json({
          message: 'MicroEra Wiki MVP — Enterprise Data Pipeline API',
          version: '0.1.0',
          docs: '/api/docs',
          health: '/api/pipeline/health',
          endpoints: {
            auth: '/api/auth',
            entries: '/api/entries',
            categories: '/api/categories',
            tags: '/api/tags',
            files: '/api/files',
            dataItems: '/api/data-items',
            ai: '/api/ai',
            pipeline: '/api/pipeline',
          },
        });
      }
    });
  }

  // ---- Bootstrap ----
  if (bootstrap) {
    await runBootstrap();
  }

  return app;
}

/**
 * Bootstrap: seed data, connect vector stores, embed seed entries.
 */
export async function runBootstrap() {
  // Seed metadata on first run
  seedMetadata();
  console.log('[Bootstrap] Metadata ready');

  // Try to connect Milvus, fall back to memory vector store
  await milvusClient.connect();
  if (!milvusClient.isReady()) {
    console.warn('[Bootstrap] Milvus unavailable, using memory vector store');
    await memoryVectorStore.connect();
  }

  const vectorStore = milvusClient.isReady() ? milvusClient : memoryVectorStore;

  // Embed seed entries into vector store (only if not already done)
  await embedSeedEntries(vectorStore);

  console.log(`[Bootstrap] Vector store: ${milvusClient.isReady() ? 'Milvus' : 'Memory'}`);
  console.log(`[Bootstrap] Ollama: ${config.ollama.url} (chat: ${config.ollama.chatModel}, embed: ${config.ollama.embeddingModel})`);
}

/**
 * Generate embeddings for seed entries (id ≤ 8) and insert into vector store.
 * Deduplication is handled by the vector store's insert (upsert by entry_id),
 * so re-running on restart is safe but will overwrite existing vectors.
 */
async function embedSeedEntries(vectorStore: { isReady: () => boolean; insert: (records: Array<{ entry_id: number; embedding: number[] }>) => Promise<void> }) {
  if (!vectorStore.isReady()) return;

  const allEntries = metadataStore.getEntries({}, true);
  const seedEntries = allEntries.filter((e) => e.id <= 8);

  if (seedEntries.length === 0) {
    console.log('[Bootstrap] No seed entries to embed');
    return;
  }

  // Build embedding text: title + summary + first 800 chars of content
  const texts = seedEntries.map((e) => {
    return `标题: ${e.title}\n摘要: ${e.summary}\n内容: ${e.content.slice(0, 800)}`;
  });

  console.log(`[Bootstrap] Generating embeddings for ${texts.length} seed entries...`);

  try {
    const vectors = await ollamaEmbedder.embedBatch(texts);
    const records = seedEntries
      .map((e, i) => ({ entry_id: e.id, embedding: vectors[i] || [] }))
      .filter((r) => r.embedding.length > 0);

    if (records.length > 0) {
      await vectorStore.insert(records);
      console.log(`[Bootstrap] Embedded ${records.length}/${seedEntries.length} seed entries into vector store`);
    } else {
      console.warn('[Bootstrap] All seed embeddings came back empty — Ollama embedding model may not be loaded');
    }
  } catch (err: any) {
    console.warn(`[Bootstrap] Seed embedding failed (Ollama may be unavailable): ${err.message}`);
  }
}
