// P2-05 — Ingest orchestration: parse → extract → chunk → embed → index →
// publish, with the publish committed atomically (revision + content + vectors
// in one transaction via publishDocument).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findDocumentById: vi.fn(),
  latestRevision: vi.fn(),
  extractAndSave: vi.fn(),
  saveChunks: vi.fn(),
  publishDocument: vi.fn(),
  embedBatch: vi.fn(),
}));

vi.mock('../../backend/repositories/knowledge.repository.js', () => ({
  knowledgeRepository: {
    findDocumentById: mocks.findDocumentById,
    latestRevision: mocks.latestRevision,
  },
}));
vi.mock('../../backend/repositories/knowledge-chunk.repository.js', () => ({
  knowledgeChunkRepository: {
    saveChunks: mocks.saveChunks,
    publishDocument: mocks.publishDocument,
  },
}));
vi.mock('../../backend/services/element.service.js', () => ({
  elementService: { extractAndSave: mocks.extractAndSave },
}));
vi.mock('../../backend/embedding/ollama.js', () => ({
  ollamaEmbedder: { embedBatch: mocks.embedBatch },
}));

const { ingestService } = await import('../../backend/services/ingest.service.js');

const DOC = {
  id: 7,
  kb_id: 1,
  title: 'Paper',
  content: [
    '# Title',
    '',
    'This is the first paragraph and it is long enough to form its own chunk when the markdown strategy runs over the document content.',
    '',
    '## Section One',
    '',
    'A second paragraph with plenty of words so that chunking produces more than one embeddable chunk for the ingest pipeline to process.',
    '',
  ].join('\n'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findDocumentById.mockResolvedValue(DOC);
  mocks.latestRevision.mockResolvedValue(null);
  mocks.extractAndSave.mockResolvedValue(3);
  mocks.saveChunks.mockResolvedValue(undefined);
  mocks.publishDocument.mockResolvedValue(undefined);
});

describe('P2-05 ingest orchestration', () => {
  it('runs parse → extract → chunk → embed → publish and commits atomically', async () => {
    mocks.embedBatch.mockResolvedValue({ vectors: [[0.1], [0.2]], failed: [] });
    const result = await ingestService.ingest(7);
    expect(result.status).toBe('completed');
    expect(result.revision_no).toBe(1);
    expect(result.elements).toBe(3);
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.embedded).toBe(result.chunks);
    expect(mocks.extractAndSave).toHaveBeenCalledWith(7, DOC.content);
    expect(mocks.saveChunks).toHaveBeenCalledWith(7, expect.any(Array));
    expect(mocks.publishDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 7,
        title: 'Paper',
        revisionNo: 1,
        checksum: expect.any(String),
        vectors: expect.any(Array),
      }),
    );
  });

  it('increments the revision number from the latest revision', async () => {
    mocks.embedBatch.mockResolvedValue({ vectors: [[0.1]], failed: [] });
    mocks.latestRevision.mockResolvedValue({ revision_no: 4 });
    const result = await ingestService.ingest(7);
    expect(result.revision_no).toBe(5);
  });

  it('skips failed embeddings and reports the failure count', async () => {
    mocks.embedBatch.mockResolvedValue({ vectors: [[0.1], []], failed: [{ index: 1, error: 'embed error' }] });
    const result = await ingestService.ingest(7);
    expect(result.embedded).toBeLessThan(result.chunks);
    expect(result.failed).toBe(1);
    // publish still gets a vector for the surviving chunk only.
    const publishArg = mocks.publishDocument.mock.calls[0][0];
    expect(publishArg.vectors).toHaveLength(1);
  });

  it('publishes a revision with zero vectors for empty content', async () => {
    mocks.findDocumentById.mockResolvedValue({ ...DOC, content: '' });
    mocks.embedBatch.mockResolvedValue({ vectors: [], failed: [] });
    const result = await ingestService.ingest(7);
    expect(result.chunks).toBe(0);
    expect(mocks.publishDocument).toHaveBeenCalledWith(expect.objectContaining({ vectors: [] }));
  });

  it('throws resource_not_found for an unknown document', async () => {
    mocks.findDocumentById.mockResolvedValue(undefined);
    await expect(ingestService.ingest(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
