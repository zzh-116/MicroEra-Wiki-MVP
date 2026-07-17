// Drizzle ORM schema — Enterprise Wiki MVP
// Tables: users, categories, tags, entries, entry_tags, wiki_files,
//         data_items, document_chunks, vectors, conversations, chat_messages
import {
  pgTable, serial, text, integer, timestamp,
  primaryKey, index, jsonb, uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---- Users ----
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull().default(''),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] })
    .notNull()
    .default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// ---- Categories ----
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ---- Tags ----
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

// ---- Entries ----
export const entries = pgTable(
  'entries',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    entryType: text('entry_type', {
      enum: ['asset', 'product', 'tech', 'patent', 'data_item'],
    }).notNull(),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    visibility: text('visibility', { enum: ['public', 'internal'] })
      .notNull()
      .default('internal'),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('entries_entry_type_idx').on(table.entryType),
    index('entries_visibility_idx').on(table.visibility),
    index('entries_category_idx').on(table.categoryId),
    index('entries_updated_at_idx').on(table.updatedAt.desc()),
    index('entries_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Entry-Tags junction ----
export const entryTags = pgTable(
  'entry_tags',
  {
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.tagId] }),
    index('entry_tags_tag_idx').on(table.tagId),
  ],
);

// ---- Wiki Files ----
export const wikiFiles = pgTable(
  'wiki_files',
  {
    id: serial('id').primaryKey(),
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    storedFilename: text('stored_filename').notNull(),
    fileType: text('file_type').notNull(),
    fileSize: integer('file_size').notNull().default(0),
    storagePath: text('storage_path').notNull(),
    usageType: text('usage_type').notNull().default('attachment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('wiki_files_entry_idx').on(table.entryId)],
);

// ---- Data Items ----
export const dataItems = pgTable(
  'data_items',
  {
    id: serial('id').primaryKey(),
    entryId: integer('entry_id')
      .notNull()
      .unique()
      .references(() => entries.id, { onDelete: 'cascade' }),
    dataName: text('data_name').notNull(),
    dataDefinition: text('data_definition').notNull(),
    dataFormat: text('data_format').notNull(),
    storageDescription: text('storage_description'),
    schemaDescription: text('schema_description'),
    schemaVersion: text('schema_version').notNull().default('1.0'),
    responsiblePerson: text('responsible_person').notNull().default(''),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('data_items_entry_idx').on(table.entryId)],
);

// ---- Document Chunks ----
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: text('id').primaryKey(),
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => [index('document_chunks_entry_idx').on(table.entryId)],
);

// ---- Vectors (pgvector) ----
export const vectors = pgTable(
  'vectors',
  {
    chunkId: text('chunk_id').primaryKey(),
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 1024 }),
    store: text('store').notNull().default('pgvector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('vectors_entry_idx').on(table.entryId)],
);

// ---- Conversations ----
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New Chat'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Chat Messages ----
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    sources: jsonb('sources').default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chat_messages_conv_idx').on(table.conversationId)],
);

// ---- Relations ----
export const entriesRelations = relations(entries, ({ one, many }) => ({
  category: one(categories, { fields: [entries.categoryId], references: [categories.id] }),
  createdByUser: one(users, { fields: [entries.createdBy], references: [users.id] }),
  entryTags: many(entryTags),
}));

export const entryTagsRelations = relations(entryTags, ({ one }) => ({
  entry: one(entries, { fields: [entryTags.entryId], references: [entries.id] }),
  tag: one(tags, { fields: [entryTags.tagId], references: [tags.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
}));
