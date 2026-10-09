// P3-02 — Lexical search (Postgres FTS baseline): the service normalizes the
// query, clamps top_k, and delegates to RetrievalRepository.lexicalSearch (which
// owns the to_tsvector/to_tsquery/ts_rank SQL + ACL). Assert the service
// contract here.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  lexicalSearch: vi.fn(),
}));

vi.mock('../../backend/repositories/retrieval.repository.js', () => ({
  retrievalRepository: { lexicalSearch: mocks.lexicalSearch },
}));

const { retrievalService } = await import('../../backend/services/retrieval.service.js');

const HIT = {
  chunk_id: 'c1',
  document_id: 7,
  score: 0.42,
  text: 'pore aperture text',
  heading: 'Methods',
  strategy: 'markdown',
  title: 'Paper',
  kb_id: 1,
  visibility: 'internal',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lexicalSearch.mockResolvedValue([HIT]);
});

describe('P3-02 search.lexical service', () => {
  it('normalizes the query and delegates', async () => {
    const result = await retrievalService.lexicalSearch({ query: '  MOF   Pore  Aperture ' });
    expect(mocks.lexicalSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'mof pore aperture' }));
    expect(result).toHaveLength(1);
    expect(result[0].chunk_id).toBe('c1');
    expect(result[0].score).toBe(0.42);
  });

  it('passes scope + ACL flags through to the repository', async () => {
    await retrievalService.lexicalSearch({ query: 'q', kb_id: 1, folder_id: 2, top_k: 5, is_internal: false });
    expect(mocks.lexicalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 5, kbId: 1, folderId: 2, isInternal: false }),
    );
  });

  it('clamps top_k to the [1, 100] range', async () => {
    await retrievalService.lexicalSearch({ query: 'q', top_k: 0 });
    expect(mocks.lexicalSearch).toHaveBeenLastCalledWith(expect.objectContaining({ topK: 1 }));
    await retrievalService.lexicalSearch({ query: 'q', top_k: 999 });
    expect(mocks.lexicalSearch).toHaveBeenLastCalledWith(expect.objectContaining({ topK: 100 }));
  });

  it('rejects an empty query', async () => {
    await expect(retrievalService.lexicalSearch({ query: '   ' })).rejects.toMatchObject({ kind: 'validation_failed' });
    expect(mocks.lexicalSearch).not.toHaveBeenCalled();
  });

  it('returns an empty list when nothing matches', async () => {
    mocks.lexicalSearch.mockResolvedValue([]);
    const result = await retrievalService.lexicalSearch({ query: 'no hits' });
    expect(result).toEqual([]);
  });
});
