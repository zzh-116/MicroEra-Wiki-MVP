// Knowledge domain repository — KB, folder, document, source, and revision
// records. Soft-delete is used everywhere so history is never lost (K03/K04).
import { BaseRepository } from './base.js';
import {
  knowledgeBases,
  folders,
  documents,
  documentRevisions,
  sources,
} from '../db/schema.js';
import { eq, and, inArray, desc, isNull, count, sql } from 'drizzle-orm';

// ---- Domain shapes (plain objects, snake_case for the API) ----
export interface KbRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  visibility: string;
  embedding_model: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderRow {
  id: number;
  kb_id: number;
  parent_id: number | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DocumentRow {
  id: number;
  kb_id: number;
  source_id: number | null;
  entry_id: number | null;
  folder_id: number | null;
  title: string;
  summary: string;
  content: string;
  visibility: string;
  file_name: string | null;
  file_size: number;
  file_hash: string | null;
  parse_status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RevisionRow {
  id: number;
  document_id: number;
  revision_no: number;
  title: string;
  content: string;
  checksum: string;
  created_at: string;
}

export interface SourceRow {
  id: number;
  kb_id: number;
  type: string;
  name: string;
  uri: string | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function kbToRow(r: typeof knowledgeBases.$inferSelect): KbRow {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    visibility: r.visibility,
    embedding_model: r.embeddingModel,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function folderToRow(r: typeof folders.$inferSelect): FolderRow {
  return {
    id: r.id,
    kb_id: r.kbId,
    parent_id: r.parentId,
    name: r.name,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function docToRow(r: typeof documents.$inferSelect): DocumentRow {
  return {
    id: r.id,
    kb_id: r.kbId,
    source_id: r.sourceId,
    entry_id: r.entryId,
    folder_id: r.folderId,
    title: r.title,
    summary: r.summary,
    content: r.content,
    visibility: r.visibility,
    file_name: r.fileName,
    file_size: r.fileSize,
    file_hash: r.fileHash,
    parse_status: r.parseStatus,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function revToRow(r: typeof documentRevisions.$inferSelect): RevisionRow {
  return {
    id: r.id,
    document_id: r.documentId,
    revision_no: r.revisionNo,
    title: r.title,
    content: r.content,
    checksum: r.checksum,
    created_at: r.createdAt.toISOString(),
  };
}

function sourceToRow(r: typeof sources.$inferSelect): SourceRow {
  return {
    id: r.id,
    kb_id: r.kbId,
    type: r.type,
    name: r.name,
    uri: r.uri,
    checksum: r.checksum,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

export class KnowledgeRepository extends BaseRepository {
  // ── Knowledge bases ─────────────────────────────────────────────────────
  async createKb(input: {
    name: string;
    slug: string;
    description?: string;
    visibility?: 'public' | 'internal';
  }): Promise<KbRow> {
    const [row] = await this.db
      .insert(knowledgeBases)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? '',
        visibility: input.visibility ?? 'internal',
      })
      .returning();
    return kbToRow(row);
  }

  async listKbs(params?: { page?: number; pageSize?: number }): Promise<{ items: KbRow[]; total: number }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = isNull(knowledgeBases.deletedAt);
    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(knowledgeBases)
      .where(where);
    const rows = await this.db
      .select()
      .from(knowledgeBases)
      .where(where)
      .orderBy(desc(knowledgeBases.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(kbToRow), total: Number(total) };
  }

  async findKbById(id: number): Promise<KbRow | undefined> {
    const rows = await this.db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
      .limit(1);
    return rows[0] ? kbToRow(rows[0]) : undefined;
  }

  async findKbBySlug(slug: string): Promise<KbRow | undefined> {
    const rows = await this.db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.slug, slug), isNull(knowledgeBases.deletedAt)))
      .limit(1);
    return rows[0] ? kbToRow(rows[0]) : undefined;
  }

  async updateKb(id: number, patch: { name?: string; description?: string; visibility?: string }): Promise<KbRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.visibility !== undefined) data.visibility = patch.visibility;
    const [row] = await this.db.update(knowledgeBases).set(data).where(eq(knowledgeBases.id, id)).returning();
    return row ? kbToRow(row) : undefined;
  }

  async softDeleteKb(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(knowledgeBases)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
      .returning({ id: knowledgeBases.id });
    return !!row;
  }

  async kbStats(kbId: number): Promise<{ documents: number; chunks: number }> {
    const [{ value: docs }] = await this.db
      .select({ value: count() })
      .from(documents)
      .where(and(eq(documents.kbId, kbId), isNull(documents.deletedAt)));
    // Chunks are not yet linked to KB in this schema; report 0 for now and let
    // P2 (chunk domain) populate this once chunk_kb linkage lands.
    return { documents: Number(docs), chunks: 0 };
  }

  // ── Folders ─────────────────────────────────────────────────────────────
  async createFolder(input: { kbId: number; parentId?: number | null; name: string }): Promise<FolderRow> {
    const [row] = await this.db
      .insert(folders)
      .values({ kbId: input.kbId, parentId: input.parentId ?? null, name: input.name })
      .returning();
    return folderToRow(row);
  }

  async listFolders(kbId: number): Promise<FolderRow[]> {
    const rows = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.kbId, kbId), isNull(folders.deletedAt)))
      .orderBy(folders.id);
    return rows.map(folderToRow);
  }

  async findFolderById(id: number): Promise<FolderRow | undefined> {
    const rows = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .limit(1);
    return rows[0] ? folderToRow(rows[0]) : undefined;
  }

  async moveFolder(id: number, parentId: number | null): Promise<FolderRow | undefined> {
    const [row] = await this.db
      .update(folders)
      .set({ parentId, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return row ? folderToRow(row) : undefined;
  }

  async softDeleteFolder(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(folders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .returning({ id: folders.id });
    return !!row;
  }

  // ── Documents ───────────────────────────────────────────────────────────
  async createDocument(input: {
    kbId: number;
    title: string;
    summary?: string;
    content?: string;
    visibility?: 'public' | 'internal';
    sourceId?: number | null;
    entryId?: number | null;
    folderId?: number | null;
    fileName?: string | null;
    fileSize?: number;
    fileHash?: string | null;
    parseStatus?: string;
  }): Promise<DocumentRow> {
    const [row] = await this.db
      .insert(documents)
      .values({
        kbId: input.kbId,
        sourceId: input.sourceId ?? null,
        entryId: input.entryId ?? null,
        folderId: input.folderId ?? null,
        title: input.title,
        summary: input.summary ?? '',
        content: input.content ?? '',
        visibility: input.visibility ?? 'internal',
        fileName: input.fileName ?? null,
        fileSize: input.fileSize ?? 0,
        fileHash: input.fileHash ?? null,
        parseStatus: input.parseStatus ?? 'pending',
      })
      .returning();
    return docToRow(row);
  }

  async listDocuments(params: {
    kbId?: number;
    folderId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: DocumentRow[]; total: number }> {
    const pg = params.page ?? 1;
    const ps = params.pageSize ?? 50;
    const conditions = [isNull(documents.deletedAt)];
    if (params.kbId !== undefined) conditions.push(eq(documents.kbId, params.kbId));
    if (params.folderId !== undefined) conditions.push(eq(documents.folderId, params.folderId));
    const where = and(...conditions);
    const [{ value: total }] = await this.db.select({ value: count() }).from(documents).where(where);
    const rows = await this.db
      .select()
      .from(documents)
      .where(where)
      .orderBy(desc(documents.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(docToRow), total: Number(total) };
  }

  async findDocumentById(id: number): Promise<DocumentRow | undefined> {
    const rows = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .limit(1);
    return rows[0] ? docToRow(rows[0]) : undefined;
  }

  async findDocumentByIdIncludingDeleted(id: number): Promise<DocumentRow | undefined> {
    const rows = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0] ? docToRow(rows[0]) : undefined;
  }

  async updateDocument(id: number, patch: {
    title?: string;
    summary?: string;
    content?: string;
    visibility?: string;
    folderId?: number | null;
    parseStatus?: string;
  }): Promise<DocumentRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.summary !== undefined) data.summary = patch.summary;
    if (patch.content !== undefined) data.content = patch.content;
    if (patch.visibility !== undefined) data.visibility = patch.visibility;
    if (patch.folderId !== undefined) data.folderId = patch.folderId;
    if (patch.parseStatus !== undefined) data.parseStatus = patch.parseStatus;
    const [row] = await this.db.update(documents).set(data).where(eq(documents.id, id)).returning();
    return row ? docToRow(row) : undefined;
  }

  async softDeleteDocument(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .returning({ id: documents.id });
    return !!row;
  }

  async restoreDocument(id: number): Promise<DocumentRow | undefined> {
    const [row] = await this.db
      .update(documents)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return row ? docToRow(row) : undefined;
  }

  async moveDocument(id: number, folderId: number | null): Promise<DocumentRow | undefined> {
    const [row] = await this.db
      .update(documents)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return row ? docToRow(row) : undefined;
  }

  // ── Sources ─────────────────────────────────────────────────────────────
  async createSource(input: {
    kbId: number;
    type: string;
    name: string;
    uri?: string | null;
    checksum?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<SourceRow> {
    const [row] = await this.db
      .insert(sources)
      .values({
        kbId: input.kbId,
        type: input.type,
        name: input.name,
        uri: input.uri ?? null,
        checksum: input.checksum ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return sourceToRow(row);
  }

  async findSourceById(id: number): Promise<SourceRow | undefined> {
    const rows = await this.db
      .select()
      .from(sources)
      .where(and(eq(sources.id, id), isNull(sources.deletedAt)))
      .limit(1);
    return rows[0] ? sourceToRow(rows[0]) : undefined;
  }

  // ── Revisions ───────────────────────────────────────────────────────────
  async createRevision(input: {
    documentId: number;
    revisionNo: number;
    title: string;
    content: string;
    checksum: string;
  }): Promise<RevisionRow> {
    const [row] = await this.db
      .insert(documentRevisions)
      .values({
        documentId: input.documentId,
        revisionNo: input.revisionNo,
        title: input.title,
        content: input.content,
        checksum: input.checksum,
      })
      .returning();
    return revToRow(row);
  }

  async listRevisions(documentId: number): Promise<RevisionRow[]> {
    const rows = await this.db
      .select()
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, documentId))
      .orderBy(desc(documentRevisions.revisionNo));
    return rows.map(revToRow);
  }

  async findRevision(documentId: number, revisionNo: number): Promise<RevisionRow | undefined> {
    const rows = await this.db
      .select()
      .from(documentRevisions)
      .where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.revisionNo, revisionNo)))
      .limit(1);
    return rows[0] ? revToRow(rows[0]) : undefined;
  }

  async latestRevision(documentId: number): Promise<RevisionRow | undefined> {
    const rows = await this.db
      .select()
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, documentId))
      .orderBy(desc(documentRevisions.revisionNo))
      .limit(1);
    return rows[0] ? revToRow(rows[0]) : undefined;
  }
}

export const knowledgeRepository = new KnowledgeRepository();
