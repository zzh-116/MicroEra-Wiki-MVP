// Chat service (P4) — grounded Q&A over the v2 retrieval pipeline. `ask` and
// `stream` retrieve the most relevant chunks (vector/lexical/hybrid), build a
// citation-grounded prompt, and return an answer + citation list; sessions and
// messages persist the conversation and its grounding trace (chat.trace).
//
// This is the v2 chat slice; the legacy entry-based ai.service.ts is untouched.
import { randomUUID } from 'node:crypto';
import { getLLMProvider } from '../llm/index.js';
import { retrievalService } from './retrieval.service.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { knowledgeChunkRepository } from '../repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import type { ChatMessage } from '../types.js';
import { ServiceError } from './knowledge.service.js';

export interface Citation {
  index: number;
  chunk_id: string;
  document_id: number;
  title: string;
  text: string;
  score: number;
}

export interface AskInput {
  question: string;
  kb_ids?: number[];
  session_id?: string;
  top_k?: number;
  method?: 'vector' | 'lexical' | 'hybrid';
  is_internal?: boolean;
  /** Caller identity for ownership checks (set by the route layer). */
  user_id?: number;
}

export interface ChatResult {
  answer: string;
  citations: Citation[];
  session_id: string | null;
  trace: Record<string, unknown>;
}

const MAX_TOP_K = 50;
const MAX_CITATION_CHARS = 600;

/** AbortControllers for in-flight streams, keyed by session id (chat.cancel /
 *  session.stop). */
const activeStreams = new Map<string, AbortController>();

function clampTopK(n: number): number {
  return Math.min(Math.max(n, 1), MAX_TOP_K);
}

function buildGroundedMessages(question: string, citations: Citation[]): ChatMessage[] {
  const context = citations.map((c) => `[${c.index}] ${c.title}\n${c.text}`).join('\n\n');
  return [
    {
      role: 'system',
      content:
        'You are the MicroEra Wiki enterprise knowledge assistant. Answer using ONLY the provided context passages. ' +
        'Cite each factual claim with [n] referencing the passage number. If the context is insufficient, say so ' +
        'honestly. Do not invent information.',
    },
    {
      role: 'user',
      content: `Context passages:\n${context || '(none)'}\n\nQuestion: ${question}\n\nAnswer (cite with [n]):`,
    },
  ];
}

export class ChatService {
  /** Retrieve + merge + dedupe chunks across the scoped KBs. */
  private async retrieve(input: {
    query: string;
    kb_ids?: number[];
    top_k: number;
    method: 'vector' | 'lexical' | 'hybrid';
    is_internal?: boolean;
  }): Promise<Array<{ chunk_id: string; document_id: number; title: string; text: string; score: number }>> {
    const kbIds = input.kb_ids && input.kb_ids.length > 0 ? input.kb_ids : [undefined];
    const lists = await Promise.all(
      kbIds.map((kb_id) => {
        const scope = { query: input.query, kb_id, top_k: input.top_k, is_internal: input.is_internal };
        if (input.method === 'lexical') return retrievalService.lexicalSearch(scope);
        if (input.method === 'vector') return retrievalService.vectorSearch(scope);
        return retrievalService.hybridSearch(scope);
      }),
    );

    const byId = new Map<string, { chunk_id: string; document_id: number; title: string; text: string; score: number }>();
    for (const list of lists) {
      for (const h of list) {
        const prev = byId.get(h.chunk_id);
        if (!prev || h.score > prev.score) {
          byId.set(h.chunk_id, { chunk_id: h.chunk_id, document_id: h.document_id, title: h.title, text: h.text, score: h.score });
        }
      }
    }
    return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, input.top_k);
  }

  private citations(hits: Array<{ chunk_id: string; document_id: number; title: string; text: string; score: number }>): Citation[] {
    return hits.map((h, i) => ({
      index: i + 1,
      chunk_id: h.chunk_id,
      document_id: h.document_id,
      title: h.title,
      text: h.text.slice(0, MAX_CITATION_CHARS),
      score: h.score,
    }));
  }

  async ask(input: AskInput): Promise<ChatResult> {
    const question = (input.question ?? '').trim();
    if (!question) throw new ServiceError('validation_failed', 'question is required');
    const method = input.method ?? 'hybrid';
    const topK = clampTopK(input.top_k ?? 6);

    // Resolve session scope if a session is supplied.
    let session = input.session_id ? await chatRepository.findSessionById(input.session_id) : undefined;
    if (input.session_id && !session) throw new ServiceError('resource_not_found', 'session not found');
    if (session && input.user_id != null && session.user_id !== input.user_id) throw new ServiceError('resource_not_found', 'session not found');
    const kbIds = input.kb_ids ?? session?.kb_ids ?? undefined;

    const t0 = Date.now();
    const hits = await this.retrieve({ query: question, kb_ids: kbIds, top_k: topK, method, is_internal: input.is_internal });
    const retrievedAt = Date.now() - t0;
    const cites = this.citations(hits);

    // Include recent history when session-scoped.
    const historyMessages: ChatMessage[] = [];
    if (session) {
      const prior = await chatRepository.listMessagesBySession(session.id);
      for (const m of prior.slice(-6)) historyMessages.push({ role: m.role, content: m.content });
    }

    const messages = [...historyMessages, ...buildGroundedMessages(question, cites)];
    const t1 = Date.now();
    const answer = (await getLLMProvider().chat(messages, { temperature: 0.3 })).trim();
    const trace = {
      method,
      top_k: topK,
      kb_ids: kbIds ?? [],
      num_chunks: hits.length,
      retrieved_ms: retrievedAt,
      generated_ms: Date.now() - t1,
      total_ms: Date.now() - t0,
    };

    if (session) {
      await chatRepository.createMessage({ id: `msg_${randomUUID()}`, sessionId: session.id, role: 'user', content: question });
      await chatRepository.createMessage({
        id: `msg_${randomUUID()}`,
        sessionId: session.id,
        role: 'assistant',
        content: answer,
        citations: cites,
        trace,
      });
      await chatRepository.touchSession(session.id);
    }

    return { answer, citations: cites, session_id: session?.id ?? null, trace };
  }

  /** Streaming ask — yields start/token/done/error events; persists on done. */
  async *stream(input: AskInput): AsyncGenerator<Record<string, unknown>> {
    const question = (input.question ?? '').trim();
    if (!question) { yield { type: 'error', message: 'question is required' }; return; }
    const method = input.method ?? 'hybrid';
    const topK = clampTopK(input.top_k ?? 6);

    let session = input.session_id ? await chatRepository.findSessionById(input.session_id) : undefined;
    if (input.session_id && !session) { yield { type: 'error', message: 'session not found' }; return; }
    if (session && input.user_id != null && session.user_id !== input.user_id) { yield { type: 'error', message: 'session not found' }; return; }
    const kbIds = input.kb_ids ?? session?.kb_ids ?? undefined;

    const t0 = Date.now();
    const hits = await this.retrieve({ query: question, kb_ids: kbIds, top_k: topK, method, is_internal: input.is_internal });
    const cites = this.citations(hits);
    const messages = [...buildGroundedMessages(question, cites)];

    const controller = new AbortController();
    if (session) activeStreams.set(session.id, controller);
    try {
      yield { type: 'start', session_id: session?.id ?? null };
      let answer = '';
      for await (const chunk of getLLMProvider().streamChat(messages, { temperature: 0.3 }, controller.signal)) {
        if (chunk.done) break;
        answer += chunk.token;
        yield { type: 'token', content: chunk.token };
      }
      const trace = {
        method, top_k: topK, kb_ids: kbIds ?? [], num_chunks: hits.length,
        total_ms: Date.now() - t0,
      };
      if (session) {
        await chatRepository.createMessage({ id: `msg_${randomUUID()}`, sessionId: session.id, role: 'user', content: question });
        await chatRepository.createMessage({ id: `msg_${randomUUID()}`, sessionId: session.id, role: 'assistant', content: answer.trim(), citations: cites, trace });
        await chatRepository.touchSession(session.id);
      }
      yield { type: 'done', answer: answer.trim(), citations: cites, session_id: session?.id ?? null };
    } finally {
      if (session) activeStreams.delete(session.id);
    }
  }

  /** Abort an in-flight stream (chat.cancel / session.stop). */
  async cancel(sessionId: string): Promise<{ cancelled: boolean }> {
    const c = activeStreams.get(sessionId);
    if (c) { c.abort(); activeStreams.delete(sessionId); return { cancelled: true }; }
    return { cancelled: false };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  async createSession(input: { user_id: number; title?: string; kb_ids?: number[]; scope?: Record<string, unknown> }) {
    return chatRepository.createSession({
      id: `sess_${randomUUID()}`,
      userId: input.user_id,
      title: input.title,
      kbIds: input.kb_ids,
      scope: input.scope,
    });
  }

  async listSessions(userId: number, input: { page?: number; page_size?: number }) {
    return chatRepository.listSessionsByUser(userId, { page: input.page, pageSize: input.page_size });
  }

  async viewSession(userId: number, sessionId: string) {
    const s = await chatRepository.findSessionById(sessionId);
    if (!s || s.user_id !== userId) throw new ServiceError('resource_not_found', 'session not found');
    return s;
  }

  async deleteSession(userId: number, sessionId: string) {
    const s = await chatRepository.findSessionById(sessionId);
    if (!s || s.user_id !== userId) throw new ServiceError('resource_not_found', 'session not found');
    await chatRepository.softDeleteSession(sessionId);
    return { deleted: true, id: sessionId };
  }

  async setScope(userId: number, sessionId: string, scope: { kb_ids?: number[]; top_k?: number; method?: string }) {
    const s = await chatRepository.findSessionById(sessionId);
    if (!s || s.user_id !== userId) throw new ServiceError('resource_not_found', 'session not found');
    const next = { ...s.scope, ...scope };
    return chatRepository.updateSession(sessionId, { kbIds: scope.kb_ids ?? s.kb_ids, scope: next });
  }

  async exportSession(userId: number, sessionId: string) {
    const s = await chatRepository.findSessionById(sessionId);
    if (!s || s.user_id !== userId) throw new ServiceError('resource_not_found', 'session not found');
    const msgs = await chatRepository.listMessagesBySession(sessionId);
    return { session: s, messages: msgs, exported_at: new Date().toISOString() };
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  async listMessages(userId: number, sessionId: string) {
    const s = await chatRepository.findSessionById(sessionId);
    if (!s || s.user_id !== userId) throw new ServiceError('resource_not_found', 'session not found');
    const items = await chatRepository.listMessagesBySession(sessionId);
    return { session_id: sessionId, items, total: items.length };
  }

  async viewMessage(userId: number, messageId: string) {
    const m = await chatRepository.findMessageById(messageId);
    if (!m) throw new ServiceError('resource_not_found', 'message not found');
    const s = await chatRepository.findSessionById(m.session_id);
    if (!s || s.user_id !== userId) throw new ServiceError('resource_not_found', 'message not found');
    return m;
  }

  async searchMessages(userId: number, input: { q: string; session_id?: string }) {
    if (!input.q?.trim()) throw new ServiceError('validation_failed', 'q is required');
    // Scope the search to the caller's sessions.
    const owned = await chatRepository.listSessionsByUser(userId, { page: 1, pageSize: 1000 });
    const ownedIds = new Set(owned.items.map((s) => s.id));
    const { items, total } = await chatRepository.searchMessages({ q: input.q.trim(), sessionId: input.session_id });
    const visible = items.filter((m) => ownedIds.has(m.session_id));
    return { items: visible, total: visible.length };
  }

  // ── Citations (P4-02) ─────────────────────────────────────────────────────
  async references(userId: number, messageId: string) {
    const m = await this.viewMessage(userId, messageId);
    return { message_id: messageId, citations: m.citations };
  }

  async citationRead(chunkId: string) {
    const chunk = await knowledgeChunkRepository.findById(chunkId);
    if (!chunk) throw new ServiceError('resource_not_found', 'citation chunk not found');
    const doc = await knowledgeRepository.findDocumentById(chunk.document_id);
    if (!doc) throw new ServiceError('resource_not_found', 'citation document not found');
    return {
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      title: doc.title,
      text: chunk.text,
      strategy: chunk.strategy,
      heading: chunk.heading,
    };
  }

  async verifyCitations(userId: number, messageId: string) {
    const m = await this.viewMessage(userId, messageId);
    const verified = await Promise.all(
      (m.citations as Citation[]).map(async (c) => {
        const chunk = await knowledgeChunkRepository.findById(c.chunk_id);
        const doc = chunk ? await knowledgeRepository.findDocumentById(chunk.document_id) : undefined;
        return { ...c, resolved: !!chunk && !!doc };
      }),
    );
    const resolved = verified.filter((v) => v.resolved).length;
    return { message_id: messageId, citations: verified, resolved, total: verified.length };
  }

  async trace(userId: number, messageId: string) {
    const m = await this.viewMessage(userId, messageId);
    return { message_id: messageId, session_id: m.session_id, role: m.role, trace: m.trace, citations: m.citations };
  }
}

export const chatService = new ChatService();
