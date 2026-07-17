// Ollama Embedding Service — BGE-M3 / nomic-embed-text via Ollama
// Uses Ollama's native batch API: one request for all texts.
//
// embedBatch returns structured results — callers can distinguish partial
// success from complete failure, and failed chunks are explicitly recorded
// rather than silently dropped.
//
import { config } from '../config.js';

export interface EmbedBatchResult {
  /** Successfully generated embeddings (same indices as input texts) */
  vectors: number[][];
  /** Every failed chunk with its index and error message */
  failed: Array<{ index: number; error: string }>;
}

export class OllamaEmbedder {
  private url: string;
  private model: string;
  private keepWarmInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.url = config.ollama.url;
    this.model = config.ollama.embeddingModel;
  }

  /**
   * Warm up the embedding model — sends a dummy request to force Ollama
   * to load the model into GPU/RAM. Run on startup.
   */
  async warmup(): Promise<void> {
    try {
      const t0 = Date.now();
      await this.embed('warmup');
      console.log(`[Embedder] Warmup complete: ${Date.now() - t0}ms (model: ${this.model})`);
    } catch (err: any) {
      console.warn(`[Embedder] Warmup failed (Ollama may not be running): ${err.message}`);
    }
  }

  /**
   * Keep the model warm by periodically sending a lightweight request.
   * Prevents Ollama from unloading the model due to inactivity.
   * Call once on startup; interval is cleared if embedding fails repeatedly.
   */
  startKeepWarm(intervalMs: number = 4 * 60 * 1000): void {
    if (this.keepWarmInterval) return;
    this.keepWarmInterval = setInterval(async () => {
      try {
        await this.embed('keepwarm');
      } catch {
        // Silent — if it keeps failing, stop trying
        if (this.keepWarmInterval) {
          clearInterval(this.keepWarmInterval);
          this.keepWarmInterval = null;
        }
      }
    }, intervalMs);
    console.log(`[Embedder] Keep-warm started (interval: ${intervalMs / 1000}s)`);
  }

  /** Embed a single text — throws on failure */
  async embed(text: string): Promise<number[]> {
    const clean = text.replace(/\x00/g, '');
    const response = await fetch(`${this.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: clean }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Ollama embedding failed: ${response.status}`);
    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }

  /**
   * Embed multiple texts — returns structured result with per-chunk status.
   *
   * Never silently discards failures. Callers MUST inspect `result.failed`
   * to decide whether to proceed with partial data.
   */
  async embedBatch(texts: string[]): Promise<EmbedBatchResult> {
    if (texts.length === 0) return { vectors: [], failed: [] };

    // Single-text path: collect structured failure instead of returning [[]]
    if (texts.length === 1) {
      try {
        const vec = await this.embed(texts[0]);
        return { vectors: [vec], failed: [] };
      } catch (err: any) {
        console.warn(`[Embedder] Chunk 0 failed: ${err.message}`);
        return { vectors: [], failed: [{ index: 0, error: err.message }] };
      }
    }

    const cleanTexts = texts.map((t) => t.replace(/\x00/g, ''));
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: cleanTexts }),
        signal: AbortSignal.timeout(120000), // 2 min for large batches
      });

      if (!response.ok) {
        // Fallback to sequential if batch not supported
        console.warn(`[Embedder] Batch API returned ${response.status}, falling back to sequential`);
        return this.embedSequential(cleanTexts);
      }

      const data = await response.json() as Record<string, unknown>;
      console.log(`[Embedder] Batch response keys: ${Object.keys(data).join(', ')}`);

      // Ollama batch: { embeddings: [[...], [...], ...] }
      if (data.embeddings && Array.isArray(data.embeddings)) {
        console.log(`[Embedder] Batch done: ${texts.length} texts → ${(data.embeddings as unknown[]).length} vectors in ${Date.now() - startTime}ms (native batch)`);
        return { vectors: data.embeddings as number[][], failed: [] };
      }

      // Ollama single: { embedding: [...] }
      if (data.embedding && Array.isArray(data.embedding)) {
        console.log(`[Embedder] Single embedding returned for batch request, concurrent fallback`);
        return this.embedConcurrent(cleanTexts);
      }
    } catch (err: any) {
      console.warn(`[Embedder] Batch request failed: ${err.message}, falling back to concurrent`);
    }

    // Fallback: concurrent individual requests
    return this.embedConcurrent(cleanTexts);
  }

  /** Fallback: concurrent individual requests (8 parallel) — collects failures */
  private async embedConcurrent(texts: string[]): Promise<EmbedBatchResult> {
    const start = Date.now();
    const vectors: number[][] = new Array(texts.length);
    const failed: EmbedBatchResult['failed'] = [];
    let cursor = 0;
    let successCount = 0;

    const workers = Array.from({ length: Math.min(8, texts.length) }, async () => {
      while (cursor < texts.length) {
        const i = cursor++;
        try {
          vectors[i] = await this.embed(texts[i]);
          successCount++;
        } catch (err: any) {
          console.warn(`[Embedder] Chunk ${i}/${texts.length} failed: ${err.message}`);
          vectors[i] = []; // empty placeholder — caller knows this is failed via `failed` array
          failed.push({ index: i, error: err.message });
        }
      }
    });
    await Promise.all(workers);
    console.log(`[Embedder] Concurrent done: ${texts.length} texts → ${successCount} ok, ${failed.length} failed in ${Date.now() - start}ms`);
    return { vectors, failed };
  }

  /** Fallback: sequential (slowest, most reliable) — collects failures */
  private async embedSequential(texts: string[]): Promise<EmbedBatchResult> {
    const vectors: number[][] = [];
    const failed: EmbedBatchResult['failed'] = [];
    for (let i = 0; i < texts.length; i++) {
      try {
        vectors.push(await this.embed(texts[i]));
      } catch (err: any) {
        console.warn(`[Embedder] Chunk ${i}/${texts.length} failed (sequential): ${err.message}`);
        vectors.push([]); // placeholder — flagged in `failed`
        failed.push({ index: i, error: err.message });
      }
    }
    return { vectors, failed };
  }
}

export const ollamaEmbedder = new OllamaEmbedder();
