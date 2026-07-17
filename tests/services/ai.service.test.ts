// Tests for AI Service
// Covers: chat (non-streaming), streamChat (SSE events), summarize, search fallback
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock external dependencies ----
vi.mock('../../backend/llm/index.js', () => ({
  getLLMProvider: vi.fn(),
}));

vi.mock('../../backend/services/search.service.js', () => ({
  searchService: {
    semanticSearch: vi.fn(),
  },
}));

vi.mock('../../backend/repositories/entry.repository.js', () => ({
  entryRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../backend/repositories/conversation.repository.js', () => ({
  conversationRepository: {
    create: vi.fn(),
    addMessage: vi.fn(),
    getHistory: vi.fn(),
    getMessages: vi.fn(),
  },
}));

vi.mock('../../backend/ai/prompts.js', () => ({
  buildChatSystemPrompt: vi.fn().mockReturnValue('SYSTEM PROMPT'),
  buildSummarizeMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'Summarize' }]),
  buildSearchMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'Search' }]),
}));

import { aiService } from '../../backend/services/ai.service.js';
import { getLLMProvider } from '../../backend/llm/index.js';
import { searchService } from '../../backend/services/search.service.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { conversationRepository } from '../../backend/repositories/conversation.repository.js';
import type { Entry, RetrievalResult, ChatMessage } from '../../backend/types.js';

const mockedGetLLMProvider = vi.mocked(getLLMProvider);
const mockedSearchService = vi.mocked(searchService);
const mockedEntryRepo = vi.mocked(entryRepository);
const mockedConvRepo = vi.mocked(conversationRepository);

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    title: 'Test Entry',
    entry_type: 'tech',
    summary: 'A test entry',
    content: 'Content here.',
    visibility: 'public',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags: ['test'],
    ...overrides,
  };
}

function makeRetrievalResult(entry: Entry, score = 0.9, chunkText = 'chunk text'): RetrievalResult {
  return {
    entryId: entry.id,
    entry,
    chunkId: `c_${entry.id}`,
    chunkText,
    chunkHeading: '## Section',
    score,
  };
}

function mockProvider() {
  const provider = {
    chat: vi.fn().mockResolvedValue('Non-streaming answer'),
    streamChat: vi.fn(),
  };
  mockedGetLLMProvider.mockReturnValue(provider);
  return provider;
}

describe('AiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── chat (non-streaming) ───────────────────────────────

  describe('chat', () => {
    it('returns answer with sources and conversationId', async () => {
      const provider = mockProvider();
      const entry = makeEntry({ id: 1, title: 'Quantum Computing' });
      const results = [makeRetrievalResult(entry)];

      mockedConvRepo.create.mockResolvedValue({ id: 100 } as any);
      mockedSearchService.semanticSearch.mockResolvedValue(results);
      mockedConvRepo.getHistory.mockResolvedValue([]);

      const result = await aiService.chat('What is quantum?', 1);

      expect(result.conversationId).toBe(100);
      expect(result.answer).toBe('Non-streaming answer');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('Quantum Computing');
      expect(provider.chat).toHaveBeenCalled();
    });

    it('returns empty sources when no retrieval results', async () => {
      const provider = mockProvider();
      mockedConvRepo.create.mockResolvedValue({ id: 200 } as any);
      mockedSearchService.semanticSearch.mockResolvedValue([]);
      mockedConvRepo.getHistory.mockResolvedValue([]);

      const result = await aiService.chat('nothing', 1);

      expect(result.sources).toHaveLength(0);
      expect(provider.chat).toHaveBeenCalled();
    });
  });

  // ── streamChat ──────────────────────────────────────────

  describe('streamChat', () => {
    it('yields start → token(s) → done in order', async () => {
      const provider = mockProvider();
      const entry = makeEntry({ id: 5, title: 'Stream Test', entry_type: 'tech' });
      const results = [makeRetrievalResult(entry, 0.95, 'test chunk')];

      mockedConvRepo.create.mockResolvedValue({ id: 300 } as any);
      mockedSearchService.semanticSearch.mockResolvedValue(results);
      mockedConvRepo.getHistory.mockResolvedValue([]);

      // Mock streaming provider: yield 2 tokens then done
      async function* mockStream() {
        yield { token: 'Hello', done: false };
        yield { token: ' world', done: false };
        yield { token: '', done: true };
      }
      provider.streamChat.mockReturnValue(mockStream());

      const events: any[] = [];
      for await (const event of aiService.streamChat('Hi', 1)) {
        events.push(event);
      }

      // Verify event sequence
      expect(events[0]).toEqual({ type: 'start', conversationId: 300 });
      expect(events[1]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[2]).toEqual({ type: 'token', content: ' world' });
      expect(events[events.length - 1]).toMatchObject({ type: 'done' });

      const doneEvent = events[events.length - 1] as any;
      expect(doneEvent.sources).toHaveLength(1);
      expect(doneEvent.sources[0].title).toBe('Stream Test');
      expect(doneEvent.sources[0].entry_type).toBe('tech');
    });

    it('yields error event when provider.streamChat throws synchronously', async () => {
      const provider = mockProvider();
      const entry = makeEntry({ id: 6, title: 'Error Test', entry_type: 'tech' });
      const results = [makeRetrievalResult(entry)];

      mockedConvRepo.create.mockResolvedValue({ id: 400 } as any);
      mockedSearchService.semanticSearch.mockResolvedValue(results);
      mockedConvRepo.getHistory.mockResolvedValue([]);

      // Provider throws during iteration — simulates LLM connection failure
      async function* mockStream() {
        throw new Error('LLM timeout');
      }
      provider.streamChat.mockReturnValue(mockStream());

      const events: any[] = [];
      for await (const event of aiService.streamChat('crash', 1)) {
        events.push(event);
      }

      // Should get start then error
      expect(events[0]).toMatchObject({ type: 'start' });
      const errorEvent = events.find((e: any) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.message).toContain('LLM timeout');
    });

    it('yields error when stream throws mid-generation', async () => {
      const provider = mockProvider();
      const entry = makeEntry({ id: 7, title: 'Mid Error', entry_type: 'tech' });
      const results = [makeRetrievalResult(entry)];

      mockedConvRepo.create.mockResolvedValue({ id: 500 } as any);
      mockedSearchService.semanticSearch.mockResolvedValue(results);
      mockedConvRepo.getHistory.mockResolvedValue([]);

      // Stream that throws after first token
      async function* mockStream() {
        yield { token: 'Partial', done: false };
        throw new Error('Connection lost');
      }
      provider.streamChat.mockReturnValue(mockStream());

      const events: any[] = [];
      for await (const event of aiService.streamChat('hi', 1)) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({ type: 'start' });
      expect(events[1]).toMatchObject({ type: 'token', content: 'Partial' });
      const errorEvent = events.find((e: any) => e.type === 'error');
      expect(errorEvent).toBeDefined();
    });
  });

  // ── summarize ───────────────────────────────────────────

  describe('summarize', () => {
    it('calls LLM with summarize messages for a valid entry', async () => {
      const provider = mockProvider();
      const entry = makeEntry({ id: 10 });
      mockedEntryRepo.findById.mockResolvedValue(entry);
      provider.chat.mockResolvedValue('This is a summary.');

      const result = await aiService.summarize(10);

      expect(result).toBe('This is a summary.');
      expect(mockedEntryRepo.findById).toHaveBeenCalledWith(10);
      expect(provider.chat).toHaveBeenCalled();
    });

    it('throws ENTRY_NOT_FOUND when entry does not exist', async () => {
      mockProvider();
      mockedEntryRepo.findById.mockResolvedValue(undefined as any);

      await expect(aiService.summarize(999)).rejects.toThrow('ENTRY_NOT_FOUND');
    });
  });

  // ── search (semantic with LLM fallback) ─────────────────

  describe('search', () => {
    it('returns entries from semantic search', async () => {
      const entry = makeEntry({ id: 20, title: 'Found Entry' });
      mockedSearchService.semanticSearch.mockResolvedValue([makeRetrievalResult(entry)]);

      const results = await aiService.search('quantum', false);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Found Entry');
    });

    it('falls back to LLM when semantic search fails', async () => {
      const provider = mockProvider();
      const entries = [makeEntry({ id: 30 }), makeEntry({ id: 31 })];
      mockedSearchService.semanticSearch.mockRejectedValue(new Error('Vector store down'));
      mockedEntryRepo.findAll.mockResolvedValue(entries);
      provider.chat.mockResolvedValue('[30]');

      const results = await aiService.search('test');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(30);
    });

    it('returns empty when semantic search fails and no entries exist', async () => {
      mockProvider();
      mockedSearchService.semanticSearch.mockRejectedValue(new Error('Down'));
      mockedEntryRepo.findAll.mockResolvedValue([]);

      const results = await aiService.search('test');

      expect(results).toHaveLength(0);
    });
  });
});
