// Wiki repository (P5) — persistence for wiki pages, their revisions, grounding
// sources, and the inter-wiki link graph. Mirrors the document domain: every
// content edit appends a revision (never overwrites history) and soft-delete is
// used throughout.
import { BaseRepository } from './base.js';
import { wikis, wikiRevisions, wikiSources, wikiLinks } from '../db/schema.js';
import { eq, and, isNull, desc, count, ilike, or, asc, inArray } from 'drizzle-orm';

export interface WikiRow {
  id: number;
  title: string;
  summary: string;
  content: string;
  kb_id: number | null;
  status: 'draft' | 'generating' | 'completed';
  revision_no: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WikiRevisionRow {
  id: number;
  wiki_id: number;
  revision_no: number;
  title: string;
  content: string;
  checksum: string;
  created_at: string;
}

export interface WikiSourceRow {
  id: number;
  wiki_id: number;
  chunk_id: string;
  document_id: number;
  index: number;
  created_at: string;
}

export interface WikiLinkRow {
  id: number;
  source_wiki_id: number;
  target_wiki_id: number;
  created_at: string;
}

function wikiToRow(r: any): WikiRow {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    content: r.content,
    kb_id: r.kbId,
    status: r.status,
    revision_no: r.revisionNo,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function revisionToRow(r: any): WikiRevisionRow {
  return {
    id: r.id,
    wiki_id: r.wikiId,
    revision_no: r.revisionNo,
    title: r.title,
    content: r.content,
    checksum: r.checksum,
    created_at: r.createdAt.toISOString(),
  };
}

function sourceToRow(r: any): WikiSourceRow {
  return {
    id: r.id,
    wiki_id: r.wikiId,
    chunk_id: r.chunkId,
    document_id: r.documentId,
    index: r.index,
    created_at: r.createdAt.toISOString(),
  };
}

function linkToRow(r: any): WikiLinkRow {
  return {
    id: r.id,
    source_wiki_id: r.sourceWikiId,
    target_wiki_id: r.targetWikiId,
    created_at: r.createdAt.toISOString(),
  };
}

export class WikiRepository extends BaseRepository {
  // ── Wiki CRUD ─────────────────────────────────────────────────────────────
  async createWiki(input: {
    title: string;
    summary?: string;
    content?: string;
    kbId?: number | null;
    status?: 'draft' | 'generating' | 'completed';
    revisionNo?: number;
    createdBy?: number | null;
  }): Promise<WikiRow> {
    const [row] = await this.db
      .insert(wikis)
      .values({
        title: input.title,
        summary: input.summary ?? '',
        content: input.content ?? '',
        kbId: input.kbId ?? null,
        status: input.status ?? 'draft',
        revisionNo: input.revisionNo ?? 1,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return wikiToRow(row);
  }

  async findWikiById(id: number): Promise<WikiRow | undefined> {
    const rows = await this.db
      .select()
      .from(wikis)
      .where(and(eq(wikis.id, id), isNull(wikis.deletedAt)))
      .limit(1);
    return rows[0] ? wikiToRow(rows[0]) : undefined;
  }

  async listWikis(params?: { page?: number; pageSize?: number; kbId?: number }): Promise<{
    items: WikiRow[];
    total: number;
  }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const conds = [isNull(wikis.deletedAt)];
    if (params?.kbId !== undefined) conds.push(eq(wikis.kbId, params.kbId));
    const where = and(...conds);
    const [{ value: total }] = await this.db.select({ value: count() }).from(wikis).where(where);
    const rows = await this.db
      .select()
      .from(wikis)
      .where(where)
      .orderBy(desc(wikis.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(wikiToRow), total: Number(total) };
  }

  async updateWiki(
    id: number,
    patch: { title?: string; summary?: string; content?: string; status?: string; revisionNo?: number },
  ): Promise<WikiRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.summary !== undefined) data.summary = patch.summary;
    if (patch.content !== undefined) data.content = patch.content;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.revisionNo !== undefined) data.revisionNo = patch.revisionNo;
    const [row] = await this.db.update(wikis).set(data).where(eq(wikis.id, id)).returning();
    return row ? wikiToRow(row) : undefined;
  }

  async softDeleteWiki(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(wikis)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(wikis.id, id), isNull(wikis.deletedAt)))
      .returning({ id: wikis.id });
    return !!row;
  }

  async searchWikis(q: string, params?: { page?: number; pageSize?: number }): Promise<{
    items: WikiRow[];
    total: number;
  }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const like = `%${q}%`;
    const where = and(
      isNull(wikis.deletedAt),
      or(ilike(wikis.title, like), ilike(wikis.summary, like), ilike(wikis.content, like)),
    );
    const [{ value: total }] = await this.db.select({ value: count() }).from(wikis).where(where);
    const rows = await this.db
      .select()
      .from(wikis)
      .where(where)
      .orderBy(desc(wikis.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(wikiToRow), total: Number(total) };
  }

  // ── Revisions ─────────────────────────────────────────────────────────────
  async createRevision(input: {
    wikiId: number;
    revisionNo: number;
    title: string;
    content: string;
    checksum: string;
  }): Promise<WikiRevisionRow> {
    const [row] = await this.db
      .insert(wikiRevisions)
      .values({
        wikiId: input.wikiId,
        revisionNo: input.revisionNo,
        title: input.title,
        content: input.content,
        checksum: input.checksum,
      })
      .returning();
    return revisionToRow(row);
  }

  async listRevisions(wikiId: number): Promise<WikiRevisionRow[]> {
    const rows = await this.db
      .select()
      .from(wikiRevisions)
      .where(eq(wikiRevisions.wikiId, wikiId))
      .orderBy(desc(wikiRevisions.revisionNo));
    return rows.map(revisionToRow);
  }

  async findRevision(wikiId: number, revisionNo: number): Promise<WikiRevisionRow | undefined> {
    const rows = await this.db
      .select()
      .from(wikiRevisions)
      .where(and(eq(wikiRevisions.wikiId, wikiId), eq(wikiRevisions.revisionNo, revisionNo)))
      .limit(1);
    return rows[0] ? revisionToRow(rows[0]) : undefined;
  }

  // ── Sources ───────────────────────────────────────────────────────────────
  async addSources(wikiId: number, sources: Array<{ chunkId: string; documentId: number; index: number }>): Promise<void> {
    if (sources.length === 0) return;
    await this.db.insert(wikiSources).values(sources.map((s) => ({ wikiId, chunkId: s.chunkId, documentId: s.documentId, index: s.index })));
  }

  async replaceSources(wikiId: number, sources: Array<{ chunkId: string; documentId: number; index: number }>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(wikiSources).where(eq(wikiSources.wikiId, wikiId));
      if (sources.length > 0) {
        await tx.insert(wikiSources).values(sources.map((s) => ({ wikiId, chunkId: s.chunkId, documentId: s.documentId, index: s.index })));
      }
    });
  }

  async listSources(wikiId: number): Promise<WikiSourceRow[]> {
    const rows = await this.db.select().from(wikiSources).where(eq(wikiSources.wikiId, wikiId)).orderBy(asc(wikiSources.index));
    return rows.map(sourceToRow);
  }

  // ── Links ─────────────────────────────────────────────────────────────────
  async createLink(sourceWikiId: number, targetWikiId: number): Promise<WikiLinkRow> {
    const [row] = await this.db
      .insert(wikiLinks)
      .values({ sourceWikiId, targetWikiId })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.db
        .select()
        .from(wikiLinks)
        .where(and(eq(wikiLinks.sourceWikiId, sourceWikiId), eq(wikiLinks.targetWikiId, targetWikiId)))
        .limit(1);
      return linkToRow(existing[0]);
    }
    return linkToRow(row);
  }

  async deleteLink(sourceWikiId: number, targetWikiId: number): Promise<boolean> {
    const [row] = await this.db
      .delete(wikiLinks)
      .where(and(eq(wikiLinks.sourceWikiId, sourceWikiId), eq(wikiLinks.targetWikiId, targetWikiId)))
      .returning({ id: wikiLinks.id });
    return !!row;
  }

  async listLinks(wikiId: number): Promise<{ outgoing: WikiLinkRow[]; incoming: WikiLinkRow[] }> {
    const [outgoing, incoming] = await Promise.all([
      this.db.select().from(wikiLinks).where(eq(wikiLinks.sourceWikiId, wikiId)).orderBy(wikiLinks.createdAt),
      this.db.select().from(wikiLinks).where(eq(wikiLinks.targetWikiId, wikiId)).orderBy(wikiLinks.createdAt),
    ]);
    return { outgoing: outgoing.map(linkToRow), incoming: incoming.map(linkToRow) };
  }

  async listAllLinks(): Promise<WikiLinkRow[]> {
    const rows = await this.db.select().from(wikiLinks).orderBy(wikiLinks.id);
    return rows.map(linkToRow);
  }

  async listWikisByIds(ids: number[]): Promise<WikiRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(wikis)
      .where(and(inArray(wikis.id, ids), isNull(wikis.deletedAt)));
    return rows.map(wikiToRow);
  }
}

export const wikiRepository = new WikiRepository();
