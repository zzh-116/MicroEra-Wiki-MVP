// Connector API Routes — manage data source connectors and trigger syncs.
// Connectors bring structured data from external platforms (Sandbox, Feishu,
// Confluence, GitLab Wiki, Notion) into the Wiki pipeline without going through
// the document parser.

import { Router, Request, Response } from 'express';
import { ConnectorRegistry } from '../../backend/connectors/index.js';
import { importService } from '../../backend/services/import.service.js';
import { sandboxConnector } from '../../backend/connectors/sandbox/index.js';

export const connectorsRouter = Router();

// Register built-in connectors at startup
ConnectorRegistry.register('sandbox', () => sandboxConnector);

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
    const { projectId } = req.body || {};
    const docs = await connector.list({ projectId });
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

    const { projectId, dryRun } = req.body || {};

    // 1. List all documents from the connector
    const summaries = await connector.list({ projectId });

    if (dryRun) {
      res.json({
        connector: connector.name,
        dryRun: true,
        total: summaries.length,
        documents: summaries,
      });
      return;
    }

    // 2. Fetch full detail and import each document
    const results: Array<{ id: string; title: string; entryId?: number; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const summary of summaries) {
      try {
        const doc = await connector.detail(summary.id);

        // Import directly — skip parser, use connector-produced markdown
        const result = await importService.importFromConnector(doc);

        results.push({ id: summary.id, title: summary.title, entryId: result.entryId });
        succeeded++;
      } catch (err: any) {
        results.push({ id: summary.id, title: summary.title, error: err.message });
        failed++;
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
