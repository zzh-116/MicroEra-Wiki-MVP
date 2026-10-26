// Parse commit repository (2b Phase 1) — the single fenced transaction that
// atomically publishes a pure-text parse result. Before writing anything it
// re-verifies, under row locks, that:
//   1. the parse job is still running under this worker's lease (fencing), and
//   2. the document still exists in the same KB and has not been superseded by
//      a newer enqueued job (`documents.current_parse_job_id`), and
//   3. the parent KB is not soft-deleted.
// Any fence failure throws a `ParseCommitError`, rolling the whole transaction
// back so a stale/cancelled/superseded worker writes nothing downstream.
import { BaseRepository } from './base.js';
import {
  parseJobs,
  documents,
  documentRevisions,
  documentElements,
  documentImages,
  knowledgeChunks,
  knowledgeVectors,
  knowledgeBases,
} from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { ParsedElement } from '../parser/elements.js';
import type { ChunkResult } from '../chunk/service.js';

export type ParseCommitErrorCode = 'LEASE_LOST' | 'CANCELLED' | 'SUPERSEDED' | 'DOCUMENT_GONE';

export class ParseCommitError extends Error {
  code: ParseCommitErrorCode;
  constructor(code: ParseCommitErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ParseCommitError';
  }
}

export interface CommitParsedInput {
  jobId: string;
  owner: string;
  leaseVersion: number;
  documentId: number;
  kbId: number;
  title: string;
  content: string;
  checksum: string;
  elements: ParsedElement[];
  chunks: ChunkResult[];
  vectors: Array<{ chunk_id: string; embedding: number[] }>;
  /** Names of image files this parse actually wrote (trusted provenance, P1-B).
   *  Never derived from the editable markdown body. */
  savedImages: string[];
  /** true = full content re-parse (content re-derived from the source file) →
   *  atomically REPLACE the document's image ownership. false = index-only
   *  rebuild (content re-used from `documents.content`) → PRESERVE ownership
   *  (an empty `savedImages` must NOT delete existing rows). */
  replaceImages: boolean;
}

export class ParseCommitRepository extends BaseRepository {
  /** Publish a parsed document in one transaction: fenced ownership checks +
   *  elements + chunks + revision + content + vectors. Rolls back entirely on
   *  any fence failure, so no partial publish or wrong `completed` state is
   *  ever committed. */
  async commitParsedDocument(input: CommitParsedInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      // 1. Fence the job — still running under this owner + lease_version.
      const [job] = await tx
        .select()
        .from(parseJobs)
        .where(eq(parseJobs.id, input.jobId))
        .for('update')
        .limit(1);
      if (!job) throw new ParseCommitError('LEASE_LOST', `job ${input.jobId} vanished`);
      if (job.status === 'cancelled') throw new ParseCommitError('CANCELLED', `job ${input.jobId} was cancelled`);
      if (job.status !== 'running' || job.leaseOwner !== input.owner || job.leaseVersion !== input.leaseVersion) {
        throw new ParseCommitError('LEASE_LOST', `job ${input.jobId} is no longer leased by ${input.owner}`);
      }

      // 2. Fence the document — active, same KB, not superseded by a newer job.
      const [doc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .for('update')
        .limit(1);
      if (!doc || doc.deletedAt) throw new ParseCommitError('DOCUMENT_GONE', `document ${input.documentId} deleted`);
      if (doc.kbId !== input.kbId) throw new ParseCommitError('DOCUMENT_GONE', `document ${input.documentId} moved to another KB`);
      if (doc.currentParseJobId !== null && doc.currentParseJobId !== input.jobId) {
        throw new ParseCommitError('SUPERSEDED', `document ${input.documentId} is now owned by job ${doc.currentParseJobId}`);
      }

      // 3. Fence the parent KB — must still be active.
      const [kb] = await tx
        .select()
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, input.kbId), isNull(knowledgeBases.deletedAt)))
        .for('update')
        .limit(1);
      if (!kb) throw new ParseCommitError('DOCUMENT_GONE', `kb ${input.kbId} deleted`);

      // 4. Replace elements (idempotent delete+insert).
      await tx.delete(documentElements).where(eq(documentElements.documentId, input.documentId));
      if (input.elements.length > 0) {
        await tx.insert(documentElements).values(
          input.elements.map((e) => ({
            documentId: input.documentId,
            elementType: e.type,
            position: e.position,
            content: e.content as Record<string, unknown>,
            startChar: e.startChar,
            endChar: e.endChar,
            startLine: e.startLine,
            endLine: e.endLine,
          })),
        );
      }

      // 5. Replace chunks (idempotent delete+insert).
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, input.documentId));
      if (input.chunks.length > 0) {
        await tx.insert(knowledgeChunks).values(
          input.chunks.map((c) => ({
            id: c.id,
            documentId: input.documentId,
            index: c.index,
            text: c.text,
            strategy: String(c.metadata?.strategy ?? 'markdown'),
            heading: c.metadata?.heading ? String(c.metadata.heading) : null,
            startChar: c.startChar,
            endChar: c.endChar,
            metadata: c.metadata ?? {},
          })),
        );
      }

      // 6. Next revision number (document row is locked → serialized, and the
      //    (document_id, revision_no) unique index rejects any duplicate).
      const latest = await tx
        .select({ revisionNo: documentRevisions.revisionNo })
        .from(documentRevisions)
        .where(eq(documentRevisions.documentId, input.documentId))
        .orderBy(desc(documentRevisions.revisionNo))
        .limit(1);
      const revisionNo = (latest[0]?.revisionNo ?? 0) + 1;

      // 7. Publish atomically: revision + content/parse_status + vectors. The
      //    current-task token is cleared so the document is no longer claimed.
      await tx.insert(documentRevisions).values({
        documentId: input.documentId,
        revisionNo,
        title: input.title,
        content: input.content,
        checksum: input.checksum,
      });
      await tx
        .update(documents)
        .set({ content: input.content, parseStatus: 'completed', currentParseJobId: null, updatedAt: new Date() })
        .where(eq(documents.id, input.documentId));
      await tx.delete(knowledgeVectors).where(eq(knowledgeVectors.documentId, input.documentId));
      if (input.vectors.length > 0) {
        await tx.insert(knowledgeVectors).values(
          input.vectors.map((v) => ({
            chunkId: v.chunk_id,
            documentId: input.documentId,
            embedding: v.embedding,
            store: 'pgvector',
          })),
        );
      }

      // 8. Image ownership (P1-B): only a full content re-parse (content
      //    re-derived from the stored source file) atomically REPLACES the
      //    document's trusted image attribution with the names this parse
      //    actually wrote. An index-only rebuild (replaceImages=false) leaves
      //    ownership untouched — an empty `savedImages` must never delete
      //    existing rows. Names come ONLY from the parse result, never from the
      //    editable markdown body, so a pasted /api/images/ URL grants nothing.
      //    This runs inside the SAME fenced transaction as body/revision/chunks/
      //    vectors, so any fence failure above rolls it back — no add/delete on
      //    cancel/LEASE_LOST/SUPERSEDED/DOCUMENT_GONE.
      if (input.replaceImages) {
        await tx.delete(documentImages).where(eq(documentImages.documentId, input.documentId));
        if (input.savedImages.length > 0) {
          await tx.insert(documentImages).values(
            input.savedImages.map((imageName) => ({ documentId: input.documentId, imageName })),
          );
        }
      }
    });
  }
}

export const parseCommitRepository = new ParseCommitRepository();
