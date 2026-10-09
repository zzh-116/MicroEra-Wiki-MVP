// P3-03 — Hybrid RRF: deterministic reciprocal-rank fusion of vector + lexical
// ranked lists. `fuseReciprocalRank` is a pure function, so its ranking is
// asserted exactly; hybridSearch/explainSearch are tested by spying on the two
// source methods to keep the fusion + score-trace logic deterministic.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retrievalService, fuseReciprocalRank } from '../../backend/services/retrieval.service.js';

const META = {
  document_id: 7,
  text: 'pore aperture text',
  heading: 'Methods',
  strategy: 'markdown',
  title: 'Paper',
  kb_id: 1,
  visibility: 'internal',
};

describe('fuseReciprocalRank (pure)', () => {
  it('merges two ranked lists and orders by descending fused score', () => {
    const fused = fuseReciprocalRank(
      [{ chunk_id: 'a' }, { chunk_id: 'b' }],
      [{ chunk_id: 'b' }, { chunk_id: 'c' }],
    );
    expect(fused.map((f) => f.chunk_id)).toEqual(['b', 'a', 'c']);
  });

  it('scores an entry present in both lists above single-list entries', () => {
    const fused = fuseReciprocalRank(
      [{ chunk_id: 'a' }, { chunk_id: 'b' }],
      [{ chunk_id: 'b' }, { chunk_id: 'c' }],
    );
    const [b, a, c] = fused;
    // b: 1/61 + 1/62; a: 1/61; c: 1/62
    expect(b.rrf_score).toBeCloseTo(1 / 61 + 1 / 62);
    expect(a.rrf_score).toBeCloseTo(1 / 61);
    expect(c.rrf_score).toBeCloseTo(1 / 62);
    expect(b.vector_rank).toBe(2);
    expect(b.lexical_rank).toBe(1);
  });

  it('is deterministic for identical input (no random tie-breaking)', () => {
    const args = [
      [{ chunk_id: 'x' }, { chunk_id: 'y' }],
      [{ chunk_id: 'y' }, { chunk_id: 'x' }],
    ] as const;
    const first = fuseReciprocalRank(args[0], args[1]);
    const second = fuseReciprocalRank(args[0], args[1]);
    expect(second.map((f) => [f.chunk_id, f.rrf_score])).toEqual(first.map((f) => [f.chunk_id, f.rrf_score]));
  });
});

describe('P3-03 search.hybrid / search.explain service', () => {
  beforeEach(() => {
    vi.spyOn(retrievalService, 'vectorSearch').mockResolvedValue([
      { chunk_id: 'a', score: 0.9, distance: 0.1, ...META },
      { chunk_id: 'b', score: 0.8, distance: 0.2, ...META },
    ] as any);
    vi.spyOn(retrievalService, 'lexicalSearch').mockResolvedValue([
      { chunk_id: 'b', score: 0.5, ...META },
      { chunk_id: 'c', score: 0.4, ...META },
    ] as any);
  });

  afterEach(() => vi.restoreAllMocks());

  it('fuses vector + lexical and returns metadata-joined hits', async () => {
    const result = await retrievalService.hybridSearch({ query: 'q', top_k: 5 });
    expect(result.map((r) => r.chunk_id)).toEqual(['b', 'a', 'c']);
    expect(result[0]).toMatchObject({ title: 'Paper', kb_id: 1, visibility: 'internal' });
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('caps the fused list to top_k', async () => {
    const result = await retrievalService.hybridSearch({ query: 'q', top_k: 2 });
    expect(result).toHaveLength(2);
  });

  it('explainSearch returns a per-source score trace', async () => {
    const result = await retrievalService.explainSearch({ query: 'q', top_k: 5 });
    const b = result[0];
    expect(b.chunk_id).toBe('b');
    expect(b.vector).toEqual({ rank: 2, score: 0.8 });
    expect(b.lexical).toEqual({ rank: 1, score: 0.5 });
    expect(b.rrf_score).toBeCloseTo(1 / 61 + 1 / 62);

    const c = result.find((r) => r.chunk_id === 'c')!;
    expect(c.vector).toBeNull();
    expect(c.lexical).toEqual({ rank: 2, score: 0.4 });
  });

  it('rejects an empty query', async () => {
    await expect(retrievalService.hybridSearch({ query: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
    await expect(retrievalService.explainSearch({ query: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});
