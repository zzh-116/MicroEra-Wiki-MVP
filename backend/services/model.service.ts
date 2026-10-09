// Model service (P8 M01/M03) — the model.* operation layer over the model
// registry. M01 covers list/view/create/update/delete/test/set_default; M03
// covers rerank_list/rerank_test. `test`/`rerank_test` are offline-safe: a
// provider that is unreachable yields a structured result (reachable:false or
// fallback:true) rather than throwing, so the workspace still works without a
// live Ollama/DeepSeek backend.
import { modelRepository, type ModelKind } from '../repositories/model.repository.js';
import { ServiceError } from './knowledge.service.js';
import { getLLMProvider } from '../llm/index.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import { rerankService } from './rerank.service.js';

const KINDS: ModelKind[] = ['llm', 'embedding', 'rerank'];
const PROBE_TIMEOUT_MS = 1500;

export interface RerankTestInput {
  query?: string;
  documents?: Array<{ text: string; score?: number }>;
  model_id?: number;
  top_k?: number;
}

export class ModelService {
  async list(input: { kind?: string; page?: number; page_size?: number }) {
    return modelRepository.listModels({ kind: input.kind, page: input.page, pageSize: input.page_size });
  }

  async view(id: number) {
    const model = await modelRepository.findModelById(id);
    if (!model) throw new ServiceError('resource_not_found', 'model not found');
    return model;
  }

  async create(input: {
    name?: string;
    kind?: string;
    provider?: string;
    model_name?: string;
    base_url?: string;
    config?: Record<string, unknown>;
    is_default?: boolean;
    created_by?: number;
  }) {
    const name = (input.name ?? '').trim();
    if (!name) throw new ServiceError('validation_failed', 'name is required');
    const kind = (input.kind ?? '').trim() as ModelKind;
    if (!KINDS.includes(kind)) throw new ServiceError('validation_failed', `kind must be one of ${KINDS.join(', ')}`);
    const modelName = (input.model_name ?? '').trim();
    if (!modelName) throw new ServiceError('validation_failed', 'model_name is required');
    const provider = (input.provider ?? '').trim() || 'ollama';

    const model = await modelRepository.createModel({
      name,
      kind,
      provider,
      modelName,
      baseUrl: input.base_url?.trim() || null,
      config: input.config ?? {},
      isDefault: input.is_default ?? false,
      createdBy: input.created_by ?? null,
    });

    if (model.is_default) await modelRepository.setDefault(model.id);
    return modelRepository.findModelById(model.id);
  }

  async update(
    id: number,
    patch: { name?: string; provider?: string; model_name?: string; base_url?: string; config?: Record<string, unknown>; status?: string },
  ) {
    await this.view(id);
    const model = await modelRepository.updateModel(id, {
      name: patch.name,
      provider: patch.provider,
      modelName: patch.model_name,
      baseUrl: patch.base_url,
      config: patch.config,
      status: patch.status,
    });
    return model;
  }

  async remove(id: number) {
    await this.view(id);
    await modelRepository.softDeleteModel(id);
    return { deleted: true, id };
  }

  /** model.test — probe a model's provider without failing the request. */
  async test(id: number) {
    const model = await this.view(id);
    const started = Date.now();
    let reachable = false;
    let detail = '';

    try {
      if (model.kind === 'llm') {
        const provider = getLLMProvider();
        await provider.chat([{ role: 'user', content: 'ping' }], { maxTokens: 1 }, AbortSignal.timeout(PROBE_TIMEOUT_MS));
        reachable = true;
        detail = 'llm provider responded';
      } else if (model.kind === 'embedding') {
        const vec = await ollamaEmbedder.embed('ping');
        reachable = Array.isArray(vec) && vec.length > 0;
        detail = reachable ? 'embedding provider responded' : 'embedding provider returned an empty vector';
      } else {
        const r = await rerankService.rerank({ query: 'ping', documents: [{ text: 'ping' }] });
        reachable = !r.fallback;
        detail = r.fallback ? 'rerank provider unavailable (fallback ordering used)' : 'rerank provider responded';
      }
    } catch (err: any) {
      detail = err?.message ?? 'probe failed';
    }

    return {
      model_id: model.id,
      name: model.name,
      kind: model.kind,
      provider: model.provider,
      model_name: model.model_name,
      reachable,
      latency_ms: Date.now() - started,
      detail,
      checked_at: new Date().toISOString(),
    };
  }

  async setDefault(id: number) {
    const model = await modelRepository.setDefault(id);
    if (!model) throw new ServiceError('resource_not_found', 'model not found');
    return model;
  }

  /** model.rerank_list — enumerate rerank-capable models/providers. */
  async rerankList() {
    const registered = await modelRepository.listByKind('rerank');
    const builtin = [{ name: 'llm', default: registered.length === 0, available: true }];
    const models = registered.map((m) => ({ id: m.id, name: m.name, provider: m.provider, model_name: m.model_name, default: m.is_default }));
    return { providers: builtin, models, total: models.length };
  }

  /** model.rerank_test — score candidate documents against a query. */
  async rerankTest(input: RerankTestInput) {
    const query = (input.query ?? '').trim();
    if (!query) throw new ServiceError('validation_failed', 'query is required');
    const docs = Array.isArray(input.documents) ? input.documents : [];
    if (docs.length === 0) throw new ServiceError('validation_failed', 'documents is required');
    const result = await rerankService.rerank({ query, documents: docs, top_k: input.top_k });
    return {
      query,
      model_id: input.model_id ?? null,
      provider: result.provider,
      fallback: result.fallback,
      timed_out: result.timed_out,
      elapsed_ms: result.elapsed_ms,
      items: result.items,
    };
  }
}

export const modelService = new ModelService();
