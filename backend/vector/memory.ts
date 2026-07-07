// In-memory cosine similarity vector store — used when Milvus is unavailable
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

interface VectorRecord {
  entry_id: number;
  embedding: number[];
}

interface SearchResult {
  entry_id: number;
  score: number;
}

const DATA_FILE = path.resolve(config.dataDir, 'vectors.json');

export class MemoryVectorStore {
  private records: VectorRecord[] = [];
  private ready = false;

  async connect(): Promise<void> {
    try {
      if (fs.existsSync(DATA_FILE)) {
        this.records = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        console.log(`[MemoryVector] Loaded ${this.records.length} vectors from disk`);
      }
      this.ready = true;
      console.log('[MemoryVector] Ready');
    } catch (err: any) {
      console.warn(`[MemoryVector] Init failed: ${err.message}`);
    }
  }

  async insert(records: VectorRecord[]): Promise<void> {
    const valid = records.filter((r) => r.embedding && r.embedding.length > 0);
    if (valid.length === 0) return;

    // Deduplicate by entry_id
    for (const r of valid) {
      const idx = this.records.findIndex((x) => x.entry_id === r.entry_id);
      if (idx >= 0) this.records[idx] = r;
      else this.records.push(r);
    }

    // Persist
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.records), 'utf-8');
    console.log(`[MemoryVector] Stored ${valid.length} vectors (total: ${this.records.length})`);
  }

  async search(queryVector: number[], topK = 10): Promise<SearchResult[]> {
    if (!this.ready || this.records.length === 0) return [];

    const results = this.records
      .map((r) => ({
        entry_id: r.entry_id,
        score: cosineSimilarity(queryVector, r.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((r) => r.score > 0.3); // minimum relevance threshold

    return results;
  }

  isReady(): boolean {
    return this.ready;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const memoryVectorStore = new MemoryVectorStore();
