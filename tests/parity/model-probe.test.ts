// Batch B (F6) — real Provider Probe success AND failure paths.
//
// `tests/parity/model.test.ts` only asserted that `modelService.test()` does not
// throw and that `reachable` is a boolean — a permanently-unreachable provider
// still passed (F6). This suite drives the REAL probe end-to-end with no mock of
// the provider: a local loopback HTTP stub stands in for Ollama's OpenAI-compatible
// `/v1/chat/completions` and native `/api/embeddings`, and a freshly-closed port
// stands in for an unreachable provider. Each case re-points `config` via env and
// `vi.resetModules()` so the real singleton (`getLLMProvider` / `ollamaEmbedder`)
// is constructed against the stub.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';

let server: Server;
let stubUrl: string;
let deadUrl: string;

const ENV_KEYS = ['LLM_PROVIDER', 'OLLAMA_URL', 'OLLAMA_CHAT_MODEL', 'OLLAMA_EMBED_MODEL'] as const;
const envSnapshot: Record<string, string | undefined> = {};

function model(over: Record<string, unknown> = {}): any {
  return {
    id: 1,
    name: 'Local LLM',
    kind: 'llm',
    provider: 'ollama',
    model_name: 'qwen2.5:7b',
    base_url: null,
    config: {},
    is_default: false,
    status: 'active',
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...over,
  };
}

async function getClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

/** Fresh module graph → fresh config + fresh singletons bound to current env. */
async function loadModelService() {
  vi.resetModules();
  const [{ modelService }, { modelRepository }] = await Promise.all([
    import('../../backend/services/model.service.js'),
    import('../../backend/repositories/model.repository.js'),
  ]);
  return { modelService, modelRepository };
}

beforeAll(async () => {
  for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];

  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (url.includes('/api/embeddings')) {
        res.end(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }));
      } else if (url.includes('/v1/chat/completions')) {
        res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  stubUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  deadUrl = `http://127.0.0.1:${await getClosedPort()}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
});

afterEach(() => vi.restoreAllMocks());

describe('F6 — model.test probe: real llm provider success/failure', () => {
  it('reports reachable:true when the llm provider responds', async () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_URL = stubUrl;
    process.env.OLLAMA_CHAT_MODEL = 'qwen';
    const { modelService, modelRepository } = await loadModelService();
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'llm' }));

    const r: any = await modelService.test(1);
    expect(r.model_id).toBe(1);
    expect(r.reachable).toBe(true);
    expect(r.detail).toBe('llm provider responded');
    expect(typeof r.latency_ms).toBe('number');
  });

  it('reports reachable:false when the llm provider is unreachable', async () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_URL = deadUrl;
    process.env.OLLAMA_CHAT_MODEL = 'qwen';
    const { modelService, modelRepository } = await loadModelService();
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'llm' }));

    const r: any = await modelService.test(1);
    expect(r.reachable).toBe(false);
  });
});

describe('F6 — model.test probe: real embedding provider success/failure', () => {
  it('reports reachable:true when the embedding provider responds', async () => {
    process.env.OLLAMA_URL = stubUrl;
    process.env.OLLAMA_EMBED_MODEL = 'bge-m3';
    const { modelService, modelRepository } = await loadModelService();
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'embedding' }));

    const r: any = await modelService.test(1);
    expect(r.reachable).toBe(true);
    expect(r.detail).toBe('embedding provider responded');
  });

  it('reports reachable:false when the embedding provider is unreachable', async () => {
    process.env.OLLAMA_URL = deadUrl;
    process.env.OLLAMA_EMBED_MODEL = 'bge-m3';
    const { modelService, modelRepository } = await loadModelService();
    vi.spyOn(modelRepository, 'findModelById').mockResolvedValue(model({ kind: 'embedding' }));

    const r: any = await modelService.test(1);
    expect(r.reachable).toBe(false);
  });
});
