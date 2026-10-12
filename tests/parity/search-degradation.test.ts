// Batch C (F3) — vector search must not degrade silently to keyword.
//
// `SearchService.semanticSearch` previously caught a vector failure and returned
// keyword hits with no observable marker, presenting a degraded result as a full
// vector result. It now distinguishes:
//   - vector threw / store unavailable  → results tagged `degraded:{reason,fallback}`
//   - vector returned no hits (normal hybrid) → untagged keyword fallback
// `contentSearch` logs a structured reason instead of silently swallowing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchService } from '../../backend/services/search.service.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';

function entry(id = 1, overrides: Record<string, unknown> = {}): any {
  return {
    id, title: `zeolite ${id}`, file_name: undefined, entry_type: 'tech', summary: 'zeolite',
    content: `zeolite content ${id}`, visibility: 'public', created_at: '', updated_at: '',
    tags: [], ...overrides,
  };
}

function seedKeyword(entries: any[]) {
  vi.spyOn(entryRepository, 'findMany').mockResolvedValue({ entries, total: entries.length } as any);
}

describe('F3 — semanticSearch vector degradation', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tags keyword fallback results as degraded when embedding fails', async () => {
    vi.spyOn(vectorRepository, 'isReady').mockReturnValue(true);
    vi.spyOn(ollamaEmbedder, 'embed').mockRejectedValue(new Error('embedding down'));
    seedKeyword([entry(1), entry(2)]);

    const results = await searchService.semanticSearch('zeolite');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.degraded).toEqual({ reason: 'embedding down', fallback: 'keyword' });
    }
  });

  it('tags results as degraded when the vector store is unavailable', async () => {
    vi.spyOn(vectorRepository, 'isReady').mockReturnValue(false);
    seedKeyword([entry(1)]);

    const results = await searchService.semanticSearch('zeolite');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].degraded).toEqual({ reason: 'vector store unavailable', fallback: 'keyword' });
  });

  it('does NOT mark an empty vector result as degraded (normal hybrid fallback)', async () => {
    vi.spyOn(vectorRepository, 'isReady').mockReturnValue(true);
    vi.spyOn(ollamaEmbedder, 'embed').mockResolvedValue([0.1, 0.2, 0.3]);
    vi.spyOn(vectorRepository, 'search').mockResolvedValue([]);
    seedKeyword([entry(1)]);

    const results = await searchService.semanticSearch('zeolite');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].degraded).toBeUndefined();
  });

  it('logs a structured reason when contentSearch degrades to keyword', async () => {
    vi.spyOn(vectorRepository, 'isReady').mockReturnValue(true);
    vi.spyOn(ollamaEmbedder, 'embed').mockRejectedValue(new Error('embedding down'));
    seedKeyword([entry(1)]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const results = await searchService.contentSearch('zeolite');
    expect(results.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to content keyword'));
  });
});
