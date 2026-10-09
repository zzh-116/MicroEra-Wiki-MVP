// Drizzle ORM schema — Enterprise Wiki MVP
// Tables: users, categories, tags, entries, entry_tags, wiki_files,
//         data_items, document_chunks, vectors, conversations, chat_messages
import {
  pgTable, serial, text, integer, timestamp,
  primaryKey, index, jsonb, uniqueIndex,
  vector, doublePrecision,
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
    entryType: text('entry_type').notNull(),
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
    objectKey: text('object_key'),
    objectBucket: text('object_bucket'),
    sha256: text('sha256'),
    contentType: text('content_type'),
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

// ---- Bookmarks ----
export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.entryId] }),
    index('bookmarks_user_idx').on(table.userId),
    index('bookmarks_entry_idx').on(table.entryId),
  ],
);

// ---- Run Logs ----
export const runLogs = pgTable(
  'run_logs',
  {
    id: serial('id').primaryKey(),
    level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).notNull(),
    module: text('module').notNull().default('app'),
    message: text('message').notNull(),
    stack: text('stack'),
    context: jsonb('context').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('run_logs_level_idx').on(table.level),
    index('run_logs_module_idx').on(table.module),
    index('run_logs_created_at_idx').on(table.createdAt.desc()),
  ],
);

// ---- Entry Relations (persisted knowledge graph edges) ----
// Each undirected semantic pair is stored once with source_entry_id <
// target_entry_id, so A->B and B->A cannot both exist.
export const entryRelations = pgTable(
  'entry_relations',
  {
    id: serial('id').primaryKey(),
    sourceEntryId: integer('source_entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    targetEntryId: integer('target_entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull().default('semantic_related'),
    similarity: doublePrecision('similarity'),
    relationSource: text('relation_source').notNull().default('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('entry_relations_source_target_type_idx').on(
      table.sourceEntryId,
      table.targetEntryId,
      table.relationType,
    ),
    index('entry_relations_source_idx').on(table.sourceEntryId),
    index('entry_relations_target_idx').on(table.targetEntryId),
  ],
);

// ---- Knowledge Bases (KB) ----
// The WeKnora knowledge domain: a KB is a scoped collection of documents,
// grouped into folders. Legacy `entries` are mapped to `documents` via
// `entry_id` (the P1-02 compatibility adapter) rather than migrated in place.
export const knowledgeBases = pgTable(
  'knowledge_bases',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull().default(''),
    visibility: text('visibility', { enum: ['public', 'internal'] })
      .notNull()
      .default('internal'),
    embeddingModel: text('embedding_model').notNull().default('bge-m3'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('knowledge_bases_visibility_idx').on(table.visibility),
    index('knowledge_bases_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Sources ----
// A source is the provenance record for a document: an uploaded file, a URL, a
// connector cursor, or manual entry. Checksum is the sha256 of the source bytes
// so re-imports can be de-duplicated and integrity-checked.
export const sources = pgTable(
  'sources',
  {
    id: serial('id').primaryKey(),
    kbId: integer('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['file', 'url', 'manual', 'connector'] }).notNull(),
    name: text('name').notNull(),
    uri: text('uri'),
    checksum: text('checksum'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('sources_kb_idx').on(table.kbId),
    index('sources_type_idx').on(table.type),
  ],
);

// ---- Folders ----
// A KB is organized as a folder tree (K02). Each document belongs to at most
// one folder; moving a folder re-parents it without touching the documents.
export const folders = pgTable(
  'folders',
  {
    id: serial('id').primaryKey(),
    kbId: integer('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    parentId: integer('parent_id').references(() => folders.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('folders_kb_idx').on(table.kbId),
    index('folders_parent_idx').on(table.parentId),
  ],
);

// ---- Documents ----
// A document is a KB-scoped knowledge item with its own visibility and parse
// state. `entry_id` is an optional link to the legacy `entries` row this
// document was backfilled from; it is how the old routes stay usable (P1-05).
export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    kbId: integer('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
    entryId: integer('entry_id').references(() => entries.id, { onDelete: 'set null' }),
    folderId: integer('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    visibility: text('visibility', { enum: ['public', 'internal'] })
      .notNull()
      .default('internal'),
    fileName: text('file_name'),
    fileSize: integer('file_size').notNull().default(0),
    fileHash: text('file_hash'),
    parseStatus: text('parse_status', { enum: ['pending', 'processing', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('documents_kb_idx').on(table.kbId),
    index('documents_source_idx').on(table.sourceId),
    index('documents_entry_idx').on(table.entryId),
    index('documents_folder_idx').on(table.folderId),
    index('documents_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Document Revisions ----
// Each parse/update of a document appends a revision. `checksum` is the sha256
// of the revision content so history reads are verifiable and rollbacks are
// hash-consistent (K04).
export const documentRevisions = pgTable(
  'document_revisions',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    revisionNo: integer('revision_no').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    checksum: text('checksum').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_revisions_doc_rev_idx').on(table.documentId, table.revisionNo),
    index('document_revisions_doc_idx').on(table.documentId),
  ],
);

// ---- Relations ----
export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  entry: one(entries, { fields: [bookmarks.entryId], references: [entries.id] }),
}));

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
