// Datasource service (P7) — the datasource.* operation layer over the connector
// registry. A datasource is a saved connector binding (name + connector + config
// + optional schedule + sync cursor). D01 covers types/list/create/view/connect/
// preview; D02 covers sync/changes/cursor/logs; D04 covers schedule/pause/resume/
// delete. Sync drives the real import pipeline (connector Document → entry →
// chunk → embed → vector) with idempotency via the sync log.
import { randomUUID } from 'node:crypto';
import { datasourceRepository } from '../repositories/datasource.repository.js';
import { ConnectorRegistry } from '../connectors/index.js';
import { importService } from './import.service.js';
import type { Document, DocumentSummary } from '../connectors/types.js';
import { ServiceError } from './knowledge.service.js';

const PREVIEW_LIMIT = 20;

function asListParams(input: { projectId?: string; keyword?: string; since?: string }) {
  return {
    projectId: input.projectId,
    keyword: input.keyword,
    since: input.since,
  };
}

export class DatasourceService {
  // ── D01: types / list / create / view / connect / preview ─────────────────
  async types() {
    const connectors = ConnectorRegistry.getAll().map((c) => ({ name: c.name, label: c.label, version: c.version }));
    return { connectors, total: connectors.length };
  }

  async list(input: { page?: number; page_size?: number }) {
    return datasourceRepository.listDatasources({ page: input.page, pageSize: input.page_size });
  }

  async create(input: { name?: string; connector?: string; config?: Record<string, unknown>; schedule?: string; created_by?: number }) {
    const name = (input.name ?? '').trim();
    if (!name) throw new ServiceError('validation_failed', 'name is required');
    const connector = (input.connector ?? '').trim();
    if (!connector) throw new ServiceError('validation_failed', 'connector is required');
    if (!ConnectorRegistry.has(connector)) {
      throw new ServiceError('validation_failed', `unknown connector: ${connector} (available: ${ConnectorRegistry.list().join(', ')})`);
    }
    return datasourceRepository.createDatasource({
      name,
      connector,
      config: input.config ?? {},
      schedule: input.schedule ?? '',
      createdBy: input.created_by ?? null,
    });
  }

  async view(datasourceId: number) {
    const ds = await datasourceRepository.findDatasourceById(datasourceId);
    if (!ds) throw new ServiceError('resource_not_found', 'datasource not found');
    return ds;
  }

  async connect(datasourceId: number) {
    const ds = await this.view(datasourceId);
    const connector = ConnectorRegistry.get(ds.connector);
    try {
      await connector.connect();
    } catch (err: any) {
      throw new ServiceError('internal', `connect failed: ${err?.message ?? 'unknown error'}`);
    }
    return { datasource_id: ds.id, connector: ds.connector, connected: true, checked_at: new Date().toISOString() };
  }

  async preview(input: { datasource_id: number; projectId?: string; keyword?: string }) {
    const ds = await this.view(input.datasource_id);
    const connector = ConnectorRegistry.get(ds.connector);
    await connector.connect();
    const docs = await connector.list(asListParams({ projectId: input.projectId, keyword: input.keyword }));
    return {
      datasource_id: ds.id,
      connector: ds.connector,
      total: docs.length,
      documents: docs.slice(0, PREVIEW_LIMIT),
    };
  }

  // ── D02: sync / changes / cursor / logs ───────────────────────────────────
  async sync(input: { datasource_id: number; since?: string; dryRun?: boolean; projectId?: string; keyword?: string }) {
    const ds = await this.view(input.datasource_id);
    const connector = ConnectorRegistry.get(ds.connector);
    await connector.connect();

    const logId = `dslog_${randomUUID()}`;
    await datasourceRepository.createSyncLog({ id: logId, datasourceId: ds.id, status: 'running' });

    try {
      const since = input.since ?? ds.cursor ?? undefined;
      const params = asListParams({ projectId: input.projectId, keyword: input.keyword, since });

      // Bulk path (in-process connectors) vs N+1 (HTTP connectors).
      const connectorAny = connector as any;
      let docs: Document[] = [];
      if (typeof connectorAny.fetchAll === 'function') {
        docs = await connectorAny.fetchAll(params);
      } else {
        const summaries = await connector.list(params);
        docs = [];
        for (const summary of summaries) docs.push(await connector.detail(summary.id));
      }

      if (input.dryRun) {
        await datasourceRepository.updateSyncLog(logId, { status: 'succeeded', total: docs.length, finishedAt: new Date() });
        return { datasource_id: ds.id, log_id: logId, dryRun: true, total: docs.length, created: 0, updated: 0, skipped: 0 };
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];
      const results: Array<Record<string, unknown>> = [];

      for (const doc of docs) {
        try {
          const r = await importService.importFromConnector(doc);
          const alreadyImported = (r.stages ?? []).some((s) => s.detail?.startsWith('already imported'));
          if (alreadyImported) skipped++;
          else created++;
          results.push({ id: doc.id, title: doc.title, entry_id: r.entryId, status: alreadyImported ? 'skipped' : 'created' });
        } catch (err: any) {
          failed++;
          errors.push(`${doc.id}: ${err?.message ?? 'import failed'}`);
          results.push({ id: doc.id, title: doc.title, error: err?.message ?? 'import failed', status: 'failed' });
        }
      }

      const newCursor = new Date().toISOString();
      await datasourceRepository.updateDatasource(ds.id, { cursor: newCursor });
      await datasourceRepository.updateSyncLog(logId, {
        status: failed > 0 ? 'failed' : 'succeeded',
        total: docs.length,
        created,
        updated,
        skipped,
        errors,
        finishedAt: new Date(),
      });

      return {
        datasource_id: ds.id,
        log_id: logId,
        total: docs.length,
        created,
        updated,
        skipped,
        failed,
        cursor: newCursor,
        results,
      };
    } catch (err: any) {
      await datasourceRepository.updateSyncLog(logId, { status: 'failed', errors: [err?.message ?? 'sync failed'], finishedAt: new Date() });
      throw err;
    }
  }

  async changes(input: { datasource_id: number; since?: string }) {
    const ds = await this.view(input.datasource_id);
    const connector = ConnectorRegistry.get(ds.connector);
    await connector.connect();
    const since = input.since ?? ds.cursor ?? undefined;
    const docs: DocumentSummary[] = await connector.list(asListParams({ since }));
    return {
      datasource_id: ds.id,
      connector: ds.connector,
      since: since ?? null,
      changed: docs.length,
      documents: docs,
    };
  }

  async cursor(datasourceId: number) {
    const ds = await this.view(datasourceId);
    return { datasource_id: ds.id, cursor: ds.cursor ?? null };
  }

  async logs(input: { datasource_id: number; page?: number; page_size?: number }) {
    await this.view(input.datasource_id);
    return datasourceRepository.listSyncLogs(input.datasource_id, { page: input.page, pageSize: input.page_size });
  }

  // ── D04: schedule / pause / resume / delete ────────────────────────────────
  async schedule(datasourceId: number, schedule?: string) {
    const cron = (schedule ?? '').trim();
    if (!cron) throw new ServiceError('validation_failed', 'schedule is required');
    const ds = await datasourceRepository.updateDatasource(datasourceId, { schedule: cron });
    if (!ds) throw new ServiceError('resource_not_found', 'datasource not found');
    return ds;
  }

  async pause(datasourceId: number) {
    const ds = await datasourceRepository.updateDatasource(datasourceId, { status: 'paused' });
    if (!ds) throw new ServiceError('resource_not_found', 'datasource not found');
    return { datasource_id: ds.id, status: 'paused' };
  }

  async resume(datasourceId: number) {
    const ds = await datasourceRepository.updateDatasource(datasourceId, { status: 'active' });
    if (!ds) throw new ServiceError('resource_not_found', 'datasource not found');
    return { datasource_id: ds.id, status: 'active' };
  }

  async remove(datasourceId: number) {
    await this.view(datasourceId);
    await datasourceRepository.softDeleteDatasource(datasourceId);
    return { deleted: true, id: datasourceId };
  }
}

export const datasourceService = new DatasourceService();
