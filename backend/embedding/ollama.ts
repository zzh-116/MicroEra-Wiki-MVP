// Ollama Embedding Service — BGE-M3 / nomic-embed-text via Ollama
// Uses Ollama's native batch API: one request for all texts
import { config } from '../config.js';

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

  /** Embed a single text */
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

  /** Embed multiple texts — uses Ollama native batch API (single HTTP request) */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.length === 1) {
      try { return [await this.embed(texts[0])]; } catch { return [[]]; }
    }

    // Ollama batch: pass array as `input`, get back `embeddings` array
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
        return data.embeddings as number[][];
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

  /** Fallback: concurrent individual requests (8 parallel) */
  private async embedConcurrent(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    const results: number[][] = new Array(texts.length);
    let cursor = 0;
    let successCount = 0;
    let failCount = 0;
    const workers = Array.from({ length: Math.min(8, texts.length) }, async () => {
      while (cursor < texts.length) {
        const i = cursor++;
        try {
          results[i] = await this.embed(texts[i]);
          successCount++;
        } catch (err: any) {
          console.warn(`[Embedder] Chunk ${i} failed: ${err.message}`);
          results[i] = [];
          failCount++;
        }
      }
    });
    await Promise.all(workers);
    console.log(`[Embedder] Concurrent done: ${texts.length} texts → ${successCount} ok, ${failCount} failed in ${Date.now() - start}ms`);
    return results;
  }

  /** Fallback: sequential (slowest, most reliable) */
  private async embedSequential(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      try { results.push(await this.embed(text)); }
      catch { results.push([]); }
    }
    return results;
  }
}

export const ollamaEmbedder = new OllamaEmbedder();
