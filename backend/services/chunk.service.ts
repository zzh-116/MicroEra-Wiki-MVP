// Knowledge chunk service (P2-03) — chunk preview/edit over a document's
// parsed content, backed by the four chunking strategies in backend/chunk.
// Editing or deleting a chunk invalidates its vector so the index never serves
// stale text.
import { chunkService, type ChunkConfig, type ChunkResult } from '../chunk/service.js';
import { knowledgeChunkRepository, type KnowledgeChunkRow } from '../repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { ServiceError } from './knowledge.service.js';

export interface ChunkConfigInput {
  strategy?: 'fixed' | 'paragraph' | 'sentence' | 'markdown';
  chunk_size?: number;
  overlap?: number;
  min_chunk_size?: number;
}

export interface PreviewedChunk {
  id: string;
  index: number;
  text: string;
  start_char: number;
  end_char: number;
  strategy: string;
  heading?: string;
}

function toConfig(input: ChunkConfigInput): Partial<ChunkConfig> {
  const cfg: Partial<ChunkConfig> = {};
  if (input.strategy) cfg.strategy = input.strategy;
  if (input.chunk_size !== undefined) cfg.chunkSize = input.chunk_size;
  if (input.overlap !== undefined) cfg.overlap = input.overlap;
  if (input.min_chunk_size !== undefined) cfg.minChunkSize = input.min_chunk_size;
  return cfg;
}

function toPreviewed(c: ChunkResult): PreviewedChunk {
  return {
    id: c.id,
    index: c.index,
    text: c.text,
    start_char: c.startChar,
    end_char: c.endChar,
    strategy: String(c.metadata?.strategy ?? 'markdown'),
    heading: c.metadata?.heading ? String(c.metadata.heading) : undefined,
  };
}

export class KnowledgeChunkService {
  /** Resolve through the KB-aware finder so a chunk of a document in a deleted
   *  KB is unreachable (view/update/delete all call this first). */
  private async requireDocument(documentId: number): Promise<void> {
    if (!(await knowledgeRepository.findDocumentById(documentId))) {
      throw new ServiceError('resource_not_found', `document ${documentId} not found`);
    }
  }

  /** Chunk a document's content in-memory without persisting (preview). */
  async preview(documentId: number, config: ChunkConfigInput = {}): Promise<{ doc_id: number; strategy: string; chunk_size: number; overlap: number; chunks: PreviewedChunk[] }> {
    const doc = await knowledgeRepository.findDocumentById(documentId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${documentId} not found`);
    const cfg = toConfig(config);
    const strategy = cfg.strategy ?? 'markdown';
    const results = chunkService.chunk(doc.content ?? '', `doc_${documentId}`, cfg);
    return {
      doc_id: documentId,
      strategy,
      chunk_size: cfg.chunkSize ?? 1024,
      overlap: cfg.overlap ?? 128,
      chunks: results.map(toPreviewed),
    };
  }

  /** Chunk + persist a document's content (used by the ingest pipeline). */
  async rechunk(documentId: number, config: ChunkConfigInput = {}): Promise<{ doc_id: number; count: number }> {
    const doc = await knowledgeRepository.findDocumentById(documentId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${documentId} not found`);
    const results = chunkService.chunk(doc.content ?? '', `doc_${documentId}`, toConfig(config));
    await knowledgeChunkRepository.saveChunks(documentId, results);
    // Any prior vectors for this document are now stale.
    await knowledgeChunkRepository.invalidateVectorsByDocument(documentId);
    return { doc_id: documentId, count: results.length };
  }

  async list(documentId: number): Promise<{ doc_id: number; items: KnowledgeChunkRow[]; total: number }> {
    if (!(await knowledgeRepository.findDocumentById(documentId))) {
      throw new ServiceError('resource_not_found', `document ${documentId} not found`);
    }
    const items = await knowledgeChunkRepository.listByDocument(documentId);
    return { doc_id: documentId, items, total: items.length };
  }

  async view(documentId: number, chunkId: string): Promise<KnowledgeChunkRow> {
    await this.requireDocument(documentId);
    const chunk = await knowledgeChunkRepository.findById(chunkId);
    if (!chunk || chunk.document_id !== documentId) {
      throw new ServiceError('resource_not_found', `chunk ${chunkId} not found for document ${documentId}`);
    }
    return chunk;
  }

  async update(documentId: number, chunkId: string, text: string): Promise<KnowledgeChunkRow> {
    if (!text?.trim()) throw new ServiceError('validation_failed', 'chunk text is required');
    await this.requireDocument(documentId);
    const existing = await knowledgeChunkRepository.findById(chunkId);
    if (!existing || existing.document_id !== documentId) {
      throw new ServiceError('resource_not_found', `chunk ${chunkId} not found for document ${documentId}`);
    }
    const updated = await knowledgeChunkRepository.updateText(chunkId, text);
    // The old embedding no longer matches the text — drop it (index invalidation).
    await knowledgeChunkRepository.invalidateVector(chunkId);
    return updated!;
  }

  async remove(documentId: number, chunkId: string): Promise<{ deleted: boolean; id: string }> {
    await this.requireDocument(documentId);
    const existing = await knowledgeChunkRepository.findById(chunkId);
    if (!existing || existing.document_id !== documentId) {
      throw new ServiceError('resource_not_found', `chunk ${chunkId} not found for document ${documentId}`);
    }
    await knowledgeChunkRepository.deleteById(chunkId);
    await knowledgeChunkRepository.invalidateVector(chunkId);
    return { deleted: true, id: chunkId };
  }
}

export const knowledgeChunkService = new KnowledgeChunkService();
