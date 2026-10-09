// P2-03 — Chunk preview/edit: the four chunking strategies feed chunk
// preview/list/view/update/delete, and any edit invalidates the index vector.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findDocumentById: vi.fn(),
  saveChunks: vi.fn(),
  listByDocument: vi.fn(),
  findById: vi.fn(),
  updateText: vi.fn(),
  deleteById: vi.fn(),
  invalidateVector: vi.fn(),
  invalidateVectorsByDocument: vi.fn(),
}));

vi.mock('../../backend/repositories/knowledge-chunk.repository.js', () => ({
  knowledgeChunkRepository: {
    saveChunks: mocks.saveChunks,
    listByDocument: mocks.listByDocument,
    findById: mocks.findById,
    updateText: mocks.updateText,
    deleteById: mocks.deleteById,
    invalidateVector: mocks.invalidateVector,
    invalidateVectorsByDocument: mocks.invalidateVectorsByDocument,
  },
}));
vi.mock('../../backend/repositories/knowledge.repository.js', () => ({
  knowledgeRepository: { findDocumentById: mocks.findDocumentById },
}));

const { knowledgeChunkService } = await import('../../backend/services/chunk.service.js');

const DOC = {
  id: 7,
  content: [
    '# Title',
    '',
    'This is the first paragraph of the document and it is long enough to form a chunk on its own without being discarded by the minimum chunk size threshold.',
    '',
    '## Section One',
    '',
    'Here is another paragraph that contains enough text to exceed the minimum chunk size and therefore survive the chunking filter cleanly.',
    '',
    '## Section Two',
    '',
    'A third paragraph with plenty of words to ensure that the markdown chunker produces multiple chunks for the preview operation.',
    '',
  ].join('\n'),
};
const CHUNK = { id: 'doc_7_chunk_0', document_id: 7, index: 0, text: '# Title\n\nParagraph one.', strategy: 'markdown', heading: 'Title', start_char: 0, end_char: 20, metadata: { strategy: 'markdown', heading: 'Title' }, created_at: 'x', updated_at: 'x' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findDocumentById.mockResolvedValue(DOC);
});

describe('P2-03 chunk preview/edit', () => {
  it('preview chunks a document without persisting', async () => {
    const result = await knowledgeChunkService.preview(7, { strategy: 'markdown', chunk_size: 60, overlap: 0 });
    expect(result.doc_id).toBe(7);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]).toHaveProperty('text');
    expect(result.chunks[0]).toHaveProperty('strategy');
    expect(mocks.saveChunks).not.toHaveBeenCalled();
  });

  it('preview defaults to the markdown strategy', async () => {
    const result = await knowledgeChunkService.preview(7);
    expect(result.strategy).toBe('markdown');
    expect(result.chunk_size).toBe(1024);
    expect(result.overlap).toBe(128);
  });

  it('preview throws resource_not_found for an unknown document', async () => {
    mocks.findDocumentById.mockResolvedValueOnce(undefined);
    await expect(knowledgeChunkService.preview(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('list returns persisted chunks with a total', async () => {
    mocks.listByDocument.mockResolvedValue([CHUNK]);
    const result = await knowledgeChunkService.list(7);
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('doc_7_chunk_0');
    expect(mocks.listByDocument).toHaveBeenCalledWith(7);
  });

  it('view returns a chunk belonging to the document', async () => {
    mocks.findById.mockResolvedValue(CHUNK);
    const chunk = await knowledgeChunkService.view(7, 'doc_7_chunk_0');
    expect(chunk.text).toContain('Title');
  });

  it('view rejects a chunk belonging to another document', async () => {
    mocks.findById.mockResolvedValue({ ...CHUNK, document_id: 8 });
    await expect(knowledgeChunkService.view(7, 'doc_7_chunk_0')).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('update changes text and invalidates the index vector', async () => {
    mocks.findById.mockResolvedValue(CHUNK);
    mocks.updateText.mockResolvedValue({ ...CHUNK, text: 'new text' });
    const updated = await knowledgeChunkService.update(7, 'doc_7_chunk_0', 'new text');
    expect(updated.text).toBe('new text');
    expect(mocks.updateText).toHaveBeenCalledWith('doc_7_chunk_0', 'new text');
    expect(mocks.invalidateVector).toHaveBeenCalledWith('doc_7_chunk_0');
  });

  it('update rejects empty text', async () => {
    await expect(knowledgeChunkService.update(7, 'doc_7_chunk_0', '   ')).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('remove deletes a chunk and invalidates its vector', async () => {
    mocks.findById.mockResolvedValue(CHUNK);
    mocks.deleteById.mockResolvedValue(true);
    const result = await knowledgeChunkService.remove(7, 'doc_7_chunk_0');
    expect(result.deleted).toBe(true);
    expect(mocks.deleteById).toHaveBeenCalledWith('doc_7_chunk_0');
    expect(mocks.invalidateVector).toHaveBeenCalledWith('doc_7_chunk_0');
  });

  it('rechunk persists chunks and invalidates stale vectors', async () => {
    mocks.saveChunks.mockResolvedValue(undefined);
    const result = await knowledgeChunkService.rechunk(7, { strategy: 'paragraph' });
    expect(result.count).toBeGreaterThan(0);
    expect(mocks.saveChunks).toHaveBeenCalledWith(7, expect.any(Array));
    expect(mocks.invalidateVectorsByDocument).toHaveBeenCalledWith(7);
  });
});
