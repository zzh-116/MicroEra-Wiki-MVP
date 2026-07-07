import { ollamaEmbedder } from '../embedding/ollama.js';
import { milvusClient } from '../vector/milvus.js';
import { memoryVectorStore } from '../vector/memory.js';
import { metadataStore } from '../metadata/store.js';
import { Entry, RetrievalResult } from '../types.js';

export class SemanticSearch {
  async search(query: string, isInternal = false, topK = 10): Promise<RetrievalResult[]> {
    // Try Milvus first, then memory, then keyword fallback
    const vectorStore = milvusClient.isReady() ? milvusClient : (memoryVectorStore.isReady() ? memoryVectorStore : null);

    if (vectorStore) {
      try {
        const queryVector = await ollamaEmbedder.embed(query);
        const vectorResults = await vectorStore.search(queryVector, topK);

        if (vectorResults.length > 0) {
          const entryIds = vectorResults.map((r) => r.entry_id);
          const entries = metadataStore.getEntriesByIds(entryIds);
          const entryMap = new Map(entries.map((e) => [e.id, e]));
          return vectorResults
            .map((r) => ({ entry: entryMap.get(r.entry_id)!, score: r.score }))
            .filter((r) => r.entry);
        }
      } catch (err: any) {
        console.warn(`[SemanticSearch] Vector search failed: ${err.message}`);
      }
    }

    return this.keywordSearch(query, isInternal, topK);
  }

  /** Split a query into searchable tokens — works for both Chinese and English */
  private tokenize(query: string): string[] {
    const tokens: string[] = [];

    // Extract Chinese character bigrams (2-char sliding window) — effective for Chinese NLP
    const chinese = query.replace(/[^一-鿿]/g, '');
    for (let i = 0; i < chinese.length - 1; i++) {
      tokens.push(chinese.slice(i, i + 2));
    }
    // Also keep 3-grams for more specific matching
    for (let i = 0; i < chinese.length - 2; i++) {
      tokens.push(chinese.slice(i, i + 3));
    }

    // Extract English/ASCII words
    const english = query.match(/[a-zA-Z0-9]+/g);
    if (english) tokens.push(...english.map((w) => w.toLowerCase()));

    // Deduplicate
    return [...new Set(tokens)];
  }

  /** Common Chinese stop words to filter out noise tokens */
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
        return { entry, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }
}

export const semanticSearch = new SemanticSearch();
