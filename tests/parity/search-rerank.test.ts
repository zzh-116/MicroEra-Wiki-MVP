// P3-04 — Rerank adapter: provider interface, deterministic fallback on
// failure/timeout, and a scoring trace (original score vs rerank score).
import { describe, it, expect } from 'vitest';
import { RerankService, type RerankProvider } from '../../backend/services/rerank.service.js';

function makeProvider(scores: number[]): RerankProvider {
  return { name: 'test', rerank: async () => scores };
}

describe('P3-04 rerank adapter', () => {
  it('reorders by rerank score and preserves the original score trace', async () => {
    const svc = new RerankService(makeProvider([25, 100, 50]));
    const result = await svc.rerank({
      query: 'q',
      documents: [{ text: 'a', score: 0.9 }, { text: 'b', score: 0.8 }, { text: 'c', score: 0.7 }],
    });
    expect(result.fallback).toBe(false);
    expect(result.provider).toBe('test');
    // b (1.0) → c (0.5) → a (0.25)
    expect(result.items.map((i) => i.index)).toEqual([1, 2, 0]);
    expect(result.items[0].rerank_score).toBeCloseTo(1.0);
    expect(result.items[0].original_score).toBeCloseTo(0.8);
    expect(result.items[0].text).toBe('b');
  });

  it('caps the result to top_k', async () => {
    const svc = new RerankService(makeProvider([100, 90, 80, 70]));
    const docs = ['a', 'b', 'c', 'd'].map((text) => ({ text }));
    const result = await svc.rerank({ query: 'q', documents: docs, top_k: 2 });
    expect(result.items).toHaveLength(2);
  });

  it('falls back to original ordering when the provider throws', async () => {
    const svc = new RerankService({ name: 'boom', rerank: async () => { throw new Error('down'); } });
    const result = await svc.rerank({ query: 'q', documents: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] });
    expect(result.fallback).toBe(true);
    expect(result.provider).toBe('fallback');
    expect(result.timed_out).toBe(false);
    expect(result.items.map((i) => i.index)).toEqual([0, 1, 2]);
    // rerank score mirrors the original score in fallback.
    expect(result.items[0].rerank_score).toBe(result.items[0].original_score);
  });

  it('marks timed_out when the provider aborts', async () => {
    const svc = new RerankService({
      name: 'slow',
      rerank: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
    });
    const result = await svc.rerank({ query: 'q', documents: [{ text: 'a' }, { text: 'b' }] });
    expect(result.fallback).toBe(true);
    expect(result.timed_out).toBe(true);
  });

  it('falls back when the provider returns the wrong score count', async () => {
    const svc = new RerankService(makeProvider([50])); // expected 3
    const result = await svc.rerank({ query: 'q', documents: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] });
    expect(result.fallback).toBe(true);
  });

  it('rejects an empty query or empty candidate list', async () => {
    const svc = new RerankService(makeProvider([50]));
    await expect(svc.rerank({ query: '  ', documents: [{ text: 'a' }] })).rejects.toMatchObject({ kind: 'validation_failed' });
    await expect(svc.rerank({ query: 'q', documents: [] })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});
