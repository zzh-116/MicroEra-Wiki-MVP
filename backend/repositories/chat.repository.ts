// Chat repository (P4) — persistence for chat sessions and their messages
// (the v2 slice over the knowledge pipeline; legacy `conversations` are
// untouched). Sessions hold scope + scoped KBs; messages hold the answer text,
// grounding citations, and a generation/retrieval trace for chat.trace.
import { BaseRepository } from './base.js';
import { sessions, messages } from '../db/schema.js';
import { eq, and, isNull, desc, count, ilike } from 'drizzle-orm';

export interface SessionRow {
  id: string;
  user_id: number;
  title: string;
  kb_ids: number[];
  scope: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: unknown[];
  trace: Record<string, unknown>;
  created_at: string;
}

function sessionToRow(r: any): SessionRow {
  return {
    id: r.id,
    user_id: r.userId,
    title: r.title,
    kb_ids: Array.isArray(r.kbIds) ? r.kbIds : [],
    scope: r.scope ?? {},
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function messageToRow(r: any): MessageRow {
  return {
    id: r.id,
    session_id: r.sessionId,
    role: r.role,
    content: r.content,
    citations: Array.isArray(r.citations) ? r.citations : [],
    trace: r.trace ?? {},
    created_at: r.createdAt.toISOString(),
  };
}

export class ChatRepository extends BaseRepository {
  // ── Sessions ─────────────────────────────────────────────────────────────
  async createSession(input: {
    id: string;
    userId: number;
    title?: string;
    kbIds?: number[];
    scope?: Record<string, unknown>;
  }): Promise<SessionRow> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        id: input.id,
        userId: input.userId,
        title: input.title ?? 'New Chat',
        kbIds: input.kbIds ?? [],
        scope: input.scope ?? {},
      })
      .returning();
    return sessionToRow(row);
  }

  async findSessionById(id: string): Promise<SessionRow | undefined> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), isNull(sessions.deletedAt)))
      .limit(1);
    return rows[0] ? sessionToRow(rows[0]) : undefined;
  }

  async listSessionsByUser(userId: number, params?: { page?: number; pageSize?: number }): Promise<{
    items: SessionRow[];
    total: number;
  }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = and(eq(sessions.userId, userId), isNull(sessions.deletedAt));
    const [{ value: total }] = await this.db.select({ value: count() }).from(sessions).where(where);
    const rows = await this.db
      .select()
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(sessionToRow), total: Number(total) };
  }

  async updateSession(
    id: string,
    patch: { title?: string; kbIds?: number[]; scope?: Record<string, unknown> },
  ): Promise<SessionRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.kbIds !== undefined) data.kbIds = patch.kbIds;
    if (patch.scope !== undefined) data.scope = patch.scope;
    const [row] = await this.db.update(sessions).set(data).where(eq(sessions.id, id)).returning();
    return row ? sessionToRow(row) : undefined;
  }

  async touchSession(id: string): Promise<void> {
    await this.db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, id));
  }

  async softDeleteSession(id: string): Promise<boolean> {
    const [row] = await this.db
      .update(sessions)
      .set({ deletedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });
    return !!row;
  }

  // ── Messages ─────────────────────────────────────────────────────────────
  async createMessage(input: {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    citations?: unknown[];
    trace?: Record<string, unknown>;
  }): Promise<MessageRow> {
    const [row] = await this.db
      .insert(messages)
      .values({
        id: input.id,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        citations: input.citations ?? [],
        trace: input.trace ?? {},
      })
      .returning();
    return messageToRow(row);
  }

  async listMessagesBySession(sessionId: string): Promise<MessageRow[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt);
    return rows.map(messageToRow);
  }

  async findMessageById(id: string): Promise<MessageRow | undefined> {
    const rows = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return rows[0] ? messageToRow(rows[0]) : undefined;
  }

  async searchMessages(input: {
    q: string;
    sessionId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: MessageRow[]; total: number }> {
    const pg = input.page ?? 1;
    const ps = input.pageSize ?? 50;
    const conds: any[] = [ilike(messages.content, `%${input.q}%`)];
    if (input.sessionId) conds.push(eq(messages.sessionId, input.sessionId));
    const where = and(...conds);

    const [{ value: total }] = await this.db.select({ value: count() }).from(messages).where(where);
    const rows = await this.db
      .select()
      .from(messages)
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(messageToRow), total: Number(total) };
  }
}

export const chatRepository = new ChatRepository();
