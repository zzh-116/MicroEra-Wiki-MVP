// Datasource repository (P7) — persistence for connector-backed data sources and
// their sync history. Datasources are soft-deleted; sync logs are append-only
// (a new row per run, never overwritten) so datasource.logs stays a true history.
import { BaseRepository } from './base.js';
import { datasources, datasourceSyncLogs } from '../db/schema.js';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

export interface DatasourceRow {
  id: number;
  name: string;
  connector: string;
  config: Record<string, unknown>;
  schedule: string;
  status: 'active' | 'paused' | 'error';
  cursor: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DatasourceSyncLogRow {
  id: string;
  datasource_id: number;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function datasourceToRow(r: any): DatasourceRow {
  return {
    id: r.id,
    name: r.name,
    connector: r.connector,
    config: r.config,
    schedule: r.schedule,
    status: r.status,
    cursor: r.cursor,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function logToRow(r: any): DatasourceSyncLogRow {
  return {
    id: r.id,
    datasource_id: r.datasourceId,
    status: r.status,
    total: r.total,
    created: r.created,
    updated: r.updated,
    skipped: r.skipped,
    errors: r.errors,
    started_at: r.startedAt ? r.startedAt.toISOString() : null,
    finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
  };
}

export class DatasourceRepository extends BaseRepository {
  // ── Datasources ───────────────────────────────────────────────────────────
  async createDatasource(input: {
    name: string;
    connector: string;
    config?: Record<string, unknown>;
    schedule?: string;
    createdBy?: number | null;
  }): Promise<DatasourceRow> {
    const [row] = await this.db
      .insert(datasources)
      .values({
        name: input.name,
        connector: input.connector,
        config: input.config ?? {},
        schedule: input.schedule ?? '',
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return datasourceToRow(row);
  }

  async findDatasourceById(id: number): Promise<DatasourceRow | undefined> {
    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, id), isNull(datasources.deletedAt)))
      .limit(1);
    return rows[0] ? datasourceToRow(rows[0]) : undefined;
  }

  async listDatasources(params?: { page?: number; pageSize?: number }): Promise<{ items: DatasourceRow[]; total: number }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = isNull(datasources.deletedAt);
    const [{ value: total }] = await this.db.select({ value: count() }).from(datasources).where(where);
    const rows = await this.db
      .select()
      .from(datasources)
      .where(where)
      .orderBy(desc(datasources.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(datasourceToRow), total: Number(total) };
  }

  async updateDatasource(
    id: number,
    patch: { name?: string; connector?: string; config?: Record<string, unknown>; schedule?: string; status?: string; cursor?: string | null },
  ): Promise<DatasourceRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.connector !== undefined) data.connector = patch.connector;
    if (patch.config !== undefined) data.config = patch.config;
    if (patch.schedule !== undefined) data.schedule = patch.schedule;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.cursor !== undefined) data.cursor = patch.cursor;
    const [row] = await this.db.update(datasources).set(data).where(eq(datasources.id, id)).returning();
    return row ? datasourceToRow(row) : undefined;
  }

  async softDeleteDatasource(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(datasources)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(datasources.id, id), isNull(datasources.deletedAt)))
      .returning({ id: datasources.id });
    return !!row;
  }

  // ── Sync logs ─────────────────────────────────────────────────────────────
  async createSyncLog(input: {
    id: string;
    datasourceId: number;
    status?: string;
    startedAt?: Date;
  }): Promise<DatasourceSyncLogRow> {
    const [row] = await this.db
      .insert(datasourceSyncLogs)
      .values({
        id: input.id,
        datasourceId: input.datasourceId,
        status: (input.status as any) ?? 'running',
        startedAt: input.startedAt ?? new Date(),
      })
      .returning();
    return logToRow(row);
  }

  async updateSyncLog(
    id: string,
    patch: { status?: string; total?: number; created?: number; updated?: number; skipped?: number; errors?: string[]; finishedAt?: Date | null },
  ): Promise<DatasourceSyncLogRow | undefined> {
    const data: Record<string, unknown> = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.total !== undefined) data.total = patch.total;
    if (patch.created !== undefined) data.created = patch.created;
    if (patch.updated !== undefined) data.updated = patch.updated;
    if (patch.skipped !== undefined) data.skipped = patch.skipped;
    if (patch.errors !== undefined) data.errors = patch.errors;
    if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
    const [row] = await this.db.update(datasourceSyncLogs).set(data).where(eq(datasourceSyncLogs.id, id)).returning();
    return row ? logToRow(row) : undefined;
  }

  async listSyncLogs(datasourceId: number, params?: { page?: number; pageSize?: number }): Promise<{ items: DatasourceSyncLogRow[]; total: number }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = eq(datasourceSyncLogs.datasourceId, datasourceId);
    const [{ value: total }] = await this.db.select({ value: count() }).from(datasourceSyncLogs).where(where);
    const rows = await this.db
      .select()
      .from(datasourceSyncLogs)
      .where(where)
      .orderBy(desc(datasourceSyncLogs.createdAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(logToRow), total: Number(total) };
  }
}

export const datasourceRepository = new DatasourceRepository();
