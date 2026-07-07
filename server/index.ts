import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { seedMetadata } from '../backend/metadata/store.js';
import { milvusClient } from '../backend/vector/milvus.js';
import { memoryVectorStore } from '../backend/vector/memory.js';
import { config } from '../backend/config.js';

// Route imports (thin controllers)
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { tagsRouter } from './routes/tags.js';
import { entriesRouter } from './routes/entries.js';
import { filesRouter } from './routes/files.js';
import { dataItemsRouter } from './routes/dataItems.js';
import { aiRouter } from './routes/ai.js';
import { searchRouter } from './routes/search.js';
import { pipelineRouter } from './routes/pipeline.js';

const app = express();
const PORT = config.port;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (_req.method === 'OPTIONS') { res.sendStatus(200); return; }
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/files', filesRouter);
app.use('/api/data-items', dataItemsRouter);
app.use('/api/search', searchRouter);
app.use('/api/ai', aiRouter);
app.use('/api/pipeline', pipelineRouter);

// Swagger UI
const swaggerDir = path.resolve(import.meta.dirname, '..', 'backend', 'swagger');
if (fs.existsSync(swaggerDir)) {
  app.use('/api/docs', express.static(swaggerDir));
}

// Production: serve Vite-built static files
const distPath = path.resolve(import.meta.dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback
app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({
      message: 'Company Wiki MVP API Server',
      hint: 'Run `npm run build` to generate frontend static files.',
    });
  }
});

// Bootstrap
async function bootstrap() {
  // Seed metadata on first run
  seedMetadata();
  console.log('[Bootstrap] Metadata ready');

  // Try to connect Milvus, fall back to memory vector store
  await milvusClient.connect();
  if (!milvusClient.isReady()) {
    console.warn('[Bootstrap] Milvus unavailable, using memory vector store');
    await memoryVectorStore.connect();
  }

  app.listen(PORT, () => {
    console.log(`\n  [Wiki MVP Server] http://localhost:${PORT}`);
    console.log(`  API:        http://localhost:${PORT}/api`);
    console.log(`  API Docs:   http://localhost:${PORT}/api/docs`);
    console.log(`  Pipeline:   http://localhost:${PORT}/api/pipeline/health`);
    console.log(`  Ollama:     ${config.ollama.url} (chat: ${config.ollama.chatModel}, embed: ${config.ollama.embeddingModel})`);
    console.log(`  Milvus:     ${milvusClient.isReady() ? 'connected' : 'OFFLINE'}\n`);
  });
}

bootstrap();

export default app;
