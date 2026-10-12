// Rerank service (P3-04) — a pluggable rerank adapter with a provider
// interface, a timeout, and a deterministic fallback to original ordering.
// search.rerank scores a caller-supplied candidate list against a query and
// returns a scoring trace (original score vs rerank score per item).
import { getLLMProvider } from '../llm/index.js';
import { ServiceError } from './knowledge.service.js';

export interface RerankCandidate {
  text: string;
  /** Optional caller-provided score (preserved in the trace). */
  score?: number;
}

export interface RerankItem {
  index: number;
  text: string;
  original_score: number;
  /** Normalized to 0..1 in the success path. */
  rerank_score: number;
}

export interface RerankResult {
  items: RerankItem[];
  provider: string;
  /** True when the provider failed/timed out and original ordering was kept. */
  fallback: boolean;
  timed_out: boolean;
  elapsed_ms: number;
  /** Present when fallback is true — why the provider path was abandoned. */
  reason?: string;
}

export interface RerankInput {
  query: string;
  documents: RerankCandidate[];
  top_k?: number;
}

/** Pluggable rerank provider (adapter). Returns one relevance score (0..100)
 *  per document, parallel to the input. */
export interface RerankProvider {
  readonly name: string;
  rerank(query: string, documents: string[]): Promise<number[]>;
}

/** LLM-backed cross-encoder approximation: ask the chat model to score each
 *  document's relevance to the query on a 0–100 scale and return a JSON array.
 *  A real cross-encoder can replace this by implementing RerankProvider. */
export class LlmRerankProvider implements RerankProvider {
  readonly name = 'llm';
  constructor(private timeoutMs = 15000) {}

  async rerank(query: string, documents: string[]): Promise<number[]> {
    const provider = getLLMProvider();
    const raw = await provider.chat(
      [{ role: 'user', content: buildRerankPrompt(query, documents) }],
      { temperature: 0, maxTokens: 512 },
      AbortSignal.timeout(this.timeoutMs),
    );
    return parseScores(raw, documents.length);
  }
}

function buildRerankPrompt(query: string, documents: string[]): string {
  const body = documents.map((d, i) => `[${i}] ${d.slice(0, 400)}`).join('\n');
  return [
    'You are a relevance reranker. Score each document for its relevance to the query on a scale of 0 (irrelevant) to 100 (highly relevant).',
    'Return ONLY a JSON array of numbers, one score per document, in the same order. No prose, no markdown.',
    '',
    `Query: ${query}`,
    '',
    'Documents:',
    body,
  ].join('\n');
}

/** Extract and validate the model's JSON score array. Throws on anything that
 *  is not a well-formed array of the expected length, so the caller can fall
 *  back instead of serving garbage scores. */
function parseScores(raw: string, count: number): number[] {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim();
  const m = cleaned.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('no JSON array in rerank output');
  const arr = JSON.parse(m[0]);
  if (!Array.isArray(arr)) throw new Error('rerank output is not an array');
  const nums = arr.slice(0, count).map((x) => Number(x));
  if (nums.length < count || nums.some((n) => !Number.isFinite(n))) {
    throw new Error('rerank output length/type mismatch');
  }
  return nums;
}

const FALLBACK_PROVIDER = 'fallback';
const MAX_TOP_K = 100;

export class RerankService {
  constructor(private provider: RerankProvider = new LlmRerankProvider()) {}

  async rerank(input: RerankInput): Promise<RerankResult> {
    const query = (input.query ?? '').trim();
    if (!query) throw new ServiceError('validation_failed', 'query is required');
    const docs = Array.isArray(input.documents) ? input.documents : [];
    if (docs.length === 0) throw new ServiceError('validation_failed', 'documents is required');
    const topK = Math.min(Math.max(input.top_k ?? docs.length, 1), MAX_TOP_K);

    const texts = docs.map((d) => d.text ?? '');
    const originalOf = (i: number): number => docs[i].score ?? (docs.length - i);
    const started = Date.now();

    let scores: number[];
    let fallback = false;
    let timedOut = false;
    let providerName = this.provider.name;
    let reason: string | undefined;
    try {
      scores = await this.provider.rerank(query, texts);
      if (!scores || scores.length !== texts.length) throw new Error('provider returned wrong score count');
    } catch (err: any) {
      fallback = true;
      timedOut = /abort|timeout/i.test(`${err?.name ?? ''} ${err?.message ?? ''}`);
      providerName = FALLBACK_PROVIDER;
      reason = err?.message ?? 'rerank provider failed';
      console.warn(`[Rerank] provider '${this.provider.name}' failed${timedOut ? ' (timeout)' : ''}, falling back to original order: ${reason}`);
    }

    const items: RerankItem[] = docs.map((d, i) => {
      const original = originalOf(i);
      return {
        index: i,
        text: d.text ?? '',
        original_score: original,
        // Fallback keeps the original ordering and mirrors the original score;
        // success re-orders by the provider's normalized score.
        rerank_score: fallback ? original : (scores![i] / 100),
      };
    });

    if (!fallback) {
      items.sort((a, b) => b.rerank_score - a.rerank_score);
    }

    return {
      items: items.slice(0, topK),
      provider: providerName,
      fallback,
      timed_out: timedOut,
      elapsed_ms: Date.now() - started,
      reason,
    };
  }
}

export const rerankService = new RerankService();
