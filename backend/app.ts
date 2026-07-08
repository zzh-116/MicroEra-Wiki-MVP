// Express App Factory — creates and configures the Express application
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { pool, db } from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { userRepository } from './repositories/user.repository.js';
import { ollamaEmbedder } from './embedding/ollama.js';
import type { Router } from 'express';

export interface AppOptions {
  cors?: boolean;
  serveStatic?: boolean;
  bootstrap?: boolean;
  extraRoutes?: Array<{ path: string; router: Router }>;
}

export async function createApp(options: AppOptions = {}) {
  const { cors = true, serveStatic = true, bootstrap = true, extraRoutes = [] } = options;

  const app = express();
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

  // API Routes
  const { authRouter } = await import('../server/routes/auth.js');
  const { categoriesRouter } = await import('../server/routes/categories.js');
  const { tagsRouter } = await import('../server/routes/tags.js');
  const { entriesRouter } = await import('../server/routes/entries.js');
  const { filesRouter } = await import('../server/routes/files.js');
  const { dataItemsRouter } = await import('../server/routes/dataItems.js');
  const { aiRouter } = await import('../server/routes/ai.js');
  const { searchRouter } = await import('../server/routes/search.js');
  const { pipelineRouter } = await import('../server/routes/pipeline.js');
  const { graphRouter } = await import('../server/routes/graph.js');
  const { spacesRouter } = await import('../server/routes/spaces.js');

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/data-items', dataItemsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/pipeline', pipelineRouter);
  app.use('/api/graph', graphRouter);
  app.use('/api/spaces', spacesRouter);

  for (const { path: p, router } of extraRoutes) app.use(p, router);

  // Swagger UI
  const swaggerDir = path.resolve(import.meta.dirname, 'swagger');
  if (fs.existsSync(swaggerDir)) {
    app.use('/api/docs', express.static(swaggerDir));
    console.log('[App] Swagger UI at /api/docs');
  }

  // Static files (production)
  if (serveStatic) {
    const distPath = path.resolve(import.meta.dirname, '..', 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.json({ message: 'MicroEra Wiki API', version: '0.2.0', docs: '/api/docs' });
    });
  }

  if (bootstrap) await runBootstrap();
  return app;
}

/** Run migrations, seed, and initialize services */
export async function runBootstrap() {
  // 1. Run migrations
  await runMigrations();

  // 2. Seed database (idempotent)
  await seedDatabase();

  // 3. Seed admin user (idempotent)
  await userRepository.seedAdmin();

  console.log(`[Bootstrap] PostgreSQL ready — ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log(`[Bootstrap] Ollama: ${config.ollama.url} (chat: ${config.ollama.chatModel}, embed: ${config.ollama.embeddingModel})`);
}

/** Execute migration SQL files in order */
async function runMigrations(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);

  const dir = path.resolve(import.meta.dirname, 'db', 'migrations');
  if (!fs.existsSync(dir)) { console.log('[Migrate] No migrations directory'); return; }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;

    console.log(`[Migrate] Applying: ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await pool.query(stmt);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
  }
}
