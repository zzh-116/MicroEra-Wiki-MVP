import { config } from '../config.js';

export class OllamaEmbedder {
  private url: string;
  private model: string;

  constructor() {
    this.url = config.ollama.url;
    this.model = config.ollama.embeddingModel;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      try {
        const vec = await this.embed(text);
        results.push(vec);
      } catch (err: any) {
        console.warn(`[Embedder] Failed for text "${text.slice(0, 50)}...": ${err.message}`);
        results.push([]);
      }
    }
    return results;
  }
}

export const ollamaEmbedder = new OllamaEmbedder();
