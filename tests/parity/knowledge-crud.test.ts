// P1-03 — Knowledge CRUD + folder CoreService. These tests drive the service
// against a mocked repository so the business invariants (slug uniqueness,
// visibility validation, revision append-on-mutate, soft-delete, folder
// parenting) are verified without a database.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { knowledgeService } from '../../backend/services/knowledge.service.js';

// The repository module is mocked; every method is a vi.fn() we steer per test.
const repo = vi.hoisted(() => ({
  findKbBySlug: vi.fn(),
  createKb: vi.fn(),
  listKbs: vi.fn(),
  findKbById: vi.fn(),
  updateKb: vi.fn(),
  softDeleteKb: vi.fn(),
  kbStats: vi.fn(),
  createFolder: vi.fn(),
  listFolders: vi.fn(),
  findFolderById: vi.fn(),
  moveFolder: vi.fn(),
  softDeleteFolder: vi.fn(),
  listDocuments: vi.fn(),
  findDocumentById: vi.fn(),
  findDocumentByIdIncludingDeleted: vi.fn(),
  updateDocument: vi.fn(),
  softDeleteDocument: vi.fn(),
  restoreDocument: vi.fn(),
  moveDocument: vi.fn(),
  createSource: vi.fn(),
  findSourceById: vi.fn(),
  createRevision: vi.fn(),
  listRevisions: vi.fn(),
  findRevision: vi.fn(),
  latestRevision: vi.fn(),
}));

vi.mock('../../backend/repositories/knowledge.repository.js', () => ({
  knowledgeRepository: repo,
}));

const T = '2026-01-01T00:00:00.000Z';

function kb(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, name: 'Materials', slug: 'materials', description: '', visibility: 'internal',
    embedding_model: 'bge-m3', created_at: T, updated_at: T, deleted_at: null, ...overrides,
  };
}
function folder(overrides: Record<string, unknown> = {}) {
  return { id: 10, kb_id: 1, parent_id: null, name: 'Papers', created_at: T, updated_at: T, deleted_at: null, ...overrides };
}
function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 100, kb_id: 1, source_id: 5, entry_id: null, folder_id: null, title: 'Title',
    summary: '', content: 'content', visibility: 'internal', file_name: null, file_size: 0,
    file_hash: null, parse_status: 'completed', metadata: {}, created_at: T, updated_at: T,
    deleted_at: null, ...overrides,
  };
}
function rev(overrides: Record<string, unknown> = {}) {
  return { id: 200, document_id: 100, revision_no: 1, title: 'Title', content: 'content', checksum: 'abc', created_at: T, ...overrides };
}
function source(overrides: Record<string, unknown> = {}) {
  return { id: 5, kb_id: 1, type: 'manual', name: 'Title', uri: null, checksum: null, metadata: {}, created_at: T, updated_at: T, deleted_at: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kb.create', () => {
  it('creates a KB with an explicit slug', async () => {
    repo.findKbBySlug.mockResolvedValue(undefined);
    repo.createKb.mockResolvedValue(kb());
    const out = await knowledgeService.createKb({ name: 'Materials', slug: 'Materials' });
    expect(out.slug).toBe('materials');
    expect(repo.createKb).toHaveBeenCalledWith(expect.objectContaining({ name: 'Materials', slug: 'materials' }));
  });
  it('rejects an empty name', async () => {
    await expect(knowledgeService.createKb({ name: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
  it('rejects a duplicate slug', async () => {
    repo.findKbBySlug.mockResolvedValue(kb());
    await expect(knowledgeService.createKb({ name: 'Materials', slug: 'materials' })).rejects.toMatchObject({ kind: 'conflict' });
  });
});

describe('kb.list / kb.view / kb.update / kb.delete', () => {
  it('lists KBs with pagination defaults', async () => {
    repo.listKbs.mockResolvedValue({ items: [kb()], total: 1 });
    const out = await knowledgeService.listKbs({});
    expect(out.page).toBe(1);
    expect(out.items).toHaveLength(1);
  });
  it('views a KB with its document count', async () => {
    repo.findKbById.mockResolvedValue(kb());
    repo.kbStats.mockResolvedValue({ documents: 7, chunks: 0 });
    const out = await knowledgeService.viewKb(1);
    expect(out.document_count).toBe(7);
  });
  it('404s a missing KB on view', async () => {
    repo.findKbById.mockResolvedValue(undefined);
    await expect(knowledgeService.viewKb(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
  it('updates a KB', async () => {
    repo.findKbById.mockResolvedValue(kb());
    repo.updateKb.mockResolvedValue(kb({ name: 'New' }));
    const out = await knowledgeService.updateKb(1, { name: 'New' });
    expect(out.name).toBe('New');
  });
  it('rejects an invalid visibility on update', async () => {
    repo.findKbById.mockResolvedValue(kb());
    await expect(knowledgeService.updateKb(1, { visibility: 'nope' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
  it('soft-deletes a KB', async () => {
    repo.findKbById.mockResolvedValue(kb());
    repo.softDeleteKb.mockResolvedValue(true);
    const out = await knowledgeService.deleteKb(1);
    expect(out.deleted).toBe(true);
  });
  it('404s a missing KB on delete', async () => {
    repo.findKbById.mockResolvedValue(undefined);
    await expect(knowledgeService.deleteKb(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});

describe('kb.status / kb.check', () => {
  it('reports status', async () => {
    repo.findKbById.mockResolvedValue(kb());
    repo.kbStats.mockResolvedValue({ documents: 3, chunks: 0 });
    const out = await knowledgeService.kbStatus(1);
    expect(out.ready).toBe(true);
    expect(out.document_count).toBe(3);
  });
  it('checks existence by slug', async () => {
    repo.findKbBySlug.mockResolvedValue(kb());
    const out = await knowledgeService.checkKb({ slug: 'materials' });
    expect(out.exists).toBe(true);
  });
  it('requires kb_id or slug', async () => {
    await expect(knowledgeService.checkKb({})).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});

describe('folders', () => {
  it('creates a folder under a KB', async () => {
    repo.findKbById.mockResolvedValue(kb());
    repo.createFolder.mockResolvedValue(folder());
    const out = await knowledgeService.createFolder({ kb_id: 1, name: 'Papers' });
    expect(out.name).toBe('Papers');
  });
  it('404s creating a folder in a missing KB', async () => {
    repo.findKbById.mockResolvedValue(undefined);
    await expect(knowledgeService.createFolder({ kb_id: 999, name: 'X' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
  it('lists folders', async () => {
    repo.findKbById.mockResolvedValue(kb());
    repo.listFolders.mockResolvedValue([folder()]);
    const out = await knowledgeService.listFolders(1);
    expect(out.items).toHaveLength(1);
  });
  it('moves a folder', async () => {
    repo.findFolderById.mockResolvedValue(folder());
    repo.moveFolder.mockResolvedValue(folder({ parent_id: 11 }));
    const out = await knowledgeService.moveFolder(10, 11);
    expect(out.parent_id).toBe(11);
  });
  it('rejects a folder as its own parent', async () => {
    repo.findFolderById.mockResolvedValue(folder());
    await expect(knowledgeService.moveFolder(10, 10)).rejects.toMatchObject({ kind: 'validation_failed' });
  });
  it('soft-deletes a folder', async () => {
    repo.findFolderById.mockResolvedValue(folder());
    repo.softDeleteFolder.mockResolvedValue(true);
    const out = await knowledgeService.deleteFolder(10);
    expect(out.deleted).toBe(true);
  });
  it('404s deleting a missing folder', async () => {
    repo.findFolderById.mockResolvedValue(undefined);
    await expect(knowledgeService.deleteFolder(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});

describe('documents', () => {
  it('lists documents', async () => {
    repo.listDocuments.mockResolvedValue({ items: [doc()], total: 1 });
    const out = await knowledgeService.listDocuments({ kb_id: 1 });
    expect(out.items).toHaveLength(1);
  });
  it('views a document', async () => {
    repo.findDocumentById.mockResolvedValue(doc());
    expect((await knowledgeService.viewDocument(100)).id).toBe(100);
  });
  it('404s a missing document', async () => {
    repo.findDocumentById.mockResolvedValue(undefined);
    await expect(knowledgeService.viewDocument(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
  it('appends a revision when content changes (K04)', async () => {
    repo.findDocumentById.mockResolvedValue(doc());
    repo.updateDocument.mockResolvedValue(doc({ content: 'new' }));
    repo.latestRevision.mockResolvedValue(rev());
    repo.createRevision.mockResolvedValue(rev({ revision_no: 2 }));
    await knowledgeService.updateDocument(100, { content: 'new' });
    expect(repo.createRevision).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 2 }));
  });
  it('does NOT append a revision for a metadata-only change', async () => {
    repo.findDocumentById.mockResolvedValue(doc());
    repo.updateDocument.mockResolvedValue(doc({ folder_id: 10 }));
    await knowledgeService.updateDocument(100, { folder_id: 10 });
    expect(repo.createRevision).not.toHaveBeenCalled();
  });
  it('soft-deletes and restores a document', async () => {
    repo.findDocumentById.mockResolvedValue(doc());
    repo.softDeleteDocument.mockResolvedValue(true);
    expect((await knowledgeService.deleteDocument(100)).deleted).toBe(true);

    repo.findDocumentByIdIncludingDeleted.mockResolvedValue(doc({ deleted_at: T }));
    repo.restoreDocument.mockResolvedValue(doc());
    expect((await knowledgeService.restoreDocument(100)).deleted_at).toBeNull();
  });
  it('rejects an empty batch', async () => {
    await expect(knowledgeService.batchDeleteDocuments([])).rejects.toMatchObject({ kind: 'validation_failed' });
  });
  it('batch-deletes existing ids and reports missing ones', async () => {
    repo.softDeleteDocument.mockImplementation(async (id: number) => id === 1);
    const out = await knowledgeService.batchDeleteDocuments([1, 2]);
    expect(out.deleted).toBe(1);
    expect(out.missing).toEqual([2]);
  });
});

describe('revisions', () => {
  it('lists revisions', async () => {
    repo.findDocumentById.mockResolvedValue(doc());
    repo.listRevisions.mockResolvedValue([rev()]);
    const out = await knowledgeService.listRevisions(100);
    expect(out.items).toHaveLength(1);
  });
  it('views a revision', async () => {
    repo.findRevision.mockResolvedValue(rev());
    expect((await knowledgeService.viewRevision(100, 1)).revision_no).toBe(1);
  });
  it('404s a missing revision', async () => {
    repo.findRevision.mockResolvedValue(undefined);
    await expect(knowledgeService.viewRevision(100, 99)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
  it('restores a revision and appends a new one', async () => {
    repo.findDocumentById.mockResolvedValueOnce(doc());
    repo.findDocumentById.mockResolvedValueOnce(doc({ content: 'old' }));
    repo.findRevision.mockResolvedValue(rev({ content: 'old' }));
    repo.updateDocument.mockResolvedValue(doc({ content: 'old' }));
    repo.latestRevision.mockResolvedValue(rev({ revision_no: 2 }));
    repo.createRevision.mockResolvedValue(rev({ revision_no: 3 }));
    const out = await knowledgeService.restoreRevision(100, 1);
    expect(out.content).toBe('old');
    expect(repo.createRevision).toHaveBeenCalled();
  });
});

describe('source', () => {
  it('views a source', async () => {
    repo.findSourceById.mockResolvedValue(source());
    expect((await knowledgeService.viewSource(5)).id).toBe(5);
  });
  it('404s a missing source', async () => {
    repo.findSourceById.mockResolvedValue(undefined);
    await expect(knowledgeService.viewSource(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
