// Connector API Routes — manage data source connectors and trigger syncs.
// Connectors bring structured data from external platforms (Sandbox, Feishu,
// Confluence, GitLab Wiki, Notion) into the Wiki pipeline without going through
// the document parser.

import { Router, Request, Response } from 'express';
import { ConnectorRegistry } from '../../backend/connectors/index.js';
import { importService } from '../../backend/services/import.service.js';
import { sandboxConnector, SandboxDBConnector } from '../../backend/connectors/sandbox/index.js';
import { config } from '../../backend/config.js';
import '../../backend/connectors/crossref/index.js';
import '../../backend/connectors/feishu/index.js';
import '../../backend/connectors/arxiv/index.js';

export const connectorsRouter = Router();

// Register connectors at startup — prefer DB connector when enabled
if (config.sandboxDB.enabled) {
  ConnectorRegistry.register('sandbox', () => sandboxConnector);
  ConnectorRegistry.register('sandbox-db', () => sandboxConnector);
} else {
  ConnectorRegistry.register('sandbox', () => sandboxConnector);
}

// ---- Health / Status ----

connectorsRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    registered: ConnectorRegistry.list(),
    timestamp: new Date().toISOString(),
  });
});

// ---- List Connectors ----

connectorsRouter.get('/', (_req: Request, res: Response) => {
  const connectors = ConnectorRegistry.getAll().map((c) => ({
    name: c.name,
    label: c.label,
    version: c.version,
  }));
  res.json({ connectors });
});

// ---- Connect ----

connectorsRouter.post('/:name/connect', async (req: Request, res: Response) => {
  try {
    const connector = ConnectorRegistry.get(req.params.name);
    await connector.connect();
    res.json({ success: true, connector: connector.name, message: 'Connected' });
  } catch (err: any) {
    res.status(500).json({ error: 'CONNECT_FAILED', message: err.message });
  }
});

// ---- List Documents ----

connectorsRouter.get('/:name/documents', async (req: Request, res: Response) => {
  try {
    const connector = ConnectorRegistry.get(req.params.name);
    const { projectId, keyword, type, status, author, since } = req.query;
    const docs = await connector.list({
      projectId: projectId as string | undefined,
      keyword: keyword as string | undefined,
      type: type as string | undefined,
      status: status as string | undefined,
      author: author as string | undefined,
      since: since as string | undefined,
    });
    res.json({ connector: connector.name, total: docs.length, documents: docs });
  } catch (err: any) {
    res.status(500).json({ error: 'LIST_FAILED', message: err.message });
  }
});

// ---- Document Detail ----

connectorsRouter.get('/:name/documents/:id', async (req: Request, res: Response) => {
  try {
    const connector = ConnectorRegistry.get(req.params.name);
    const doc = await connector.detail(req.params.id);
    res.json({ connector: connector.name, document: doc });
  } catch (err: any) {
    res.status(500).json({ error: 'DETAIL_FAILED', message: err.message });
  }
});

// ---- Sync (dry-run) ----

connectorsRouter.post('/:name/sync/preview', async (req: Request, res: Response) => {
  try {
    const connector = ConnectorRegistry.get(req.params.name);
    await connector.connect();
    const { projectId, keyword } = req.body || {};
    const docs = await connector.list({ projectId, keyword });
    res.json({ connector: connector.name, total: docs.length, documents: docs });
  } catch (err: any) {
    res.status(500).json({ error: 'SYNC_PREVIEW_FAILED', message: err.message });
  }
});

// ---- Sync (execute) — full pipeline: connector → Document → import → chunk → embed ----

connectorsRouter.post('/:name/sync', async (req: Request, res: Response) => {
  const t0 = Date.now();
  try {
    const connector = ConnectorRegistry.get(req.params.name);
    await connector.connect();

    const { projectId, dryRun, keyword, dois } = req.body || {};

    // 1. List all documents from the connector
    const summaries = await connector.list({ projectId, keyword, ...(dois ? { dois } as any : {}) });

    if (dryRun) {
      res.json({
        connector: connector.name,
        dryRun: true,
        total: summaries.length,
        documents: summaries,
      });
      return;
    }

    // 2. Fetch full detail and import each document.
    //    DB connectors expose fetchAll() for bulk loading (1 query vs N+1);
    //    HTTP connectors fall back to the list()+detail() loop.
    const results: Array<{ id: string; title: string; entryId?: number; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    const connectorAny = connector as any;
    if (typeof connectorAny.fetchAll === 'function') {
      // ── Bulk path (DB connector) — single query, all documents ──
      const docs = await connectorAny.fetchAll({ projectId, keyword, ...(dois ? { dois } as any : {}) });
      for (const doc of docs) {
        try {
          const result = await importService.importFromConnector(doc);
          results.push({ id: doc.id, title: doc.title, entryId: result.entryId });
          succeeded++;
        } catch (err: any) {
          results.push({ id: doc.id, title: doc.title, error: err.message });
          failed++;
        }
      }
    } else {
      // ── N+1 path (HTTP connector) — list then detail per document ──
      for (const summary of summaries) {
        try {
          const doc = await connector.detail(summary.id);
          const result = await importService.importFromConnector(doc);
          results.push({ id: summary.id, title: summary.title, entryId: result.entryId });
          succeeded++;
        } catch (err: any) {
          results.push({ id: summary.id, title: summary.title, error: err.message });
          failed++;
        }
      }
    }

    const durationMs = Date.now() - t0;
    res.json({
      connector: connector.name,
      total: summaries.length,
      succeeded,
      failed,
      durationMs,
      results,
    });
  } catch (err: any) {
    res.status(500).json({
      error: 'SYNC_FAILED',
      message: err.message,
      durationMs: Date.now() - t0,
    });
  }
});

// ---- Feishu-specific: list spaces ----

connectorsRouter.get('/feishu/spaces', async (_req: Request, res: Response) => {
  try {
    const { listSpaces } = await import('../../backend/connectors/feishu/client.js');
    const spaces = await listSpaces();
    res.json({ spaces });
  } catch (err: any) {
    res.status(500).json({ error: 'SPACES_FAILED', message: err.message });
  }
});

// ---- Sandbox-specific: list projects ----

connectorsRouter.get('/sandbox/projects', async (_req: Request, res: Response) => {
  try {
    await sandboxConnector.connect();
    const projects = await sandboxConnector.listProjects();
    res.json({ projects });
  } catch (err: any) {
    res.status(500).json({ error: 'PROJECTS_FAILED', message: err.message });
  }
});

// ---- Sandbox-specific: last sync time ----

connectorsRouter.get('/sandbox/last-sync', (_req: Request, res: Response) => {
  res.json({ lastSync: sandboxConnector.getLastSync() });
});

// ---- Sandbox DB: test connection ----

connectorsRouter.get('/sandbox/db-test', async (_req: Request, res: Response) => {
  try {
    if (!config.sandboxDB.enabled) {
      res.json({ enabled: false, message: 'DB mode is disabled. Set SANDBOX_DB_ENABLED=true' });
      return;
    }
    const dbConnector = sandboxConnector as SandboxDBConnector;
    const result = await dbConnector.testConnection();
    res.json({ enabled: true, ...result });
  } catch (err: any) {
    res.status(500).json({ enabled: true, connected: false, error: err.message });
  }
});

// ---- Sandbox DB: list project wikis ----

connectorsRouter.get('/sandbox/wikis', async (req: Request, res: Response) => {
  try {
    if (!config.sandboxDB.enabled) {
      res.status(400).json({ error: 'WIKIS_REQUIRE_DB_MODE', message: 'Project wikis are only available in DB mode' });
      return;
    }
    const dbConnector = sandboxConnector as SandboxDBConnector;
    const { projectId, since } = req.query;
    const docs = await dbConnector.listWikis({
      projectId: projectId as string | undefined,
      since: since as string | undefined,
    });
    res.json({ total: docs.length, documents: docs });
  } catch (err: any) {
    res.status(500).json({ error: 'WIKIS_FAILED', message: err.message });
  }
});

// ---- Sandbox DB: fetch single wiki ----

connectorsRouter.get('/sandbox/wikis/:projectId', async (req: Request, res: Response) => {
  try {
    if (!config.sandboxDB.enabled) {
      res.status(400).json({ error: 'WIKIS_REQUIRE_DB_MODE' });
      return;
    }
    const dbConnector = sandboxConnector as SandboxDBConnector;
    const doc = await dbConnector.fetchWiki(req.params.projectId);
    res.json({ document: doc });
  } catch (err: any) {
    res.status(500).json({ error: 'WIKI_FAILED', message: err.message });
  }
});

// ---- Sandbox DB: sync wiki ----

connectorsRouter.post('/sandbox/wikis/:projectId/sync', async (req: Request, res: Response) => {
  try {
    if (!config.sandboxDB.enabled) {
      res.status(400).json({ error: 'WIKIS_REQUIRE_DB_MODE' });
      return;
    }
    const dbConnector = sandboxConnector as SandboxDBConnector;
    const doc = await dbConnector.fetchWiki(req.params.projectId);
    const result = await importService.importFromConnector(doc);
    res.json({ success: true, entryId: result.entryId, title: doc.title });
  } catch (err: any) {
    res.status(500).json({ error: 'WIKI_SYNC_FAILED', message: err.message });
  }
});

// ---- Sandbox DB: list project tasks ----

connectorsRouter.get('/sandbox/tasks', async (req: Request, res: Response) => {
  try {
    if (!config.sandboxDB.enabled) {
      res.status(400).json({ error: 'TASKS_REQUIRE_DB_MODE' });
      return;
    }
    const dbConnector = sandboxConnector as SandboxDBConnector;
    const { projectId, since } = req.query;
    const docs = await dbConnector.listTasks({
      projectId: projectId as string | undefined,
      since: since as string | undefined,
    });
    res.json({ total: docs.length, documents: docs });
  } catch (err: any) {
    res.status(500).json({ error: 'TASKS_FAILED', message: err.message });
  }
});

// ---- Sandbox DB: fetch single task ----

connectorsRouter.get('/sandbox/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    if (!config.sandboxDB.enabled) {
      res.status(400).json({ error: 'TASKS_REQUIRE_DB_MODE' });
      return;
    }
    const dbConnector = sandboxConnector as SandboxDBConnector;
    const doc = await dbConnector.fetchTask(req.params.taskId);
    res.json({ document: doc });
  } catch (err: any) {
    res.status(500).json({ error: 'TASK_FAILED', message: err.message });
  }
});
