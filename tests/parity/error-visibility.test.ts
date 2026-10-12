// Batch C (F10/F11) — rerank fallback and model probe failures must be traceable.
//
// F10: RerankService.rerank now stamps a `reason` on the fallback result and logs
// a structured warning, so a degraded ordering is not silently presented as a
// real rerank.
// F11: modelService.test now returns an `error` field + logs on probe failure, and
// model.rerank_test forwards the rerank fallback `reason`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RerankService } from '../../backend/services/rerank.service.js';
import { modelService } from '../../backend/services/model.service.js';
import { modelRepository } from '../../backend/repositories/model.repository.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';
import { rerankService } from '../../backend/services/rerank.service.js';

function model(over: Record<string, unknown> = {}): any {
  return {
    id: 1, name: 'M', kind: 'embedding', provider: 'ollama', model_name: 'bge',
    base_url: null, config: {}, is_default: false, status: 'active', created_by: null,
    created_at: '', updated_at: '', deleted_at: null, ...over,
  };
}

describe('F10 — rerank fallback is traceable', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('sets a reason and logs a warning when the provider fails', async () => {
    const svc = new RerankService({ name: 'boom', rerank: async () => { throw new Error('provider down'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await svc.rerank({ query: 'q', documents: [{ text: 'a' }, { text: 'b' }] });
    expect(result.fallback).toBe(true);
    expect(result.reason).toBe('provider down');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('provider down'));
  });

  it('omits reason on the success path', async () => {
    const svc = new RerankService({ name: 'ok', rerank: async () => [100, 50] });
    const result = await svc.rerank({ query: 'q', documents: [{ text: 'a' }, { text: 'b' }] });
    expect(result.fallback).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

describe('F11 — model.test surfaces failures', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('reports an error field and logs when the probe fails', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'embedding' }));
    vi.spyOn(ollamaEmbedder, 'embed').mockRejectedValue(new Error('embedding down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r: any = await modelService.test(1);
    expect(r.reachable).toBe(false);
    expect(r.error).toBe('embedding down');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('embedding down'));
  });

  it('omits the error field on success', async () => {
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'embedding' }));
    vi.spyOn(ollamaEmbedder, 'embed').mockResolvedValue([0.1, 0.2]);
    const r: any = await modelService.test(1);
    expect(r.reachable).toBe(true);
    expect(r.error).toBeUndefined();
  });
});

describe('F11 — model.rerank_test forwards the fallback reason', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('forwards reason when rerank falls back', async () => {
    vi.spyOn(rerankService, 'rerank').mockResolvedValue({
      items: [], provider: 'fallback', fallback: true, timed_out: true, elapsed_ms: 1, reason: 'llm down',
    });
    const r: any = await modelService.rerankTest({ query: 'q', documents: [{ text: 'a' }] });
    expect(r.fallback).toBe(true);
    expect(r.reason).toBe('llm down');
  });
});
