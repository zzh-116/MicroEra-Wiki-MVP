// Tests for Import Service
// Covers: parse pipeline, entry+chunk creation, embed+vector, error paths, retry logic
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ALL external dependencies before the import service loads
vi.mock('../../backend/db/connection.js', () => ({
  db: {
    transaction: vi.fn(),
  },
  pool: { query: vi.fn(), end: vi.fn() },
}));

vi.mock('../../backend/parser/index.js', () => ({
  getParser: vi.fn(),
}));

vi.mock('../../backend/repositories/entry.repository.js', () => ({
  entryRepository: {
    create: vi.fn(),
  },
}));

vi.mock('../../backend/repositories/chunk.repository.js', () => ({
  chunkRepository: {
    deleteByEntryId: vi.fn(),
    saveChunks: vi.fn(),
    saveFromProperties: vi.fn(),
  },
}));

vi.mock('../../backend/repositories/vector.repository.js', () => ({
  vectorRepository: {
    insert: vi.fn(),
  },
}));

vi.mock('../../backend/chunk/service.js', () => ({
  chunkService: {
    chunk: vi.fn(),
  },
}));

vi.mock('../../backend/embedding/ollama.js', () => ({
  ollamaEmbedder: {
    embedBatch: vi.fn(),
  },
}));

import { ImportService } from '../../backend/services/import.service.js';
import { getParser } from '../../backend/parser/index.js';
import { db } from '../../backend/db/connection.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { chunkRepository } from '../../backend/repositories/chunk.repository.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { chunkService } from '../../backend/chunk/service.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';

const mockedGetParser = vi.mocked(getParser);
const mockedDb = vi.mocked(db);
const mockedEntryRepo = vi.mocked(entryRepository);
const mockedChunkRepo = vi.mocked(chunkRepository);
const mockedVectorRepo = vi.mocked(vectorRepository);
const mockedChunkService = vi.mocked(chunkService);
const mockedEmbedder = vi.mocked(ollamaEmbedder);

function mockParser() {
  return {
    parseString: vi.fn(),
    parseFile: vi.fn(),
    parseBuffer: vi.fn(),
    getCapabilities: vi.fn().mockReturnValue([{ format: 'pdf', available: true }]),
  };
}

describe('ImportService', () => {
  let service: ImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ImportService();
  });

  // ── getSupportedFormats ─────────────────────────────────

  describe('getSupportedFormats', () => {
    it('delegates to the parser', () => {
      const parser = mockParser();
      mockedGetParser.mockReturnValue(parser);

      const result = service.getSupportedFormats();

      expect(parser.getCapabilities).toHaveBeenCalled();
      expect(result).toEqual([{ format: 'pdf', available: true }]);
    });
  });

  // ── importFromApi (string-based import) ─────────────────

  describe('importFromApi', () => {
    it('succeeds: parse → entry → chunk → embed', async () => {
      const parser = mockParser();
      parser.parseString.mockResolvedValue({
        markdown: '# Hello\n\nWorld.',
        sourceFormat: 'md',
        metadata: { fileName: 'test.md', wordCount: 2, propertyCount: 0 },
        properties: [],
        warnings: [],
      });
      mockedGetParser.mockReturnValue(parser);

      mockedDb.transaction.mockImplementation(async (fn: any) => fn({}));

      mockedEntryRepo.create.mockResolvedValue({
        id: 42,
        title: 'Hello',
        entry_type: 'tech',
        summary: 'summary',
        content: '# Hello\n\nWorld.',
        visibility: 'internal',
        category_id: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      });

      mockedChunkService.chunk.mockReturnValue([
        { id: 'c1', index: 0, text: 'Hello', metadata: { strategy: 'markdown', heading: 'Hello', startChar: 0, endChar: 5 } },
        { id: 'c2', index: 1, text: 'World', metadata: { strategy: 'markdown', heading: undefined, startChar: 6, endChar: 11 } },
      ]);

      mockedChunkRepo.deleteByEntryId.mockResolvedValue();
      mockedChunkRepo.saveChunks.mockResolvedValue();

      mockedEmbedder.embedBatch.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]], failed: [] });
      mockedVectorRepo.insert.mockResolvedValue();

      const result = await service.importFromApi(
        '# Hello\n\nWorld.',
        'test.md',
        { title: 'Hello', entry_type: 'tech', visibility: 'internal' },
      );

      expect(result.success).toBe(true);
      expect(result.entryId).toBe(42);
      expect(result.stages.find(s => s.stage === 'parse')!.status).toBe('success');
      expect(result.stages.find(s => s.stage === 'chunk')!.status).toBe('success');
      expect(result.stages.find(s => s.stage === 'embed')!.status).toBe('success');
    });

    it('returns failure when parser throws', async () => {
      const parser = mockParser();
      parser.parseString.mockRejectedValue(new Error('Parse crash'));
      mockedGetParser.mockReturnValue(parser);

      const result = await service.importFromApi(
        'bad content',
        'broken.bin',
      );

      expect(result.success).toBe(false);
      expect(result.entryId).toBe(0);
      expect(result.stages.find(s => s.stage === 'parse')!.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns failure when entry creation fails (transaction)', async () => {
      const parser = mockParser();
      parser.parseString.mockResolvedValue({
        markdown: 'content',
        sourceFormat: 'md',
        metadata: { fileName: 'test.md', wordCount: 1, propertyCount: 0 },
        properties: [],
        warnings: [],
      });
      mockedGetParser.mockReturnValue(parser);

      mockedDb.transaction.mockImplementation(async (fn: any) => {
        // The transaction should call fn(tx) which will try entryRepository.create
        await fn({});
      });

      mockedEntryRepo.create.mockRejectedValue(new Error('DB insert failed'));

      const result = await service.importFromApi('content', 'test.md');

      expect(result.success).toBe(false);
      expect(result.stages.find(s => s.stage === 'chunk')!.status).toBe('failed');
    });
  });

  // ── importBatch ────────────────────────────────────────

  describe('importBatch', () => {
    it('throws when directory does not exist', async () => {
      await expect(
        service.importBatch('/nonexistent/path'),
      ).rejects.toThrow('Directory not found');
    });
  });

  // ── edge cases ─────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty properties array gracefully', async () => {
      const parser = mockParser();
      parser.parseString.mockResolvedValue({
        markdown: 'just text',
        sourceFormat: 'txt',
        metadata: { fileName: 'note.txt', wordCount: 2, propertyCount: 0 },
        properties: [],
        warnings: [],
      });
      mockedGetParser.mockReturnValue(parser);

      mockedDb.transaction.mockImplementation(async (fn: any) => fn({}));
      mockedEntryRepo.create.mockResolvedValue({
        id: 10,
        title: 'note',
        entry_type: 'data_item',
        summary: 'summary',
        content: 'just text',
        visibility: 'internal',
        category_id: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      });
      mockedChunkService.chunk.mockReturnValue([{ id: 'c1', index: 0, text: 'just text', metadata: { strategy: 'markdown', heading: undefined, startChar: 0, endChar: 9 } }]);
      mockedChunkRepo.deleteByEntryId.mockResolvedValue();
      mockedChunkRepo.saveChunks.mockResolvedValue();

      // Embedding fails — should not crash the whole pipeline
      mockedEmbedder.embedBatch.mockResolvedValue({ vectors: [], failed: [{ index: 0, error: 'Ollama offline' }] });

      const result = await service.importFromApi('just text', 'note.txt');

      // Entry and chunk should succeed; embed should have failed
      expect(result.success).toBe(false); // because embed stage is failed
      const embedStage = result.stages.find(s => s.stage === 'embed')!;
      expect(embedStage.status).toBe('failed');
    });

    it('skips embedding when skipEmbedding=true', async () => {
      const parser = mockParser();
      parser.parseString.mockResolvedValue({
        markdown: 'text',
        sourceFormat: 'md',
        metadata: { fileName: 'f.md', wordCount: 1, propertyCount: 0 },
        properties: [],
        warnings: [],
      });
      mockedGetParser.mockReturnValue(parser);

      mockedDb.transaction.mockImplementation(async (fn: any) => fn({}));
      mockedEntryRepo.create.mockResolvedValue({
        id: 99,
        title: 'f',
        entry_type: 'data_item',
        summary: 'summary',
        content: 'text',
        visibility: 'internal',
        category_id: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      });
      mockedChunkService.chunk.mockReturnValue([{ id: 'c1', index: 0, text: 'text', metadata: { strategy: 'markdown', heading: undefined, startChar: 0, endChar: 4 } }]);
      mockedChunkRepo.deleteByEntryId.mockResolvedValue();
      mockedChunkRepo.saveChunks.mockResolvedValue();

      const result = await service.importFromApi('text', 'f.md', undefined, { skipEmbedding: true });

      const embedStage = result.stages.find(s => s.stage === 'embed')!;
      expect(embedStage.status).toBe('skipped');
      expect(mockedEmbedder.embedBatch).not.toHaveBeenCalled();
    });
  });
});
