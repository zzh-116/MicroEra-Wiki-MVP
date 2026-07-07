import { config } from '../config.js';
import { Entry, ChatMessage, RetrievalResult } from '../types.js';
import { semanticSearch } from '../retrieval/search.js';
import { metadataStore } from '../metadata/store.js';
import { buildChatSystemPrompt, buildSummarizeMessages, buildSearchMessages } from './prompts.js';

class AiService {
  private async callOllama(messages: ChatMessage[], temperature = 0.3, useChatModel = false): Promise<string> {
    const model = useChatModel ? config.ollama.chatModel : config.ollama.model;
    const response = await fetch(`${config.ollama.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: 2048,  // increased from 1024 for academic answers
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content || '';
  }

  /** Semantic search using vector store with LLM fallback */
  async search(query: string, isInternal = false): Promise<Entry[]> {
    try {
      const results = await semanticSearch.search(query, isInternal, 10);
      return results.filter((r) => r.entry).map((r) => r.entry);
    } catch {
      // LLM-based fallback
      const entries = metadataStore.getEntries({}, isInternal);
      if (entries.length === 0) return [];
      const messages = buildSearchMessages(entries, query);
      const raw = await this.callOllama(messages, 0.3);
      const ids = this.parseIds(raw);
      return ids.map((id) => entries.find((e) => e.id === id)).filter(Boolean) as Entry[];
    }
  }

  /** RAG chat — chunk-level retrieval with topK=5, lower temperature for accuracy */
  async chat(question: string, history: ChatMessage[] = []): Promise<{ answer: string; sources: Entry[] }> {
    // Chunk-level semantic search
    const results: RetrievalResult[] = await semanticSearch.search(question, false, 5);

    // Build prompt from chunk texts
    const chunks = results
      .filter((r) => r.chunkText)
      .map((r) => ({
        chunkText: r.chunkText!,
        entryTitle: r.entry.title,
        chunkId: r.chunkId || `entry_${r.entry.id}`,
      }));

    const messages: ChatMessage[] = [
      ...(chunks.length > 0 ? [{ role: 'system' as const, content: buildChatSystemPrompt(chunks) }] : []),
      ...history.slice(-10),
      { role: 'user', content: question },
    ];

    // Lower temperature for factual accuracy
    const answer = await this.callOllama(messages, 0.3, true);

    // Deduplicate sources
    const seen = new Set<number>();
    const sources: Entry[] = [];
    for (const r of results) {
      if (!seen.has(r.entry.id)) {
        seen.add(r.entry.id);
        sources.push(r.entry);
      }
    }

    return { answer, sources };
  }

  /** Summarize an entry */
  async summarize(entryId: number): Promise<string> {
    const entry = metadataStore.getEntryById(entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');

    const messages = buildSummarizeMessages(entry);
    return this.callOllama(messages, 0.3, true);
  }

  private parseIds(raw: string): number[] {
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch {
      const match = raw.match(/\[[\d,\s]+\]/);
      if (match) {
        try { return JSON.parse(match[0]).map(Number); } catch { /* ignore */ }
      }
    }
    return [];
  }
}

export const aiService = new AiService();
