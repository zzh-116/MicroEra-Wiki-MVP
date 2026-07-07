// In-memory cosine similarity vector store — used when Milvus is unavailable
// Supports chunk-level multi-vector storage: each chunk gets its own embedding record
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

interface VectorRecord {
  chunk_id: string;    // unique chunk ID (e.g. "entry_9_chunk_3")
  entry_id: number;
  embedding: number[];
}

interface SearchResult {
  entry_id: number;
  chunk_id: string;
  score: number;
}

const DATA_FILE = path.resolve(config.dataDir, 'vectors.json');

export class MemoryVectorStore {
  private records: VectorRecord[] = [];
  private ready = false;

  async connect(): Promise<void> {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        // Migrate old format (no chunk_id) to new format
        this.records = raw.map((r: any) => ({
          chunk_id: r.chunk_id || `entry_${r.entry_id}_chunk_0`,
          entry_id: r.entry_id,
          embedding: r.embedding,
        }));
        console.log(`[MemoryVector] Loaded ${this.records.length} vectors (${new Set(this.records.map(r => r.entry_id)).size} entries)`);
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

    // Deduplicate by chunk_id — same chunk overwrites, different chunks accumulate
    for (const r of valid) {
      const idx = this.records.findIndex((x) => x.chunk_id === r.chunk_id);
      if (idx >= 0) this.records[idx] = r;
      else this.records.push(r);
    }

    // Persist
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.records), 'utf-8');
    console.log(`[MemoryVector] Stored ${valid.length} vectors (total: ${this.records.length}, entries: ${new Set(this.records.map(r => r.entry_id)).size})`);
  }

  async search(queryVector: number[], topK = 10): Promise<SearchResult[]> {
    if (!this.ready || this.records.length === 0) return [];

    const results = this.records
      .map((r) => ({
        entry_id: r.entry_id,
        chunk_id: r.chunk_id,
        score: cosineSimilarity(queryVector, r.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((r) => r.score > 0.15); // relaxed threshold for academic queries

    return results;
  }

  /**
   * Get chunk texts from document store for the given chunk IDs.
   * Returns a map of chunk_id → text.
   */
  getChunkTexts(chunkIds: string[]): Map<string, string> {
    const texts = new Map<string, string>();
    for (const cid of chunkIds) {
      // chunk_id format: "entry_N_chunk_M" — read from document store
      const match = cid.match(/^entry_(\d+)_chunk_(\d+)$/);
      if (match) {
        const entryId = parseInt(match[1], 10);
        try {
          const docFile = path.resolve(config.dataDir, 'documents', `entry_${entryId}.json`);
          if (fs.existsSync(docFile)) {
            const chunks: Array<{ id: string; text: string }> = JSON.parse(fs.readFileSync(docFile, 'utf-8'));
            const chunk = chunks.find((c: any) => (c.id || c.chunk_id) === cid);
            if (chunk) {
              texts.set(cid, chunk.text || chunk.content || '');
            }
          }
        } catch { /* ignore */ }
      }
    }
    return texts;
  }

  /** Total record count */
  get count(): number {
    return this.records.length;
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
