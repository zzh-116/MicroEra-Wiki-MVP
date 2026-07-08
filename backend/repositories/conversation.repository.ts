import { BaseRepository } from './base.js';
import { conversations, chatMessages } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export interface ConversationRow {
  id: number;
  userId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: Array<{ id: number; title: string }>;
  createdAt: Date;
}

export class ConversationRepository extends BaseRepository {
  async findByUserId(userId: number): Promise<ConversationRow[]> {
    return this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async create(userId: number, title?: string): Promise<ConversationRow> {
    const [row] = await this.db
      .insert(conversations)
      .values({ userId, title: title || 'New Chat' })
      .returning();
    return row;
  }

  async addMessage(input: {
    conversationId: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sources?: Array<{ id: number; title: string }>;
  }): Promise<MessageRow> {
    const [row] = await this.db
      .insert(chatMessages)
      .values({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        sources: input.sources ?? [],
      })
      .returning();

    // Update conversation timestamp
    await this.db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));

    return row;
  }

  async getMessages(conversationId: number): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  async getHistory(conversationId: number): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.getMessages(conversationId);
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.id, id));
  }
}

export const conversationRepository = new ConversationRepository();
