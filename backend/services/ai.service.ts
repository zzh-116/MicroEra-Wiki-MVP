// AI Service — RAG chat + summarization with provider-agnostic LLM abstraction
// Supports both streaming (AsyncGenerator) and non-streaming (Promise<string>)
import { getLLMProvider } from '../llm/index.js';
import type { LLMProvider, StreamChunk } from '../llm/types.js';
import { searchService } from './search.service.js';
import { entryRepository } from '../repositories/entry.repository.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { buildChatSystemPrompt, buildSummarizeMessages, buildSearchMessages } from '../ai/prompts.js';
import type { ChatMessage, Entry, RetrievalResult } from '../types.js';

class AiService {
  private get provider(): LLMProvider {
    return getLLMProvider();
  }

  /** Semantic search with LLM fallback */
  async search(query: string, isInternal = false): Promise<Entry[]> {
    try {
      const results = await searchService.semanticSearch(query, isInternal, 10);
      return results.filter((r) => r.entry).map((r) => r.entry);
    } catch {
      const allEntries = await entryRepository.findAll({ isInternal });
      if (allEntries.length === 0) return [];
      const messages = buildSearchMessages(allEntries, query);
      const raw = await this.provider.chat(messages, { temperature: 0.3 });
      const ids = this.parseIds(raw);
      return ids.map((id) => allEntries.find((e) => e.id === id)).filter(Boolean) as Entry[];
    }
  }

  /** Build RAG messages from a question */
  private async buildRagMessages(
    question: string,
    conversationId?: number,
  ): Promise<{
    messages: ChatMessage[];
    sources: Entry[];
    results: RetrievalResult[];
  }> {
    // Parallelize: history fetch and semantic search are independent
    const t0 = Date.now();
    const [history, results] = await Promise.all([
      conversationId
        ? conversationRepository.getHistory(conversationId)
        : Promise.resolve([] as ChatMessage[]),
      searchService.semanticSearch(question, true, 10),
    ]);
    console.log(`[AI] buildRag: getHistory+semanticSearch = ${Date.now() - t0}ms`);

    // Sanitize chunk text: strip Base64 data-URI images from RAG context.
    // Even though the parser strips them at import time, pre-existing chunks
    // from before the fix may still contain raw Base64. This is the last
    // defense before the chunk text reaches the LLM prompt.
    const sanitizeChunk = (text: string): string => {
      // Pass 1: markdown image syntax ![alt](data:image/...)
      text = text.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
        (_m: string, alt: string) => `[Embedded image: ${alt?.trim() || 'Image'}]`);
      // Pass 2: bare base64 URIs (LLM output, broken parse artifacts)
      text = text.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{100,}/g,
        '[Embedded image omitted]');
      return text;
    };

    // Build a human-readable chunk label from heading metadata.
    // Falls back to the raw chunkId if no heading is available.
    const chunkLabel = (r: typeof results[0]): string => {
      if (r.chunkHeading) {
        // Strip markdown heading markers (##, ###) for cleaner display
        const clean = r.chunkHeading.replace(/^#{1,4}\s*/, '');
        return `§${clean}`;
      }
      return r.chunkId || `entry_${r.entry.id}`;
    };

    const chunks = results
      .filter((r) => r.chunkText)
      .map((r) => ({
        chunkText: sanitizeChunk(r.chunkText!),
        entryTitle: r.entry.title,
        chunkId: chunkLabel(r),
      }));

    // Diagnostic: log what RAG retrieved
    console.log(`[AI] RAG retrieved ${results.length} results (${chunks.length} with chunk text):`);
    for (const r of results) {
      const label = chunkLabel(r);
      console.log(`[AI]   #${r.entry.id} "${r.entry.title.slice(0, 60)}" score=${r.score?.toFixed(4)} label="${label}" chunkLen=${r.chunkText?.length || 0}`);
    }

    const messages: ChatMessage[] = [
      ...(chunks.length > 0
        ? [{ role: 'system' as const, content: buildChatSystemPrompt(chunks) }]
        : []),
      ...history.slice(-10),
      { role: 'user', content: question },
    ];

    // Deduplicate sources
    const seen = new Set<number>();
    const sources: Entry[] = [];
    for (const r of results) {
      if (!seen.has(r.entry.id)) {
        seen.add(r.entry.id);
        sources.push(r.entry);
      }
    }

    return { messages, sources, results };
  }

  /** Non-streaming RAG chat with conversation persistence */
  async chat(
    question: string,
    userId?: number,
    conversationId?: number,
  ): Promise<{
    answer: string;
    sources: Entry[];
    conversationId: number;
  }> {
    if (!conversationId && userId) {
      const conv = await conversationRepository.create(userId, question.slice(0, 80));
      conversationId = conv.id;
    }
    if (conversationId) {
      await conversationRepository.addMessage({ conversationId, role: 'user', content: question });
    }

    const { messages, sources } = await this.buildRagMessages(question, conversationId);
    const answer = await this.provider.chat(messages, { temperature: 0.3 });

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

  /**
   * Streaming RAG chat — yields tokens via AsyncGenerator.
   * Use this from SSE endpoints.
   *
   * Usage:
   *   for await (const chunk of aiService.streamChat(question, userId, cid, signal)) {
   *     if (chunk.type === 'token') send(chunk.content);
   *     if (chunk.type === 'done') saveToDb(chunk.sources);
   *   }
   */
  async *streamChat(
    question: string,
    userId?: number,
    conversationId?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChatEvent> {
    const t0 = Date.now();

    // Step 1: Create conversation if new (need the ID before proceeding)
    if (!conversationId && userId) {
      const conv = await conversationRepository.create(userId, question.slice(0, 80));
      conversationId = conv.id;
    }
    console.log(`[AI] createConv: ${Date.now() - t0}ms`);

    // Step 2: Yield start event IMMEDIATELY — user gets instant feedback
    yield { type: 'start', conversationId: conversationId ?? 0 };

    // Step 3: Save user message + build RAG messages IN PARALLEL
    // These are independent: addMessage doesn't affect getHistory (current msg not yet saved)
    const cid = conversationId;
    const t1 = Date.now();
    const [, { messages, sources }] = await Promise.all([
      cid
        ? conversationRepository.addMessage({ conversationId: cid, role: 'user', content: question })
        : Promise.resolve(null),
      this.buildRagMessages(question, cid),
    ]);
    console.log(`[AI] buildRag+addMsg: ${Date.now() - t1}ms (total: ${Date.now() - t0}ms)`);

    // Stream tokens from provider
    let fullAnswer = '';
    let tokenCount = 0;
    const t2 = Date.now();
    try {
      for await (const chunk of this.provider.streamChat(messages, { temperature: 0.3 }, signal)) {
        if (chunk.done) break;
        fullAnswer += chunk.token;
        tokenCount++;
        yield { type: 'token', content: chunk.token };
      }
      const ttft = tokenCount > 0 ? '?' : 'N/A';
      console.log(`[AI] streamTokens: ${Date.now() - t2}ms, ${tokenCount} tokens (total: ${Date.now() - t0}ms)`);
    } catch (err: any) {
      // Yield error, but don't throw — save partial answer if we have one
      yield { type: 'error', message: err.message || 'Generation failed' };

      if (conversationId && fullAnswer) {
        await conversationRepository.addMessage({
          conversationId,
          role: 'assistant',
          content: fullAnswer + '\n\n[生成中断]',
          sources: sources.map((s) => ({ id: s.id, title: s.title })),
        });
      }
      return;
    }

    // Persist complete answer after successful generation
    if (conversationId) {
      await conversationRepository.addMessage({
        conversationId,
        role: 'assistant',
        content: fullAnswer,
        sources: sources.map((s) => ({ id: s.id, title: s.title })),
      });
    }

    // Yield done event with sources
    yield {
      type: 'done',
      sources: sources.map((s) => ({
        id: s.id,
        title: s.title,
        entry_type: s.entry_type,
      })),
      conversationId: conversationId ?? 0,
    };
  }

  /** Summarize an entry */
  async summarize(entryId: number): Promise<string> {
    const entry = await entryRepository.findById(entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    const messages = buildSummarizeMessages(entry);
    return this.provider.chat(messages, { temperature: 0.3 });
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

/** Events yielded by streamChat() */
export type StreamChatEvent =
  | { type: 'start'; conversationId: number }
  | { type: 'token'; content: string }
  | { type: 'done'; sources: Array<{ id: number; title: string; entry_type: string }>; conversationId: number }
  | { type: 'error'; message: string };

export const aiService = new AiService();
