// P7 — datasource service: connector binding CRUD, connection test, preview,
// and the sync pipeline (fetch → import → cursor advance + sync log), with the
// repository and import pipeline mocked for determinism. Uses the built-in
// 'local' connector (self-registering) as the credential-free source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { datasourceService } from '../../backend/services/datasource.service.js';
import { datasourceRepository } from '../../backend/repositories/datasource.repository.js';
import { importService } from '../../backend/services/import.service.js';
import { ConnectorRegistry } from '../../backend/connectors/index.js';
import '../../backend/connectors/local/index.js';

function ds(id = 1, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    name: 'Local Sample',
    connector: 'local',
    config: {},
    schedule: '',
    status: 'active',
    cursor: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function imported(already = false): any {
  return {
    success: true,
    entryId: 1,
    stages: already
      ? [{ stage: 'parse', status: 'skipped', ms: 0, detail: 'already imported — entry #1' }]
      : [{ stage: 'chunk', status: 'success', ms: 1, detail: '1 chunks (markdown)' }],
    errors: [],
  };
}

function logRow(id: string): any {
  return { id, datasource_id: 1, status: 'running', total: 0, created: 0, updated: 0, skipped: 0, errors: [], started_at: null, finished_at: null, created_at: new Date().toISOString() };
}

describe('P7 datasource service — D01 (types/create/view/connect/preview)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('types enumerates the registered connectors including local', async () => {
    const r: any = await datasourceService.types();
    expect(r.connectors.some((c: any) => c.name === 'local')).toBe(true);
    expect(r.total).toBe(r.connectors.length);
  });

  it('create rejects an empty name', async () => {
    await expect(datasourceService.create({})).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('create rejects an unknown connector', async () => {
    await expect(datasourceService.create({ name: 'x', connector: 'nope' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('create persists a datasource for a known connector', async () => {
    const create = vi.spyOn(datasourceRepository, 'createDatasource').mockResolvedValue(ds());
    const d: any = await datasourceService.create({ name: 'Local Sample', connector: 'local' });
    expect(d.name).toBe('Local Sample');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ connector: 'local' }));
  });

  it('view throws resource_not_found when missing', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(undefined);
    await expect(datasourceService.view(99)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('connect runs the bound connector connect()', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    const r: any = await datasourceService.connect(1);
    expect(r.connected).toBe(true);
    expect(r.connector).toBe('local');
  });

  it('preview returns the connector summaries without importing', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    const r: any = await datasourceService.preview({ datasource_id: 1 });
    expect(r.total).toBe(3);
    expect(r.documents.length).toBe(3);
  });
});

describe('P7 datasource service — D02 (sync/changes/cursor/logs)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('sync imports fetched docs and advances the cursor', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    vi.spyOn(datasourceRepository, 'createSyncLog').mockImplementation(async (l: any) => logRow(l.id));
    const updateLog = vi.spyOn(datasourceRepository, 'updateSyncLog').mockResolvedValue(undefined);
    const updateDs = vi.spyOn(datasourceRepository, 'updateDatasource').mockResolvedValue(undefined);
    vi.spyOn(importService, 'importFromConnector').mockResolvedValue(imported());

    const r: any = await datasourceService.sync({ datasource_id: 1 });

    expect(r.created).toBe(3);
    expect(r.skipped).toBe(0);
    expect(typeof r.cursor).toBe('string');
    expect(r.cursor.length).toBeGreaterThan(0);
    expect(updateDs).toHaveBeenCalledWith(1, expect.objectContaining({ cursor: expect.any(String) }));
    expect(updateDs.mock.calls[0][1]).toMatchObject({ cursor: r.cursor });
    expect(updateLog).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'succeeded', total: 3 }));
  });

  it('sync marks already-imported docs as skipped', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    vi.spyOn(datasourceRepository, 'createSyncLog').mockImplementation(async (l: any) => logRow(l.id));
    vi.spyOn(datasourceRepository, 'updateSyncLog').mockResolvedValue(undefined);
    vi.spyOn(datasourceRepository, 'updateDatasource').mockResolvedValue(undefined);
    vi.spyOn(importService, 'importFromConnector').mockResolvedValue(imported(true));

    const r: any = await datasourceService.sync({ datasource_id: 1 });

    expect(r.skipped).toBe(3);
    expect(r.created).toBe(0);
  });

  it('sync dry-run reports total without importing', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    vi.spyOn(datasourceRepository, 'createSyncLog').mockImplementation(async (l: any) => logRow(l.id));
    vi.spyOn(datasourceRepository, 'updateSyncLog').mockResolvedValue(undefined);
    const imp = vi.spyOn(importService, 'importFromConnector');

    const r: any = await datasourceService.sync({ datasource_id: 1, dryRun: true });

    expect(r.dryRun).toBe(true);
    expect(r.total).toBe(3);
    expect(imp).not.toHaveBeenCalled();
  });

  it('changes uses the saved cursor when since is absent', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds(1, { cursor: '2026-10-01T00:00:00.000Z' }));
    const r: any = await datasourceService.changes({ datasource_id: 1 });
    // local docs are all updated in Jan 2026 — before the Oct cursor → 0 changes
    expect(r.changed).toBe(0);
    expect(r.since).toBe('2026-10-01T00:00:00.000Z');
  });

  it('changes with an old since returns the local docs', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    const r: any = await datasourceService.changes({ datasource_id: 1, since: '2026-01-01T00:00:00.000Z' });
    expect(r.changed).toBe(3);
  });
});

describe('P7 datasource service — D04 (schedule/pause/resume/delete)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('schedule requires a non-empty schedule', async () => {
    await expect(datasourceService.schedule(1, '   ')).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('schedule persists the cron string', async () => {
    vi.spyOn(datasourceRepository, 'updateDatasource').mockResolvedValue(ds(1, { schedule: '0 3 * * *' }));
    const d: any = await datasourceService.schedule(1, '0 3 * * *');
    expect(d.schedule).toBe('0 3 * * *');
  });

  it('pause sets status paused', async () => {
    vi.spyOn(datasourceRepository, 'updateDatasource').mockResolvedValue(ds(1, { status: 'paused' }));
    const r: any = await datasourceService.pause(1);
    expect(r.status).toBe('paused');
  });

  it('resume sets status active', async () => {
    vi.spyOn(datasourceRepository, 'updateDatasource').mockResolvedValue(ds(1, { status: 'active' }));
    const r: any = await datasourceService.resume(1);
    expect(r.status).toBe('active');
  });

  it('remove soft-deletes the datasource', async () => {
    vi.spyOn(datasourceRepository, 'findDatasourceById').mockResolvedValue(ds());
    const del = vi.spyOn(datasourceRepository, 'softDeleteDatasource').mockResolvedValue(true);
    const r: any = await datasourceService.remove(1);
    expect(r.deleted).toBe(true);
    expect(del).toHaveBeenCalledWith(1);
  });
});
