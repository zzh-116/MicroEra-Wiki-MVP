// P3-01 — Vector TopK: global scored ranking with DB-level ACL filters.
// The service embeds the query and delegates to RetrievalRepository (which owns
// the SQL where soft-delete + visibility ACL live). Here we assert the service
// layer contract: validation, filter passthrough, and score = 1 - distance.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  vectorSearch: vi.fn(),
}));

vi.mock('../../backend/embedding/ollama.js', () => ({
  ollamaEmbedder: { embed: mocks.embed },
}));
vi.mock('../../backend/repositories/retrieval.repository.js', () => ({
  retrievalRepository: { vectorSearch: mocks.vectorSearch },
}));

const { retrievalService } = await import('../../backend/services/retrieval.service.js');

const HIT = {
  chunk_id: 'c1',
  document_id: 7,
  distance: 0.2,
  text: 'pore aperture text',
  heading: 'Methods',
  strategy: 'markdown',
  title: 'Paper',
  kb_id: 1,
  visibility: 'internal',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.embed.mockResolvedValue([0.1, 0.2, 0.3]);
  mocks.vectorSearch.mockResolvedValue([HIT]);
});

describe('P3-01 search.vector service', () => {
  it('embeds the query, delegates, and maps score = 1 - distance', async () => {
    const result = await retrievalService.vectorSearch({ query: 'MOF pore aperture' });
    expect(mocks.embed).toHaveBeenCalledWith('MOF pore aperture');
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(0.8);
    expect(result[0].chunk_id).toBe('c1');
  });

  it('passes scope + ACL flags through to the repository', async () => {
    await retrievalService.vectorSearch({ query: 'q', kb_id: 1, folder_id: 2, top_k: 5, is_internal: false });
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        queryVector: [0.1, 0.2, 0.3],
        topK: 5,
        kbId: 1,
        folderId: 2,
        isInternal: false,
      }),
    );
  });

  it('defaults top_k to 10 and clamps to the [1, 100] range', async () => {
    await retrievalService.vectorSearch({ query: 'q' });
    expect(mocks.vectorSearch).toHaveBeenCalledWith(expect.objectContaining({ topK: 10 }));

    await retrievalService.vectorSearch({ query: 'q', top_k: 500 });
    expect(mocks.vectorSearch).toHaveBeenLastCalledWith(expect.objectContaining({ topK: 100 }));

    await retrievalService.vectorSearch({ query: 'q', top_k: 0 });
    expect(mocks.vectorSearch).toHaveBeenLastCalledWith(expect.objectContaining({ topK: 1 }));
  });

  it('rejects an empty query before embedding', async () => {
    await expect(retrievalService.vectorSearch({ query: '   ' })).rejects.toMatchObject({ kind: 'validation_failed' });
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it('returns an empty list when nothing matches', async () => {
    mocks.vectorSearch.mockResolvedValue([]);
    const result = await retrievalService.vectorSearch({ query: 'no hits' });
    expect(result).toEqual([]);
  });
});
