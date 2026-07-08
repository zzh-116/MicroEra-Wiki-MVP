// AI Service — RAG chat + summarization with conversation persistence
import { config } from '../config.js';
import { searchService } from './search.service.js';
import { entryRepository } from '../repositories/entry.repository.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { buildChatSystemPrompt, buildSummarizeMessages, buildSearchMessages } from '../ai/prompts.js';
import type { ChatMessage, Entry, RetrievalResult } from '../types.js';

class AiService {
  private async callOllama(messages: ChatMessage[], temperature = 0.3, useChatModel = false): Promise<string> {
    const model = useChatModel ? config.ollama.chatModel : config.ollama.model;
    const response = await fetch(`${config.ollama.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature, max_tokens: 2048 }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Ollama API error ${response.status}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content || '';
  }

  /** Semantic search with LLM fallback */
  async search(query: string, isInternal = false): Promise<Entry[]> {
    try {
      const results = await searchService.semanticSearch(query, isInternal, 10);
      return results.filter((r) => r.entry).map((r) => r.entry);
    } catch {
      const allEntries = await entryRepository.findMany({ isInternal });
      if (allEntries.length === 0) return [];
      const messages = buildSearchMessages(allEntries, query);
      const raw = await this.callOllama(messages, 0.3);
      const ids = this.parseIds(raw);
      return ids.map((id) => allEntries.find((e) => e.id === id)).filter(Boolean) as Entry[];
    }
  }

  /** RAG chat with conversation persistence */
  async chat(
    question: string,
    userId?: number,
    conversationId?: number,
  ): Promise<{
    answer: string;
    sources: Entry[];
    conversationId: number;
  }> {
    // Create or reuse conversation
    if (!conversationId && userId) {
      const conv = await conversationRepository.create(userId, question.slice(0, 80));
      conversationId = conv.id;
    }

    // Save user message
    if (conversationId) {
      await conversationRepository.addMessage({
        conversationId,
        role: 'user',
        content: question,
      });
    }

    // Get conversation history
    const history: ChatMessage[] = conversationId
      ? await conversationRepository.getHistory(conversationId)
      : [];

    // Chunk-level semantic search
    const results: RetrievalResult[] = await searchService.semanticSearch(question, false, 5);

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

    // Save assistant message
    if (conversationId) {
      await conversationRepository.addMessage({
        conversationId,
        role: 'assistant',
        content: answer,
        sources: sources.map((s) => ({ id: s.id, title: s.title })),
      });
    }

    return { answer, sources, conversationId: conversationId ?? 0 };
  }

  /** Summarize an entry */
  async summarize(entryId: number): Promise<string> {
    const entry = await entryRepository.findById(entryId);
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
