// Knowledge CoreService (P1-03) — business logic for KB / folder / document /
// revision operations. Throws typed errors that the route layer maps onto the
// wire contract. This service owns the invariant that every document content
// mutation appends a new revision (K04).
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { sha256 } from '../utils/hash.js';
import type {
  KbRow,
  FolderRow,
  DocumentRow,
  RevisionRow,
  SourceRow,
} from '../repositories/knowledge.repository.js';

export type ServiceErrorKind =
  | 'resource_not_found'
  | 'validation_failed'
  | 'conflict'
  | 'internal';

export class ServiceError extends Error {
  kind: ServiceErrorKind;
  constructor(kind: ServiceErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'ServiceError';
  }
}

/** Derive a stable slug from a name (lowercase, dash-separated). */
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'kb';
}

/** Append a numeric suffix until the slug is unique within the KB domain. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!(await knowledgeRepository.findKbBySlug(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!(await knowledgeRepository.findKbBySlug(candidate))) return candidate;
  }
  throw new ServiceError('conflict', 'Unable to allocate a unique slug');
}

export class KnowledgeService {
  // ── KB ──────────────────────────────────────────────────────────────────
  async createKb(input: {
    name: string;
    slug?: string;
    description?: string;
    visibility?: 'public' | 'internal';
  }): Promise<KbRow> {
    if (!input.name?.trim()) throw new ServiceError('validation_failed', 'name is required');
    const slug = input.slug?.trim() ? slugify(input.slug) : await uniqueSlug(input.name);
    if (await knowledgeRepository.findKbBySlug(slug)) {
      throw new ServiceError('conflict', `slug "${slug}" already exists`);
    }
    return knowledgeRepository.createKb({
      name: input.name.trim(),
      slug,
      description: input.description,
      visibility: input.visibility,
    });
  }

  async listKbs(input: { page?: number; page_size?: number }): Promise<{ items: KbRow[]; total: number; page: number; page_size: number }> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.page_size ?? 50));
    const { items, total } = await knowledgeRepository.listKbs({ page, pageSize });
    return { items, total, page, page_size: pageSize };
  }

  async viewKb(kbId: number): Promise<KbRow & { document_count: number }> {
    const kb = await knowledgeRepository.findKbById(kbId);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${kbId} not found`);
    const stats = await knowledgeRepository.kbStats(kbId);
    return { ...kb, document_count: stats.documents };
  }

  async updateKb(kbId: number, patch: { name?: string; description?: string; visibility?: string }): Promise<KbRow> {
    const kb = await knowledgeRepository.findKbById(kbId);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${kbId} not found`);
    if (patch.visibility && !['public', 'internal'].includes(patch.visibility)) {
      throw new ServiceError('validation_failed', `invalid visibility "${patch.visibility}"`);
    }
    const updated = await knowledgeRepository.updateKb(kbId, patch);
    return updated!;
  }

  async deleteKb(kbId: number): Promise<{ deleted: boolean; id: number }> {
    const kb = await knowledgeRepository.findKbById(kbId);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${kbId} not found`);
    await knowledgeRepository.softDeleteKb(kbId);
    return { deleted: true, id: kbId };
  }

  async kbStatus(kbId: number): Promise<{ id: number; document_count: number; chunk_count: number; embedding_model: string; ready: boolean }> {
    const kb = await knowledgeRepository.findKbById(kbId);
    if (!kb) throw new ServiceError('resource_not_found', `kb ${kbId} not found`);
    const stats = await knowledgeRepository.kbStats(kbId);
    return {
      id: kbId,
      document_count: stats.documents,
      chunk_count: stats.chunks,
      embedding_model: kb.embedding_model,
      ready: true,
    };
  }

  async checkKb(query: { kb_id?: number; slug?: string }): Promise<{ exists: boolean; id?: number; slug?: string }> {
    if (query.kb_id) {
      const kb = await knowledgeRepository.findKbById(query.kb_id);
      return kb ? { exists: true, id: kb.id, slug: kb.slug } : { exists: false };
    }
    if (query.slug) {
      const kb = await knowledgeRepository.findKbBySlug(query.slug);
      return kb ? { exists: true, id: kb.id, slug: kb.slug } : { exists: false };
    }
    throw new ServiceError('validation_failed', 'kb_id or slug is required');
  }

  // ── Folders ─────────────────────────────────────────────────────────────
  async createFolder(input: { kb_id: number; parent_id?: number | null; name: string }): Promise<FolderRow> {
    if (!(await knowledgeRepository.findKbById(input.kb_id))) {
      throw new ServiceError('resource_not_found', `kb ${input.kb_id} not found`);
    }
    if (!input.name?.trim()) throw new ServiceError('validation_failed', 'name is required');
    if (input.parent_id) {
      const parent = await knowledgeRepository.findFolderById(input.parent_id);
      if (!parent || parent.kb_id !== input.kb_id) {
        throw new ServiceError('resource_not_found', `parent folder ${input.parent_id} not found in this kb`);
      }
    }
    return knowledgeRepository.createFolder({ kbId: input.kb_id, parentId: input.parent_id ?? null, name: input.name.trim() });
  }

  async listFolders(kbId: number): Promise<{ items: FolderRow[]; kb_id: number }> {
    if (!(await knowledgeRepository.findKbById(kbId))) {
      throw new ServiceError('resource_not_found', `kb ${kbId} not found`);
    }
    const items = await knowledgeRepository.listFolders(kbId);
    return { items, kb_id: kbId };
  }

  async moveFolder(folderId: number, parentId: number | null): Promise<FolderRow> {
    const folder = await knowledgeRepository.findFolderById(folderId);
    if (!folder) throw new ServiceError('resource_not_found', `folder ${folderId} not found`);
    if (parentId === folderId) throw new ServiceError('validation_failed', 'a folder cannot be its own parent');
    if (parentId) {
      const parent = await knowledgeRepository.findFolderById(parentId);
      if (!parent || parent.kb_id !== folder.kb_id) {
        throw new ServiceError('resource_not_found', `parent folder ${parentId} not found in this kb`);
      }
    }
    return (await knowledgeRepository.moveFolder(folderId, parentId))!;
  }

  async deleteFolder(folderId: number): Promise<{ deleted: boolean; id: number }> {
    const folder = await knowledgeRepository.findFolderById(folderId);
    if (!folder) throw new ServiceError('resource_not_found', `folder ${folderId} not found`);
    await knowledgeRepository.softDeleteFolder(folderId);
    return { deleted: true, id: folderId };
  }

  // ── Documents ───────────────────────────────────────────────────────────
  async listDocuments(input: { kb_id?: number; folder_id?: number; page?: number; page_size?: number }): Promise<{ items: DocumentRow[]; total: number; page: number; page_size: number }> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.page_size ?? 50));
    const { items, total } = await knowledgeRepository.listDocuments({
      kbId: input.kb_id,
      folderId: input.folder_id,
      page,
      pageSize,
    });
    return { items, total, page, page_size: pageSize };
  }

  async viewDocument(docId: number): Promise<DocumentRow> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${docId} not found`);
    return doc;
  }

  async updateDocument(docId: number, patch: {
    title?: string;
    summary?: string;
    content?: string;
    visibility?: string;
    folder_id?: number | null;
  }): Promise<DocumentRow> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${docId} not found`);
    if (patch.visibility && !['public', 'internal'].includes(patch.visibility)) {
      throw new ServiceError('validation_failed', `invalid visibility "${patch.visibility}"`);
    }
    const repoPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) repoPatch.title = patch.title;
    if (patch.summary !== undefined) repoPatch.summary = patch.summary;
    if (patch.content !== undefined) repoPatch.content = patch.content;
    if (patch.visibility !== undefined) repoPatch.visibility = patch.visibility;
    if (patch.folder_id !== undefined) repoPatch.folderId = patch.folder_id;
    const updated = await knowledgeRepository.updateDocument(docId, repoPatch);
    // Append a revision whenever the content or title changes (K04).
    if (patch.content !== undefined || patch.title !== undefined) {
      await this.appendRevision(docId, updated!.title, updated!.content);
    }
    return updated!;
  }

  async deleteDocument(docId: number): Promise<{ deleted: boolean; id: number }> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${docId} not found`);
    await knowledgeRepository.softDeleteDocument(docId);
    return { deleted: true, id: docId };
  }

  async restoreDocument(docId: number): Promise<DocumentRow> {
    const doc = await knowledgeRepository.findDocumentByIdIncludingDeleted(docId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${docId} not found`);
    if (!doc.deleted_at) return doc; // already active
    return (await knowledgeRepository.restoreDocument(docId))!;
  }

  async moveDocument(docId: number, folderId: number | null): Promise<DocumentRow> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${docId} not found`);
    if (folderId !== null) {
      const folder = await knowledgeRepository.findFolderById(folderId);
      if (!folder || folder.kb_id !== doc.kb_id) {
        throw new ServiceError('resource_not_found', `folder ${folderId} not found in this kb`);
      }
    }
    return (await knowledgeRepository.moveDocument(docId, folderId))!;
  }

  async batchDeleteDocuments(docIds: number[]): Promise<{ deleted: number; ids: number[]; missing: number[] }> {
    if (!Array.isArray(docIds) || docIds.length === 0) {
      throw new ServiceError('validation_failed', 'doc_ids must be a non-empty array');
    }
    const deleted: number[] = [];
    const missing: number[] = [];
    for (const id of docIds) {
      const ok = await knowledgeRepository.softDeleteDocument(id);
      if (ok) deleted.push(id);
      else missing.push(id);
    }
    return { deleted: deleted.length, ids: deleted, missing };
  }

  // ── Revisions ───────────────────────────────────────────────────────────
  private async appendRevision(documentId: number, title: string, content: string): Promise<RevisionRow> {
    const latest = await knowledgeRepository.latestRevision(documentId);
    const nextNo = (latest?.revision_no ?? 0) + 1;
    return knowledgeRepository.createRevision({
      documentId,
      revisionNo: nextNo,
      title,
      content,
      checksum: sha256(content),
    });
  }

  async listRevisions(docId: number): Promise<{ items: RevisionRow[]; document_id: number }> {
    if (!(await knowledgeRepository.findDocumentById(docId))) {
      throw new ServiceError('resource_not_found', `document ${docId} not found`);
    }
    const items = await knowledgeRepository.listRevisions(docId);
    return { items, document_id: docId };
  }

  async viewRevision(docId: number, revisionNo: number): Promise<RevisionRow> {
    const rev = await knowledgeRepository.findRevision(docId, revisionNo);
    if (!rev) throw new ServiceError('resource_not_found', `revision ${revisionNo} not found for document ${docId}`);
    return rev;
  }

  async restoreRevision(docId: number, revisionNo: number): Promise<DocumentRow> {
    const doc = await knowledgeRepository.findDocumentById(docId);
    if (!doc) throw new ServiceError('resource_not_found', `document ${docId} not found`);
    const rev = await knowledgeRepository.findRevision(docId, revisionNo);
    if (!rev) throw new ServiceError('resource_not_found', `revision ${revisionNo} not found for document ${docId}`);
    await knowledgeRepository.updateDocument(docId, { title: rev.title, content: rev.content });
    await this.appendRevision(docId, rev.title, rev.content);
    return (await knowledgeRepository.findDocumentById(docId))!;
  }

  async viewSource(sourceId: number): Promise<SourceRow> {
    const source = await knowledgeRepository.findSourceById(sourceId);
    if (!source) throw new ServiceError('resource_not_found', `source ${sourceId} not found`);
    return source;
  }

  // ── Internal (used by backfill execution and P2 upload) ────────────────
  async createDocumentWithRevision(input: {
    kbId: number;
    title: string;
    summary?: string;
    content?: string;
    visibility?: 'public' | 'internal';
    sourceName?: string;
    sourceType?: string;
    folderId?: number | null;
  }): Promise<{ document: DocumentRow; source: SourceRow; revision: RevisionRow }> {
    if (!(await knowledgeRepository.findKbById(input.kbId))) {
      throw new ServiceError('resource_not_found', `kb ${input.kbId} not found`);
    }
    const content = input.content ?? '';
    const source = await knowledgeRepository.createSource({
      kbId: input.kbId,
      type: input.sourceType ?? 'manual',
      name: input.sourceName ?? input.title,
      checksum: sha256(content),
    });
    const document = await knowledgeRepository.createDocument({
      kbId: input.kbId,
      sourceId: source.id,
      folderId: input.folderId ?? null,
      title: input.title,
      summary: input.summary ?? '',
      content,
      visibility: input.visibility ?? 'internal',
      parseStatus: 'completed',
    });
    const revision = await knowledgeRepository.createRevision({
      documentId: document.id,
      revisionNo: 1,
      title: input.title,
      content,
      checksum: sha256(content),
    });
    return { document, source, revision };
  }
}

export const knowledgeService = new KnowledgeService();
