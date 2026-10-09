// P4 — chat service: grounded Q&A (ask/stream), sessions/messages, citations,
// scope, trace and export, with the LLM + retrieval + repositories mocked out.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatService } from '../../backend/services/chat.service.js';
import { getLLMProvider } from '../../backend/llm/index.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';
import { chatRepository } from '../../backend/repositories/chat.repository.js';
import { knowledgeChunkRepository } from '../../backend/repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../../backend/repositories/knowledge.repository.js';

const llm = {
  name: 'mock',
  defaultModel: 'mock',
  chat: vi.fn(),
  streamChat: vi.fn(),
};

function session(userId = 1, kbIds: number[] = [1]): any {
  return {
    id: 'sess_1',
    user_id: userId,
    title: 'New Chat',
    kb_ids: kbIds,
    scope: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
}

function hit(document_id: number, chunk_id = `c${document_id}`): any {
  return { chunk_id, document_id, title: `Doc ${document_id}`, text: `text ${document_id}`, score: 0.9 };
}

vi.mock('../../backend/llm/index.js', () => ({ getLLMProvider: () => llm }));

describe('P4 chat service — chat.ask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    llm.chat.mockReset();
    llm.chat.mockResolvedValue('The answer [1].');
    vi.spyOn(retrievalService, 'hybridSearch').mockResolvedValue([hit(2), hit(3)]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects an empty question', async () => {
    await expect(chatService.ask({ question: '   ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('answers statelessly with citations when no session is given', async () => {
    const r = await chatService.ask({ question: 'q', method: 'hybrid', top_k: 5 });
    expect(r.session_id).toBeNull();
    expect(r.answer).toBe('The answer [1].');
    expect(r.citations).toHaveLength(2);
    expect(r.citations[0]).toMatchObject({ index: 1, chunk_id: 'c2', document_id: 2, title: 'Doc 2' });
    expect(r.trace).toMatchObject({ method: 'hybrid', top_k: 5, num_chunks: 2 });
    expect(retrievalService.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'q', top_k: 5 }),
    );
  });

  it('persists the turn and uses session scope when a session is given', async () => {
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue(session(1, [7]));
    vi.spyOn(chatRepository, 'listMessagesBySession').mockResolvedValue([]);
    const create = vi.spyOn(chatRepository, 'createMessage').mockImplementation(async (m: any) => ({ ...m, created_at: new Date().toISOString() }));
    const touch = vi.spyOn(chatRepository, 'touchSession').mockResolvedValue();

    const r = await chatService.ask({ question: 'q', session_id: 'sess_1', user_id: 1 });

    expect(r.session_id).toBe('sess_1');
    expect(retrievalService.hybridSearch).toHaveBeenCalledWith(expect.objectContaining({ kb_id: 7 }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((c) => c[0].role)).toEqual(['user', 'assistant']);
    expect(create.mock.calls[1][0].citations).toHaveLength(2);
    expect(touch).toHaveBeenCalledWith('sess_1');
  });

  it('rejects an unknown or foreign session', async () => {
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue(undefined);
    await expect(chatService.ask({ question: 'q', session_id: 'sess_x', user_id: 1 }))
      .rejects.toMatchObject({ kind: 'resource_not_found' });

    vi.mocked(chatRepository.findSessionById).mockResolvedValue(session(2));
    await expect(chatService.ask({ question: 'q', session_id: 'sess_1', user_id: 1 }))
      .rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});

describe('P4 chat service — citations', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('citationRead resolves a chunk + document title', async () => {
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue({
      id: 'chunk_1', document_id: 2, text: 'full text', strategy: 'markdown', heading: '## H',
      index: 0, start_char: 0, end_char: 9, metadata: {}, created_at: '', updated_at: '',
    } as any);
    vi.spyOn(knowledgeRepository, 'findDocumentById').mockResolvedValue({ title: 'Doc 2' } as any);
    const r = await chatService.citationRead('chunk_1');
    expect(r.title).toBe('Doc 2');
    expect(r.chunk_id).toBe('chunk_1');
  });

  it('citationRead rejects a missing chunk', async () => {
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue(undefined);
    await expect(chatService.citationRead('nope')).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('verifyCitations flags unresolved anchors', async () => {
    vi.spyOn(chatRepository, 'findMessageById').mockResolvedValue({
      id: 'msg_1', session_id: 'sess_1', role: 'assistant', content: 'a',
      citations: [{ index: 1, chunk_id: 'c1', document_id: 1, title: 't', text: 't', score: 1 }],
      trace: {}, created_at: '',
    } as any);
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue(session(1));
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue(undefined);

    const r = await chatService.verifyCitations(1, 'msg_1');
    expect(r.resolved).toBe(0);
    expect(r.total).toBe(1);
    expect(r.citations[0].resolved).toBe(false);
  });
});

describe('P4 chat service — sessions + messages', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('viewSession enforces ownership', async () => {
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue(session(2));
    await expect(chatService.viewSession(1, 'sess_1')).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('deleteSession soft-deletes an owned session', async () => {
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue(session(1));
    const del = vi.spyOn(chatRepository, 'softDeleteSession').mockResolvedValue(true);
    const r = await chatService.deleteSession(1, 'sess_1');
    expect(r.deleted).toBe(true);
    expect(del).toHaveBeenCalledWith('sess_1');
  });

  it('searchMessages scopes results to the caller sessions', async () => {
    vi.spyOn(chatRepository, 'listSessionsByUser').mockResolvedValue({ items: [session(1)], total: 1 });
    vi.spyOn(chatRepository, 'searchMessages').mockResolvedValue({
      items: [
        { id: 'm1', session_id: 'sess_1', role: 'user', content: 'hit', citations: [], trace: {}, created_at: '' },
        { id: 'm2', session_id: 'sess_other', role: 'user', content: 'hit', citations: [], trace: {}, created_at: '' },
      ],
      total: 2,
    } as any);
    const r = await chatService.searchMessages(1, { q: 'hit' });
    expect(r.total).toBe(1);
    expect(r.items[0].id).toBe('m1');
  });

  it('trace returns the message grounding trace', async () => {
    vi.spyOn(chatRepository, 'findMessageById').mockResolvedValue({
      id: 'msg_1', session_id: 'sess_1', role: 'assistant', content: 'a',
      citations: [], trace: { method: 'hybrid', num_chunks: 3 }, created_at: '',
    } as any);
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue(session(1));
    const r = await chatService.trace(1, 'msg_1');
    expect(r.trace).toMatchObject({ method: 'hybrid', num_chunks: 3 });
  });
});
