// Search Service — semantic + keyword retrieval
import { entryRepository } from '../repositories/entry.repository.js';
import { chunkRepository } from '../repositories/chunk.repository.js';
import { vectorRepository } from '../repositories/vector.repository.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import type { Entry, RetrievalResult, VectorSearchResult } from '../types.js';

export class SearchService {
  async semanticSearch(query: string, isInternal = false, topK = 10, entryId?: number): Promise<RetrievalResult[]> {
    try {
      const mapped = await this.vectorOnly(query, isInternal, topK, entryId);
      if (mapped !== null && mapped.length > 0) {
        // 全局检索才做关键词补充；文档内检索（entryId 指定）不应混入其它文档。
        let freshKeyword: RetrievalResult[] = [];
        if (entryId === undefined) {
          const vectorEntryIds = new Set(mapped.map((r) => r.entry.id));
          const keywordResults = await this.keywordSearch(query, isInternal, topK);
          freshKeyword = keywordResults.filter((r) => !vectorEntryIds.has(r.entry.id));
          if (freshKeyword.length > 0) {
            console.log(`[Search] keyword supplement: ${freshKeyword.length} additional entries not in vector results`);
          }
        }
        return this.mergeResults(mapped, freshKeyword, topK);
      }
    } catch (err: any) {
      console.warn(`[Search] Vector search failed: ${err.message}`);
    }

    if (entryId !== undefined) {
      return this.getEntryChunks(entryId);
    }
    return this.keywordSearch(query, isInternal, topK);
  }

  /** 纯向量检索（块级）。返回 null 表示向量库不可用；返回 [] 表示无命中。
   * 不含关键词补充与 exactMatch 置顶，由调用方决定是否叠加。 */
  private async vectorOnly(query: string, isInternal: boolean, topK: number, entryId?: number): Promise<RetrievalResult[] | null> {
    const vectorStore = vectorRepository;
    if (!vectorStore.isReady()) return null;

    const tEmbed = Date.now();
    const queryVector = await ollamaEmbedder.embed(query);
    console.log(`[Search] embed query: ${Date.now() - tEmbed}ms`);

    const tSearch = Date.now();
    const vectorResults = await vectorStore.search(queryVector, topK, entryId);
    console.log(`[Search] vector search: ${Date.now() - tSearch}ms (${vectorResults.length} hits)`);

    // 全局检索时每篇文档最多取 3 个 chunk，防止单文档垄断 Top-K；
    // 文档内检索（entryId 指定）不限制 chunk 数量。
    const filteredResults =
      entryId === undefined
        ? this.capChunksPerDoc(vectorResults, 3)
        : vectorResults;

    if (filteredResults.length === 0) return [];

    const chunkIds = filteredResults.map((r) => r.chunk_id);
    const entryIds = [...new Set(filteredResults.map((r) => r.entry_id))];

    // Log what we found for diagnostics
    console.log(`[Search] hit entryIds: [${entryIds.join(', ')}]  chunkIds: [${chunkIds.slice(0, 5).join(', ')}${chunkIds.length > 5 ? '...' : ''}]`);

    // Parallelize independent DB reads — chunk texts, entries, and headings
    const [chunkTexts, entryList, chunkHeadings] = await Promise.all([
      chunkRepository.findTextsByIds(chunkIds),
      entryRepository.findByIds(entryIds),
      chunkRepository.findHeadingsByIds(chunkIds),
    ]);
    const entryMap = new Map(entryList.map((e) => [e.id, e]));

    // Log chunk text retrieval stats
    const foundChunks = chunkIds.filter((id) => chunkTexts.has(id)).length;
    console.log(`[Search] chunk texts found: ${foundChunks}/${chunkIds.length} (entries: ${entryList.length}/${entryIds.length})`);

    if (foundChunks === 0) {
      console.warn(`[Search] ZERO chunk texts found in DB — chunks were never persisted during import. Falling back to entry.content.slice().`);
    }

    // Log per-result diagnostics
    return filteredResults
      .map((r): RetrievalResult | null => {
        const entry = entryMap.get(r.entry_id);
        if (!entry) {
          console.warn(`[Search] entry #${r.entry_id} not found in DB (score=${r.score?.toFixed(3)}) — skipping`);
          return null;
        }
        if (!isInternal && entry.visibility === 'internal') {
          return null;
        }
        const chunkText = chunkTexts.get(r.chunk_id);
        const heading = chunkHeadings.get(r.chunk_id);
        console.log(`[Search]   entry=#${r.entry_id} "${entry.title.slice(0, 50)}" score=${r.score?.toFixed(4)} chunkText=${chunkText ? chunkText.length + 'B' : 'MISSING→fallback'} heading=${heading || '(none)'}`);
        return {
          entry,
          score: r.score,
          chunkId: r.chunk_id,
          chunkHeading: heading,
          chunkText: chunkText || entry.content.slice(0, 1024),
        };
      })
      .filter((r): r is RetrievalResult => r !== null);
  }

  /** 按标题/文件名检索：分层排序（完全相等 > 前缀 > 包含），同层按更新时间倒序。
   * 不查 summary/content，也不做语义检索。 */
  async titleSearch(query: string, isInternal = false, topK = 10): Promise<Entry[]> {
    const q = query.trim();
    const ql = q.toLowerCase();
    const { entries } = await entryRepository.findMany({
      keyword: q,
      isInternal,
      page: 1,
      pageSize: KEYWORD_SCAN_LIMIT,
      matchFields: 'title',
    });

    const layerOf = (e: Entry): number => {
      const t = e.title.toLowerCase();
      const f = (e.file_name || '').toLowerCase();
      if (t === ql || f === ql) return 0;
      if (t.startsWith(ql) || f.startsWith(ql)) return 1;
      return 2; // 包含
    };

    return entries
      .map((e) => ({ e, layer: layerOf(e) }))
      .sort((a, b) => a.layer - b.layer || new Date(b.e.updated_at).getTime() - new Date(a.e.updated_at).getTime())
      .slice(0, topK)
      .map((x) => x.e);
  }

  /** 按内容检索：语义向量优先，summary/content 关键词兜底。不提升标题命中。 */
  async contentSearch(query: string, isInternal = false, topK = 10): Promise<Entry[]> {
    const q = query.trim();
    const seen = new Set<number>();
    const out: Entry[] = [];
    const push = (e: Entry) => {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    };

    // 1) 语义向量结果（块级 → 按 entry 去重，保留首次即最高相似度）
    try {
      const vector = (await this.vectorOnly(q, isInternal, topK)) ?? [];
      for (const r of vector) push(r.entry);
    } catch (err: any) {
      console.warn(`[Search] content vector search failed: ${err.message}`);
    }

    // 2) summary/content 关键词兜底（不查 title/file）
    if (out.length < topK) {
      const { entries } = await entryRepository.findMany({
        keyword: q,
        isInternal,
        page: 1,
        pageSize: KEYWORD_SCAN_LIMIT,
        matchFields: 'content',
      });
      for (const e of entries) {
        push(e);
        if (out.length >= topK) break;
      }
    }

    return out.slice(0, topK);
  }

  /** 智能检索：根据查询意图动态选择排序策略。短/编号查询走标题优先，长/自然语言查询走语义优先。 */
  async smartSearch(query: string, isInternal = false, topK = 10): Promise<Entry[]> {
    const intent = this.detectQueryIntent(query);

    if (intent === 'title') {
      const titleHits = await this.titleSearch(query, isInternal, topK);
      if (titleHits.length >= topK) return titleHits;
      // 标题结果不足时用语义结果兜底，避免用户空手而归
      const fallback = await this.contentSearch(query, isInternal, topK);
      const seen = new Set(titleHits.map((e) => e.id));
      const out = [...titleHits];
      for (const e of fallback) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          out.push(e);
        }
        if (out.length >= topK) break;
      }
      return out;
    }

    // content 意图：语义优先，但"标题/文件名 === 查询串"这种无歧义命中仍置顶
    const q = query.trim().toLowerCase();
    const content = await this.contentSearch(query, isInternal, topK);
    const isExact = (e: Entry) => e.title.toLowerCase() === q || (e.file_name || '').toLowerCase() === q;
    return [...content.filter(isExact), ...content.filter((e) => !isExact(e))].slice(0, topK);
  }

  /** 识别查询意图：疑问/自然语言或纯英文词组 → 内容；短编号/短中文 → 标题。 */
  private detectQueryIntent(query: string): 'title' | 'content' {
    const q = query.trim();
    const hasCjk = /[一-鿿]/.test(q);

    // 1) 疑问词 / 中文标点 → 内容
    if (/[怎么什么如何为何是否哪难道吗呢？?，,、：:；;]/.test(q)) return 'content';
    // 2) 含空格 或 纯英文词组（仅字母，排除 "A1"/"AA1" 这类编号） → 内容
    if (/\s/.test(q) || /^[a-zA-Z][a-zA-Z\s._-]*$/.test(q)) return 'content';
    // 3) 长度 > 8 且不含中文 → 内容（超长编号/英文串）
    if (q.length > 8 && !hasCjk) return 'content';
    // 4) 否则 → 标题
    return 'title';
  }

  /** 全局检索时限制每篇文档最多 maxPerDoc 个 chunk，防止单文档垄断 Top-K。 */
  private capChunksPerDoc(results: VectorSearchResult[], maxPerDoc: number): VectorSearchResult[] {
    const counts = new Map<number, number>();
    const capped: VectorSearchResult[] = [];
    for (const r of results) {
      const count = counts.get(r.entry_id) || 0;
      if (count < maxPerDoc) {
        counts.set(r.entry_id, count + 1);
        capped.push(r);
      }
    }
    return capped;
  }

  /** Merge vector (chunk-level) and keyword (entry-level) results for a global
   * search. Only exact title/file-name matches from the keyword pass rank above
   * generic vector hits, so a document whose title is an exact match (e.g.
   * "A1") is not buried by content-only vector matches (e.g. "A8"). Prefix and
   * content keyword matches follow the vector results to avoid a single
   * ambiguous token edging out better semantic matches. */
  private mergeResults(vector: RetrievalResult[], keyword: RetrievalResult[], topK: number): RetrievalResult[] {
    const seen = new Set<number>();
    const out: RetrievalResult[] = [];
    const push = (r: RetrievalResult) => {
      if (!seen.has(r.entry.id)) {
        seen.add(r.entry.id);
        out.push(r);
      }
    };

    // Only exact title/file-name matches jump ahead of semantic results.
    keyword
      .filter((r) => r.exactMatch)
      .sort((a, b) => b.score - a.score)
      .forEach(push);

    // Vector results in their original relevance order.
    vector.forEach(push);

    // Remaining (prefix/content) keyword matches last.
    keyword.forEach(push);

    return out.slice(0, topK);
  }

  /** 文档内检索：直接返回该文档的全部 chunk（无 chunk 则回退到 entry.content）。 */
  private async getEntryChunks(entryId: number): Promise<RetrievalResult[]> {
    const entry = await entryRepository.findById(entryId);
    if (!entry) return [];
    const chunks = await chunkRepository.findByEntryId(entryId);
    if (chunks.length === 0) {
      if (!entry.content?.trim()) return [];
      return [
        {
          entry,
          score: 1,
          chunkId: `entry_${entryId}_content`,
          chunkHeading: undefined,
          chunkText: entry.content,
        },
      ];
    }
    return chunks.map((c) => ({
      entry,
      score: 1,
      chunkId: c.id,
      chunkHeading: c.metadata?.heading,
      chunkText: c.text,
    }));
  }

  private async keywordSearch(query: string, isInternal: boolean, topK: number): Promise<RetrievalResult[]> {
    const tokens = this.tokenize(query).filter((t) => !STOP_WORDS.has(t));
    console.log(`[Search] keyword tokens: [${tokens.join(', ')}]`);

    // Search by individual tokens OR full query — token-based is critical for
    // mixed Chinese-English queries like "IHDec是什么" where the full query
    // string won't appear in any entry content. Bounded pageSize so a large
    // corpus is never fully loaded before JS relevance ranking below.
    const { entries: all } = await entryRepository.findMany({ keyword: query, isInternal, page: 1, pageSize: KEYWORD_SCAN_LIMIT });
    if (all.length === 0 && tokens.length > 0) {
      // Fallback: search by each token individually and union results
      const entryMap = new Map<number, Entry>();
      for (const token of tokens.slice(0, 5)) {
        const { entries: results } = await entryRepository.findMany({ keyword: token, isInternal, page: 1, pageSize: KEYWORD_SCAN_LIMIT });
        for (const e of results) {
          if (!entryMap.has(e.id)) entryMap.set(e.id, e);
        }
      }
      const deduped = [...entryMap.values()];
      console.log(`[Search] token-based keyword search: ${deduped.length} entries (vs 0 from full-query LIKE)`);
      // Score and return these entries
      return this.scoreEntries(deduped, tokens, query).slice(0, topK);
    }

    return this.scoreEntries(all, tokens, query).slice(0, topK);
  }

  private scoreEntries(entries: Entry[], tokens: string[], query: string): RetrievalResult[] {
    const q = query.toLowerCase();
    return entries
      .map((entry) => {
        const title = entry.title.toLowerCase();
        const file = (entry.file_name || '').toLowerCase();
        const summary = entry.summary.toLowerCase();
        const content = entry.content.toLowerCase();
        const tagStr = entry.tags.join(' ').toLowerCase();

        // Unambiguous match: title or file name equals the full query or a token.
        const exactMatch = title === q || file === q || tokens.some((t) => title === t || file === t);

        let score = 0;
        for (const token of tokens) {
          score += matchScore(title, token, 100, 60, 15);
          score += matchScore(file, token, 90, 55, 12);
          if (summary.includes(token)) score += 5;
          if (content.includes(token)) score += 2;
          if (tagStr.includes(token)) score += 3;
        }
        return { entry, score, exactMatch } as RetrievalResult;
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

/** Upper bound on keyword results fetched before JS relevance ranking, so a
 * large corpus is never loaded into memory all at once. */
const KEYWORD_SCAN_LIMIT = 1000;

/** Weighted match score for a single token against a field: exact > prefix >
 * substring, else 0. Used to order keyword results among themselves (exact
 * placement above vector results is handled separately via exactMatch). */
function matchScore(text: string, token: string, exact: number, prefix: number, substr: number): number {
  if (text === token) return exact;
  if (text.startsWith(token)) return prefix;
  if (text.includes(token)) return substr;
  return 0;
}

const STOP_WORDS = new Set([
  '的', '是', '有', '哪些', '什么', '怎么', '如何', '公司', '这个', '那个',
  '一个', '一下', '吗', '呢', '吧', '啊', '了', '在', '和', '与', '或',
  'the', 'a', 'an', 'is', 'are', 'what', 'how', 'of', 'in', 'to', 'for',
]);

export const searchService = new SearchService();
