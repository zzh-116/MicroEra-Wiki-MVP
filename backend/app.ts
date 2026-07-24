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
  const { connectorsRouter } = await import('../server/routes/connectors.js');
  const { adminRouter } = await import('../server/routes/admin.js');
  const { bookmarksRouter } = await import('../server/routes/bookmarks.js');

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
  app.use('/api/connectors', connectorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/bookmarks', bookmarksRouter);

  for (const { path: p, router } of extraRoutes) app.use(p, router);

  // Static files (production)
  if (serveStatic) {
    const distPath = path.resolve(import.meta.dirname, '..', 'dist');
    app.use(express.static(distPath));

    // Return JSON 404 for unmatched /api/* requests instead of serving index.html
    app.use((_req, res, next) => {
      if (_req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'NOT_FOUND', message: `Unknown API endpoint: ${_req.method} ${_req.originalUrl}` });
        return;
      }
      next();
    });

    // SPA fallback: serve index.html for all other non-API routes
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

  // 4. Warm up embedding model — force Ollama to load bge-m3 into memory
  //    and keep it warm so queries don't pay 1.7s load penalty each time
  ollamaEmbedder.warmup().then(() => {
    ollamaEmbedder.startKeepWarm();
  });

  // 5. Auto-sync Sandbox data if DB mode is enabled (async, non-blocking)
  if (config.sandboxDB.enabled) {
    console.log('[Bootstrap] Sandbox DB auto-sync enabled — starting in background...');
    autoSyncSandbox().catch((err) => {
      console.error('[Bootstrap] Sandbox auto-sync failed:', err.message);
    });
  }

  console.log(`[Bootstrap] PostgreSQL ready — ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log(`[Bootstrap] LLM Provider: ${config.llmProvider} (Ollama chat config: ${config.ollama.chatModel}, Embed: ${config.ollama.embeddingModel})`);
  if (config.llmProvider === 'deepseek') console.log(`[Bootstrap] DeepSeek model: ${config.deepseek.chatModel}`);
}

/** Auto-sync Sandbox DB documents into the Wiki knowledge base on startup */
async function autoSyncSandbox() {
  const { sandboxConnector } = await import('./connectors/sandbox/index.js');
  const { countSynced } = await import('./services/sync-log.service.js');

  await sandboxConnector.connect();

  const connectorAny = sandboxConnector as any;

  // 1. Fetch all asset documents
  const assetDocs: any[] = connectorAny.fetchAll
    ? await connectorAny.fetchAll({})
    : [];
  console.log(`[AutoSync] ${assetDocs.length} assets fetched from Sandbox`);

  // 2. Fetch all project wikis as documents
  let wikiDocs: any[] = [];
  try {
    const wikiSummaries = await connectorAny.listWikis({});
    for (const s of wikiSummaries) {
      try { wikiDocs.push(await connectorAny.fetchWiki(String(s.metadata?.projectId || s.id))); } catch {}
    }
    console.log(`[AutoSync] ${wikiDocs.length} project wikis fetched from Sandbox`);
  } catch (err: any) {
    console.warn(`[AutoSync] Wiki fetch skipped: ${err.message}`);
  }

  // 3. Fetch project tasks as documents (limit to 200 to avoid overload)
  let taskDocs: any[] = [];
  try {
    const taskSummaries = await connectorAny.listTasks({});
    const limited = taskSummaries.slice(0, 200);
    for (const s of limited) {
      try {
        // s.id format: "task:123" — extract numeric ID for fetchTask
        const numericId = String(s.id).replace(/^task:/, '');
        taskDocs.push(await connectorAny.fetchTask(numericId));
      } catch {}
    }
    console.log(`[AutoSync] ${taskDocs.length} project tasks fetched from Sandbox`);
  } catch (err: any) {
    console.warn(`[AutoSync] Task fetch skipped: ${err.message}`);
  }

  // 4. Combine all documents
  const allDocs = [...assetDocs, ...wikiDocs, ...taskDocs];
  console.log(`[AutoSync] ${allDocs.length} total documents fetched from Sandbox (${assetDocs.length} assets + ${wikiDocs.length} wikis + ${taskDocs.length} tasks)`);

  // 5. Import each document
  const { importService } = await import('./services/import.service.js');
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of allDocs) {
    try {
      const result = await importService.importFromConnector(doc);
      if (result.stages[0]?.detail?.startsWith('already imported')) {
        skipped++;
      } else if (result.success) {
        imported++;
      } else {
        failed++;
      }
    } catch (err: any) {
      failed++;
      console.error(`[AutoSync] Import failed for ${doc.id}: ${err.message}`);
    }
  }

  const totalSynced = await countSynced('sandbox');
  console.log(`[AutoSync] Complete — ${allDocs.length} from Sandbox → ${imported} new, ${skipped} already synced, ${failed} failed | ${totalSynced} total entries in sync log`);
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
