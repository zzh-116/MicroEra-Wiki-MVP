import { ollamaEmbedder } from '../embedding/ollama.js';
import { milvusClient } from '../vector/milvus.js';
import { memoryVectorStore } from '../vector/memory.js';
import { metadataStore } from '../metadata/store.js';
import { documentStore } from '../document/store.js';
import { Entry, RetrievalResult, DocumentChunk } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export class SemanticSearch {
  /**
   * Chunk-level semantic search.
   * Returns top-K chunks with their full text and parent entry metadata.
   */
  async search(query: string, isInternal = false, topK = 10): Promise<RetrievalResult[]> {
    // Try Milvus first, then memory, then keyword fallback
    const vectorStore = milvusClient.isReady() ? milvusClient : (memoryVectorStore.isReady() ? memoryVectorStore : null);

    if (vectorStore) {
      try {
        const queryVector = await ollamaEmbedder.embed(query);
        const vectorResults = await vectorStore.search(queryVector, topK);

        if (vectorResults.length > 0) {
          // Collect all chunk IDs to batch-load texts
          const chunkIds = vectorResults.map((r) => r.chunk_id);
          const chunkTexts = this.loadChunkTexts(chunkIds);

          // Get entry metadata for each result
          const entryIds = [...new Set(vectorResults.map((r) => r.entry_id))];
          const entries = metadataStore.getEntriesByIds(entryIds);
          const entryMap = new Map(entries.map((e) => [e.id, e]));

          return vectorResults
            .map((r) => {
              const entry = entryMap.get(r.entry_id);
              if (!entry) return null;
              return {
                entry,
                score: r.score,
                chunkId: r.chunk_id,
                chunkText: chunkTexts.get(r.chunk_id) || entry.content.slice(0, 1024),
              };
            })
            .filter((r): r is RetrievalResult => r !== null);
        }
      } catch (err: any) {
        console.warn(`[SemanticSearch] Vector search failed: ${err.message}`);
      }
    }

    // Keyword fallback — entry-level only
    return this.keywordSearch(query, isInternal, topK);
  }

  /** Load chunk texts from document store JSON files */
  private loadChunkTexts(chunkIds: string[]): Map<string, string> {
    const texts = new Map<string, string>();
    // Group chunk IDs by entry
    const byEntry = new Map<number, string[]>();
    for (const cid of chunkIds) {
      const match = cid.match(/^entry_(\d+)_chunk_(\d+)$/);
      if (match) {
        const eid = parseInt(match[1], 10);
        if (!byEntry.has(eid)) byEntry.set(eid, []);
        byEntry.get(eid)!.push(cid);
      }
    }

    // Load each entry's document chunks
    for (const [entryId, cids] of byEntry) {
      try {
        const docFile = path.resolve(config.dataDir, 'documents', `entry_${entryId}.json`);
        if (fs.existsSync(docFile)) {
          const chunks: Array<{ id?: string; chunk_id?: string; text?: string; content?: string }> =
            JSON.parse(fs.readFileSync(docFile, 'utf-8'));
          for (const cid of cids) {
            const chunk = chunks.find((c: any) => (c.id || c.chunk_id) === cid);
            if (chunk) {
              texts.set(cid, chunk.text || chunk.content || '');
            }
          }
        }
      } catch { /* ignore */ }
    }
    return texts;
  }

  /** Split a query into searchable tokens — works for both Chinese and English */
  private tokenize(query: string): string[] {
    const tokens: string[] = [];

    // Extract Chinese character bigrams (2-char sliding window)
    const chinese = query.replace(/[^一-鿿]/g, '');
    for (let i = 0; i < chinese.length - 1; i++) {
      tokens.push(chinese.slice(i, i + 2));
    }
    for (let i = 0; i < chinese.length - 2; i++) {
      tokens.push(chinese.slice(i, i + 3));
    }

    // Extract English/ASCII words (including hyphens for compound terms)
    const english = query.match(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g);
    if (english) tokens.push(...english.map((w) => w.toLowerCase()));

    return [...new Set(tokens)];
  }

  private static STOP_WORDS = new Set([
    '的', '是', '有', '哪些', '什么', '怎么', '如何', '公司', '这个', '那个',
    '一个', '一下', '吗', '呢', '吧', '啊', '了', '在', '和', '与', '或',
    'the', 'a', 'an', 'is', 'are', 'what', 'how', 'of', 'in', 'to', 'for',
  ]);

  private keywordSearch(query: string, isInternal: boolean, topK: number): RetrievalResult[] {
    const all = metadataStore.getEntries(undefined, isInternal);
    const tokens = this.tokenize(query).filter((t) => !SemanticSearch.STOP_WORDS.has(t));

    const scored = all
      .map((entry) => {
        const title = entry.title.toLowerCase();
        const summary = entry.summary.toLowerCase();
        const content = entry.content.toLowerCase();
        const tagStr = entry.tags.join(' ').toLowerCase();

        let score = 0;
        for (const token of tokens) {
          if (title.includes(token)) score += 10;
          if (summary.includes(token)) score += 5;
          if (content.includes(token)) score += 2;
          if (tagStr.includes(token)) score += 3;
        }
        return { entry, score } as RetrievalResult;
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }
}

export const semanticSearch = new SemanticSearch();
