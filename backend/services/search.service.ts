// Search Service — semantic + keyword retrieval
import { entryRepository } from '../repositories/entry.repository.js';
import { chunkRepository } from '../repositories/chunk.repository.js';
import { vectorRepository } from '../repositories/vector.repository.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import type { Entry, RetrievalResult } from '../types.js';

export class SearchService {
  async semanticSearch(query: string, isInternal = false, topK = 10): Promise<RetrievalResult[]> {
    const vectorStore = vectorRepository;

    if (vectorStore.isReady()) {
      try {
        const tEmbed = Date.now();
        const queryVector = await ollamaEmbedder.embed(query);
        console.log(`[Search] embed query: ${Date.now() - tEmbed}ms`);

        const tSearch = Date.now();
        const vectorResults = await vectorStore.search(queryVector, topK);
        console.log(`[Search] vector search: ${Date.now() - tSearch}ms (${vectorResults.length} hits)`);

        if (vectorResults.length > 0) {
          const chunkIds = vectorResults.map((r) => r.chunk_id);
          const entryIds = [...new Set(vectorResults.map((r) => r.entry_id))];

          // Log what we found for diagnostics
          console.log(`[Search] hit entryIds: [${entryIds.join(', ')}]  chunkIds: [${chunkIds.slice(0, 5).join(', ')}${chunkIds.length > 5 ? '...' : ''}]`);

          // Parallelize independent DB reads — chunk texts and entries don't depend on each other
          const [chunkTexts, entryList] = await Promise.all([
            chunkRepository.findTextsByIds(chunkIds),
            entryRepository.findByIds(entryIds),
          ]);
          const entryMap = new Map(entryList.map((e) => [e.id, e]));

          // Log chunk text retrieval stats
          const foundChunks = chunkIds.filter((id) => chunkTexts.has(id)).length;
          console.log(`[Search] chunk texts found: ${foundChunks}/${chunkIds.length} (entries: ${entryList.length}/${entryIds.length})`);

          if (foundChunks === 0) {
            console.warn(`[Search] ZERO chunk texts found in DB — chunks were never persisted during import. Falling back to entry.content.slice().`);
          }

          // Log per-result diagnostics
          const mapped = vectorResults
            .map((r) => {
              const entry = entryMap.get(r.entry_id);
              if (!entry) {
                console.warn(`[Search] entry #${r.entry_id} not found in DB (score=${r.score?.toFixed(3)}) — skipping`);
                return null;
              }
              const chunkText = chunkTexts.get(r.chunk_id);
              console.log(`[Search]   entry=#${r.entry_id} "${entry.title.slice(0, 50)}" score=${r.score?.toFixed(4)} chunkText=${chunkText ? chunkText.length + 'B' : 'MISSING→fallback'}`);
              return {
                entry,
                score: r.score,
                chunkId: r.chunk_id,
                chunkText: chunkText || entry.content.slice(0, 1024),
              };
            })
            .filter((r): r is RetrievalResult => r !== null);

          // Also attempt keyword search for entries NOT found by vector search,
          // then merge results — this ensures documents with poor vector similarity
          // but exact keyword matches are still surfaced (hybrid retrieval)
          const vectorEntryIds = new Set(mapped.map((r) => r.entry.id));
          const keywordResults = await this.keywordSearch(query, isInternal, Math.max(topK - mapped.length, 3));
          const freshKeyword = keywordResults.filter((r) => !vectorEntryIds.has(r.entry.id));
          if (freshKeyword.length > 0) {
            console.log(`[Search] keyword supplement: ${freshKeyword.length} additional entries not in vector results`);
          }

          return [...mapped, ...freshKeyword].slice(0, topK);
        }
      } catch (err: any) {
        console.warn(`[Search] Vector search failed: ${err.message}`);
      }
    }

    return this.keywordSearch(query, isInternal, topK);
  }

  private async keywordSearch(query: string, isInternal: boolean, topK: number): Promise<RetrievalResult[]> {
    const tokens = this.tokenize(query).filter((t) => !STOP_WORDS.has(t));
    console.log(`[Search] keyword tokens: [${tokens.join(', ')}]`);

    // Search by individual tokens OR full query — token-based is critical for
    // mixed Chinese-English queries like "IHDec是什么" where the full query
    // string won't appear in any entry content.
    const all = await entryRepository.findMany({ keyword: query, isInternal });
    if (all.length === 0 && tokens.length > 0) {
      // Fallback: search by each token individually and union results
      const entryMap = new Map<number, Entry>();
      for (const token of tokens.slice(0, 5)) {
        const results = await entryRepository.findMany({ keyword: token, isInternal });
        for (const e of results) {
          if (!entryMap.has(e.id)) entryMap.set(e.id, e);
        }
      }
      const deduped = [...entryMap.values()];
      console.log(`[Search] token-based keyword search: ${deduped.length} entries (vs 0 from full-query LIKE)`);
      // Score and return these entries
      return this.scoreEntries(deduped, tokens).slice(0, topK);
    }

    return this.scoreEntries(all, tokens).slice(0, topK);
  }

  private scoreEntries(entries: Entry[], tokens: string[]): RetrievalResult[] {
    return entries
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
      .sort((a, b) => b.score - a.score);
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
