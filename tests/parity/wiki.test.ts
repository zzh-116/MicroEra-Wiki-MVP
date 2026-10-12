// P5 — wiki service: generate (synthesis + grounding), CRUD + versioning
// (edit/diff/revert/revisions), sources/citations, and the link graph, with the
// repository + retrieval + LLM-free synthesis mocked out for determinism.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wikiService } from '../../backend/services/wiki.service.js';
import { wikiRepository } from '../../backend/repositories/wiki.repository.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';
import { knowledgeChunkRepository } from '../../backend/repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../../backend/repositories/knowledge.repository.js';

function wiki(id = 1, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    title: 'Zeolites',
    summary: '',
    content: '# Zeolites\n\n## Section 1\n\nbody',
    kb_id: 1,
    status: 'draft',
    revision_no: 1,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function hit(document_id: number, chunk_id = `c${document_id}`): any {
  return { chunk_id, document_id, title: `Doc ${document_id}`, text: `chunk text ${document_id}`, heading: `H${document_id}`, score: 0.9 };
}

describe('P5 wiki service — generate', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('rejects a missing title/question', async () => {
    await expect(wikiService.generate({})).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('synthesizes a wiki with revision + grounding sources', async () => {
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(2), hit(3)]);
    vi.spyOn(wikiRepository, 'createWiki').mockResolvedValue(wiki(1, { status: 'completed' }));
    const rev = vi.spyOn(wikiRepository, 'createRevision').mockImplementation(async (r: any) => ({ id: 1, wiki_id: r.wikiId, ...r, created_at: '' }));
    const add = vi.spyOn(wikiRepository, 'addSources').mockResolvedValue();

    const r = await wikiService.generate({ title: 'Zeolites', kb_id: 1, method: 'hybrid', top_k: 4 });

    expect(r.wiki_id).toBe(1);
    expect(r.status).toBe('completed');
    expect(r.source_count).toBe(2);
    expect(rev).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 1 }));
    expect(add).toHaveBeenCalledWith(1, [
      { chunkId: 'c2', documentId: 2, index: 1 },
      { chunkId: 'c3', documentId: 3, index: 2 },
    ]);
  });
});

describe('P5 wiki service — CRUD + versioning', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('create validates title and records revision #1', async () => {
    await expect(wikiService.create({ title: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
    vi.spyOn(wikiRepository, 'createWiki').mockResolvedValue(wiki(1, { status: 'draft' }));
    const rev = vi.spyOn(wikiRepository, 'createRevision').mockImplementation(async (r: any) => ({ id: 1, wiki_id: r.wikiId, ...r, created_at: '' }));
    const w = await wikiService.create({ title: 'X', content: 'body' });
    expect(w.status).toBe('draft');
    expect(rev).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 1, content: 'body' }));
  });

  it('edit appends a revision and bumps revision_no', async () => {
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(wiki(1, { revision_no: 1, content: 'old' }));
    vi.spyOn(wikiRepository, 'updateWiki').mockImplementation(async (id, patch) => ({ ...wiki(1), ...patch, revision_no: 2 }));
    const rev = vi.spyOn(wikiRepository, 'createRevision').mockImplementation(async (r: any) => ({ id: 2, wiki_id: r.wikiId, ...r, created_at: '' }));

    const w: any = await wikiService.edit(1, { content: 'new' });
    expect(w.revision_no).toBe(2);
    expect(rev).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 2, content: 'new' }));
  });

  it('diff reports added/removed lines between revisions', async () => {
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(wiki(1));
    vi.spyOn(wikiRepository, 'listRevisions').mockResolvedValue([
      { id: 2, wiki_id: 1, revision_no: 2, title: 't', content: 'a\nb\nc', checksum: '', created_at: '' },
      { id: 1, wiki_id: 1, revision_no: 1, title: 't', content: 'a\nb', checksum: '', created_at: '' },
    ]);
    vi.spyOn(wikiRepository, 'findRevision').mockImplementation(async (_id, no) => ({
      id: no, wiki_id: 1, revision_no: no, title: 't',
      content: no === 1 ? 'a\nb' : 'a\nb\nc', checksum: '', created_at: '',
    }));

    const d: any = await wikiService.diff(1, {});
    expect(d.from_revision_no).toBe(1);
    expect(d.to_revision_no).toBe(2);
    expect(d.added_lines).toBe(1);
    expect(d.removed_lines).toBe(0);
    expect(d.changed).toBe(true);
  });

  it('revert restores content from a revision as a new revision', async () => {
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(wiki(1, { revision_no: 3, content: 'latest', summary: 'stale summary' }));
    vi.spyOn(wikiRepository, 'findRevision').mockResolvedValue({ id: 1, wiki_id: 1, revision_no: 1, title: 'old title', content: 'old content', checksum: '', created_at: '' });
    const upd = vi.spyOn(wikiRepository, 'updateWiki').mockImplementation(async (id, patch) => ({ ...wiki(1), ...patch, revision_no: 4 }));
    const rev = vi.spyOn(wikiRepository, 'createRevision').mockImplementation(async (r: any) => ({ id: 4, wiki_id: r.wikiId, ...r, created_at: '' }));

    const r: any = await wikiService.revert(1, 1);
    expect(r.new_revision_no).toBe(4);
    // E6: summary must be restored to match the reverted content (derived from the
    // revision content since wiki_revisions does not persist the original summary).
    expect(upd).toHaveBeenCalledWith(1, expect.objectContaining({ content: 'old content', summary: 'old content', revisionNo: 4 }));
    expect(rev).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 4, content: 'old content' }));
  });
});

describe('P5 wiki service — links / graph / citations', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('link rejects self-links and unknown wikis', async () => {
    await expect(wikiService.link(1, 1)).rejects.toMatchObject({ kind: 'validation_failed' });
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(undefined);
    await expect(wikiService.link(1, 2)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('link creates a directed edge', async () => {
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(wiki(1));
    vi.spyOn(wikiRepository, 'createLink').mockResolvedValue({ id: 1, source_wiki_id: 1, target_wiki_id: 2, created_at: '' });
    const r: any = await wikiService.link(1, 2);
    expect(r.source_wiki_id).toBe(1);
    expect(r.target_wiki_id).toBe(2);
  });

  it('neighbors returns reachable nodes up to depth', async () => {
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(wiki(1));
    vi.spyOn(wikiRepository, 'listAllLinks').mockResolvedValue([
      { id: 1, source_wiki_id: 1, target_wiki_id: 2, created_at: '' },
      { id: 2, source_wiki_id: 2, target_wiki_id: 3, created_at: '' },
    ]);
    vi.spyOn(wikiRepository, 'listWikisByIds').mockResolvedValue([wiki(2), wiki(3)]);
    const r: any = await wikiService.neighbors(1, 2);
    expect(r.neighbors).toHaveLength(2);
  });

  it('verify flags unresolved sources', async () => {
    vi.spyOn(wikiRepository, 'findWikiById').mockResolvedValue(wiki(1));
    vi.spyOn(wikiRepository, 'listSources').mockResolvedValue([
      { id: 1, wiki_id: 1, chunk_id: 'c1', document_id: 1, index: 1, created_at: '' },
    ]);
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue(undefined);
    const r: any = await wikiService.verify(1);
    expect(r.resolved).toBe(0);
    expect(r.total).toBe(1);
  });

  it('citationRead resolves a chunk + document title', async () => {
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue({
      id: 'c1', document_id: 2, text: 'full', strategy: 'markdown', heading: '## H',
      index: 0, start_char: 0, end_char: 4, metadata: {}, created_at: '', updated_at: '',
    } as any);
    vi.spyOn(knowledgeRepository, 'findDocumentById').mockResolvedValue({ title: 'Doc 2' } as any);
    const r: any = await wikiService.citationRead('c1');
    expect(r.title).toBe('Doc 2');
  });
});
