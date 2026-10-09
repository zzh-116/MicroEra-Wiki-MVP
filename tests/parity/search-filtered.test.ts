// P3-06 — search.filtered + search.metadata: method dispatch, filter threading
// into the repository, and the filter-schema endpoint.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retrievalService } from '../../backend/services/retrieval.service.js';
import { retrievalRepository } from '../../backend/repositories/retrieval.repository.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';

describe('P3-06 search.filtered + search.metadata', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('search.metadata exposes methods and filterable fields', () => {
    const meta: any = retrievalService.metadata();
    expect(meta.methods).toEqual(['vector', 'lexical', 'hybrid']);
    expect(meta.filterable_fields.map((f: any) => f.name)).toEqual([
      'strategy', 'visibility', 'document_ids', 'title_contains', 'created_after', 'created_before',
    ]);
  });

  it('filteredSearch dispatches to the chosen method (default vector)', async () => {
    const vec = vi.spyOn(retrievalService, 'vectorSearch').mockResolvedValue([]);
    const lex = vi.spyOn(retrievalService, 'lexicalSearch').mockResolvedValue([]);
    const hyb = vi.spyOn(retrievalService, 'hybridSearch').mockResolvedValue([]);

    await retrievalService.filteredSearch({ query: 'q', method: 'vector', filters: { visibility: 'public' } });
    expect(vec).toHaveBeenCalledWith(expect.objectContaining({ filters: { visibility: 'public' } }));
    expect(lex).not.toHaveBeenCalled();
    expect(hyb).not.toHaveBeenCalled();

    await retrievalService.filteredSearch({ query: 'q', method: 'lexical' });
    expect(lex).toHaveBeenCalled();
    await retrievalService.filteredSearch({ query: 'q', method: 'hybrid' });
    expect(hyb).toHaveBeenCalled();
  });

  it('filteredSearch defaults to vector when method is omitted', async () => {
    const vec = vi.spyOn(retrievalService, 'vectorSearch').mockResolvedValue([]);
    await retrievalService.filteredSearch({ query: 'q' });
    expect(vec).toHaveBeenCalled();
  });

  it('filteredSearch rejects an empty query', async () => {
    await expect(retrievalService.filteredSearch({ query: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('vectorSearch threads metadata filters into the repository query', async () => {
    vi.spyOn(ollamaEmbedder, 'embed').mockResolvedValue([0.1, 0.2]);
    const repo = vi.spyOn(retrievalRepository, 'vectorSearch').mockResolvedValue([]);
    await retrievalService.vectorSearch({ query: 'q', filters: { strategy: 'markdown', document_ids: [1, 2] } });
    expect(repo).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { strategy: 'markdown', document_ids: [1, 2] } }),
    );
  });
});
