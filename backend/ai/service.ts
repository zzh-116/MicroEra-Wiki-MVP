import { config } from '../config.js';
import { Entry, ChatMessage } from '../types.js';
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
        max_tokens: 1024,
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
      const results = await semanticSearch.search(query, isInternal);
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

  /** RAG chat — returns answer + source entries */
  async chat(question: string, history: ChatMessage[] = []): Promise<{ answer: string; sources: Entry[] }> {
    const results = await semanticSearch.search(question, false, 3);
    const entries = results.filter((r) => r.entry).map((r) => r.entry);

    const messages: ChatMessage[] = [
      ...(entries.length > 0 ? [{ role: 'system' as const, content: buildChatSystemPrompt(entries) }] : []),
      ...history.slice(-10),
      { role: 'user', content: question },
    ];

    const answer = await this.callOllama(messages, 0.7, true);
    return { answer, sources: entries };
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
