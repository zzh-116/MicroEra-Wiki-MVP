// Ingest orchestration (P2-05) — runs the full parse → extract elements →
// chunk → embed → index → publish pipeline for a document, and commits the
// publish atomically (revision append + content update + vector replace in one
// transaction). The parse stage consumes the document's already-parsed markdown
// content (raw file parsing happens at upload, wired in P2-06).
import { chunkService, type ChunkConfig } from '../chunk/service.js';
import { elementService } from './element.service.js';
import { knowledgeChunkRepository } from '../repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import { sha256 } from '../utils/hash.js';
import { ServiceError } from './knowledge.service.js';

export interface IngestConfig {
  strategy?: 'fixed' | 'paragraph' | 'sentence' | 'markdown';
  chunk_size?: number;
  overlap?: number;
  min_chunk_size?: number;
}

export interface IngestResult {
  document_id: number;
  revision_no: number;
  status: 'completed';
  elements: number;
  chunks: number;
  embedded: number;
  failed: number;
  checksum: string;
}

function toConfig(input: IngestConfig): Partial<ChunkConfig> {
  const cfg: Partial<ChunkConfig> = {};
  if (input.strategy) cfg.strategy = input.strategy;
  if (input.chunk_size !== undefined) cfg.chunkSize = input.chunk_size;
  if (input.overlap !== undefined) cfg.overlap = input.overlap;
  if (input.min_chunk_size !== undefined) cfg.minChunkSize = input.min_chunk_size;
  return cfg;
}

export class IngestService {
  async ingest(documentId: number, config: IngestConfig = {}): Promise<IngestResult> {
    const doc = await knowledgeRepository.findDocumentById(documentId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${documentId} not found`);

    // 1. Parse — the document's content is the parsed markdown.
    const markdown = doc.content ?? '';

    // 2. Extract layout-aware elements (headings/tables/images/pages).
    const elementCount = await elementService.extractAndSave(documentId, markdown);

    // 3. Chunk.
    const results = chunkService.chunk(markdown, `doc_${documentId}`, toConfig(config));
    await knowledgeChunkRepository.saveChunks(documentId, results);

    // 4. Embed.
    const { vectors, failed } = await ollamaEmbedder.embedBatch(results.map((r) => r.text));

    // 5. Index — pair each chunk with its vector, skipping failures.
    const vectorRows: Array<{ chunk_id: string; embedding: number[] }> = [];
    for (let i = 0; i < results.length; i++) {
      const v = vectors[i];
      if (v && v.length > 0) vectorRows.push({ chunk_id: results[i].id, embedding: v });
    }
    const failedCount = failed.length || (results.length - vectorRows.length);

    // 6. Publish — one transaction: revision + content + vectors.
    const checksum = sha256(markdown);
    const latest = await knowledgeRepository.latestRevision(documentId);
    const revisionNo = (latest?.revision_no ?? 0) + 1;
    await knowledgeChunkRepository.publishDocument({
      documentId,
      title: doc.title,
      content: markdown,
      checksum,
      revisionNo,
      vectors: vectorRows,
    });

    return {
      document_id: documentId,
      revision_no: revisionNo,
      status: 'completed',
      elements: elementCount,
      chunks: results.length,
      embedded: vectorRows.length,
      failed: failedCount,
      checksum,
    };
  }
}

export const ingestService = new IngestService();
