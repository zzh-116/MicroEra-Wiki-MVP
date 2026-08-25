import { describe, it, expect, vi } from 'vitest';
import {
  buildConfirmedEntryMap,
  dryRun,
  migrateFiles,
  objectKeyFor,
  type AuditReport,
  type LocalFileInfo,
  type MigrationDeps,
} from '../../backend/services/file-migration.service.js';

function makeFile(overrides: Partial<LocalFileInfo> = {}): LocalFileInfo {
  return {
    filePath: '/data/zaozhi/a.pdf',
    relPath: 'zaozhi/a.pdf',
    fileName: 'a.pdf',
    ext: '.pdf',
    size: 10,
    sha256: 'abc',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<MigrationDeps> = {}) {
  const objectStorage = {
    isConfigured: vi.fn(() => true),
    putObject: vi.fn().mockResolvedValue({ etag: 'x' }),
    headObject: vi.fn().mockRejectedValue(new Error('not found')),
  };
  const createWikiFile = vi.fn().mockResolvedValue({ id: 10 });
  const updateWikiFile = vi.fn().mockResolvedValue(undefined);
  const deps: MigrationDeps = {
    bucket: 'wiki-docs',
    objectStorage,
    readFile: vi.fn(() => Buffer.from('data')),
    findEntryIds: vi.fn().mockResolvedValue([1]),
    findExistingWikiFile: vi.fn().mockResolvedValue(null),
    createWikiFile,
    updateWikiFile,
    ...overrides,
  };
  return { deps, objectStorage, createWikiFile, updateWikiFile };
}

describe('file migration', () => {
  it('builds stable checksum-based object keys', () => {
    expect(objectKeyFor('abc123', '.pdf')).toBe('documents/abc123.pdf');
    expect(objectKeyFor('xyz', '.pptx')).toBe('documents/xyz.pptx');
  });

  it('builds confirmed entry map and ignores low-confidence and soft-deleted entries', () => {
    const audit: AuditReport = {
      forward: [
        {
          entry_id: 1,
          matched_files: [{ relPath: 'reports/a.pdf', method: 'exact_title', confidence: 0.98 }],
        },
        {
          entry_id: 2,
          matched_files: [{ relPath: 'reports/a.pdf', method: 'source_summary', confidence: 0.9 }],
        },
        {
          entry_id: 3,
          matched_files: [{ relPath: 'reports/b.pdf', method: 'fuzzy_title', confidence: 0.6 }],
        },
        {
          entry_id: 4,
          matched_files: [{ relPath: 'reports/c.pdf', method: 'exact_title', confidence: 0.98 }],
        },
      ],
      soft_deleted_entries: [{ entry_id: 4 }],
    };

    const map = buildConfirmedEntryMap(audit);

    expect(map.get('reports/a.pdf')).toEqual([1, 2]);
    expect(map.get('reports/b.pdf')).toBeUndefined();
    expect(map.get('reports/c.pdf')).toBeUndefined();
  });

  it('reuses the same object for identical SHA-256 and extension (idempotent)', async () => {
    const { deps, objectStorage } = makeDeps();
    objectStorage.headObject
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValue(undefined);
    const files = [
      makeFile({ filePath: '/data/zaozhi/a.pdf', fileName: 'a.pdf', relPath: 'zaozhi/a.pdf' }),
      makeFile({ filePath: '/data/zaozhi/a-copy.pdf', fileName: 'a-copy.pdf', relPath: 'zaozhi/a-copy.pdf' }),
    ];

    const report = await migrateFiles(files, deps);

    expect(objectStorage.putObject).toHaveBeenCalledTimes(1);
    expect(report.success).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.items[0].objectKey).toBe('documents/abc.pdf');
    expect(report.items[1].objectKey).toBe('documents/abc.pdf');
    expect(report.items[1].reason).toBe('reused_object');
  });

  it('uploads separate objects when identical SHA-256 has different extensions', async () => {
    const { deps, objectStorage } = makeDeps();
    objectStorage.headObject
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(undefined);
    const files = [
      makeFile({ fileName: 'a.pdf', ext: '.pdf', relPath: 'zaozhi/a.pdf' }),
      makeFile({ fileName: 'a.txt', ext: '.txt', relPath: 'zaozhi/a.txt' }),
    ];

    const report = await migrateFiles(files, deps);

    expect(objectStorage.putObject).toHaveBeenCalledTimes(2);
    expect(report.items[0].objectKey).toBe('documents/abc.pdf');
    expect(report.items[1].objectKey).toBe('documents/abc.txt');
    expect(objectStorage.putObject.mock.calls[1][3]).toBe('text/plain');
  });

  it('links one object to multiple entries', async () => {
    const { deps, objectStorage, createWikiFile } = makeDeps();
    deps.findEntryIds = vi.fn().mockResolvedValue([1, 2]);
    objectStorage.headObject
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValue(undefined);

    const report = await migrateFiles([makeFile()], deps);

    expect(objectStorage.putObject).toHaveBeenCalledTimes(1);
    expect(createWikiFile).toHaveBeenCalledTimes(2);
    expect(createWikiFile.mock.calls[0][0].entryId).toBe(1);
    expect(createWikiFile.mock.calls[1][0].entryId).toBe(2);
    expect(createWikiFile.mock.calls[0][0].objectKey).toBe('documents/abc.pdf');
    expect(report.items[0].wikiFileIds).toEqual([10, 10]);
  });

  it('skips files without a high-confidence entry match', async () => {
    const { deps, objectStorage, createWikiFile } = makeDeps();
    deps.findEntryIds = vi.fn().mockResolvedValue([]);

    const report = await migrateFiles([makeFile()], deps);

    expect(report.skipped).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.items[0].status).toBe('skipped');
    expect(report.items[0].reason).toBe('no_high_confidence_entry');
    expect(objectStorage.putObject).not.toHaveBeenCalled();
    expect(createWikiFile).not.toHaveBeenCalled();
  });

  it('skips upload when the object already exists', async () => {
    const { deps, objectStorage } = makeDeps();
    objectStorage.headObject.mockResolvedValue(undefined);

    const report = await migrateFiles([makeFile()], deps);

    expect(objectStorage.putObject).not.toHaveBeenCalled();
    expect(report.success).toBe(1);
    expect(report.items[0].reason).toBe('object_already_exists');
    expect(deps.createWikiFile).toHaveBeenCalledTimes(1);
  });

  it('records upload failures without writing the database', async () => {
    const { deps, objectStorage } = makeDeps();
    objectStorage.headObject.mockRejectedValue(new Error('not found'));
    objectStorage.putObject.mockRejectedValue(new Error('UPLOAD_FAILED'));

    const report = await migrateFiles([makeFile()], deps);

    expect(report.failed).toBe(1);
    expect(report.items[0].status).toBe('failed');
    expect(report.items[0].reason).toContain('UPLOAD_FAILED');
    expect(deps.createWikiFile).not.toHaveBeenCalled();
    expect(deps.updateWikiFile).not.toHaveBeenCalled();
  });

  it('records database write failures without deleting the source file', async () => {
    const { deps, objectStorage, createWikiFile } = makeDeps();
    objectStorage.headObject
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValue(undefined);
    createWikiFile.mockRejectedValue(new Error('DB_FAILED'));

    const report = await migrateFiles([makeFile()], deps);

    expect(objectStorage.putObject).toHaveBeenCalledTimes(1);
    expect(report.failed).toBe(1);
    expect(report.items[0].reason).toContain('DB_FAILED');
    expect(report.items[0].status).toBe('failed');
  });

  it('dry run scans and counts without uploading', async () => {
    const { deps, objectStorage } = makeDeps({
      findEntryIds: vi.fn().mockResolvedValueOnce([1]).mockResolvedValueOnce([]),
      findExistingWikiFile: vi.fn().mockResolvedValueOnce({ id: 1 }),
    });
    objectStorage.isConfigured.mockReturnValue(false);
    const files = [
      makeFile(),
      makeFile({ filePath: '/data/reports/r.pdf', relPath: 'reports/r.pdf', fileName: 'r.pdf', ext: '.pdf', sha256: 'def' }),
    ];

    const report = await dryRun(files, deps);

    expect(objectStorage.putObject).not.toHaveBeenCalled();
    expect(deps.readFile).not.toHaveBeenCalled();
    expect(report.fileCount).toBe(2);
    expect(report.noEntryCount).toBe(1);
    expect(report.wikiFilesLinkedCount).toBe(1);
    expect(report.alreadyExistsObjectCount).toBe(0);
    expect(report.toUploadCount).toBe(1);
    expect(report.byDir).toHaveProperty('zaozhi');
    expect(report.byDir).toHaveProperty('reports');
  });
});
