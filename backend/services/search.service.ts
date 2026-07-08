// Search Service — semantic + keyword retrieval
import { entryRepository } from '../repositories/entry.repository.js';
import { chunkRepository } from '../repositories/chunk.repository.js';
import { vectorRepository } from '../repositories/vector.repository.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import type { RetrievalResult } from '../types.js';

export class SearchService {
  async semanticSearch(query: string, isInternal = false, topK = 10): Promise<RetrievalResult[]> {
    const vectorStore = vectorRepository;

    if (vectorStore.isReady()) {
      try {
        const queryVector = await ollamaEmbedder.embed(query);
        const vectorResults = await vectorStore.search(queryVector, topK);

        if (vectorResults.length > 0) {
          const chunkIds = vectorResults.map((r) => r.chunk_id);
          const chunkTexts = await chunkRepository.findTextsByIds(chunkIds);

          const entryIds = [...new Set(vectorResults.map((r) => r.entry_id))];
          const entryList = await entryRepository.findByIds(entryIds);
          const entryMap = new Map(entryList.map((e) => [e.id, e]));

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
        console.warn(`[Search] Vector search failed: ${err.message}`);
      }
    }

    return this.keywordSearch(query, isInternal, topK);
  }

  private async keywordSearch(query: string, isInternal: boolean, topK: number): Promise<RetrievalResult[]> {
    const all = await entryRepository.findMany({ keyword: query, isInternal });
    const tokens = this.tokenize(query).filter((t) => !STOP_WORDS.has(t));

    return all
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
  }

  private tokenize(query: string): string[] {
    const tokens: string[] = [];
    const chinese = query.replace(/[^一-鿿]/g, '');
    for (let i = 0; i < chinese.length - 1; i++) tokens.push(chinese.slice(i, i + 2));
    for (let i = 0; i < chinese.length - 2; i++) tokens.push(chinese.slice(i, i + 3));
    const english = query.match(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g);
    if (english) tokens.push(...english.map((w) => w.toLowerCase()));
    return [...new Set(tokens)];
  }
}

const STOP_WORDS = new Set([
  '的', '是', '有', '哪些', '什么', '怎么', '如何', '公司', '这个', '那个',
  '一个', '一下', '吗', '呢', '吧', '啊', '了', '在', '和', '与', '或',
  'the', 'a', 'an', 'is', 'are', 'what', 'how', 'of', 'in', 'to', 'for',
]);

export const searchService = new SearchService();
