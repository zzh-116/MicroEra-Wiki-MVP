// Drizzle ORM schema — Enterprise Wiki MVP
// Tables: users, categories, tags, entries, entry_tags, wiki_files,
//         data_items, document_chunks, vectors, conversations, chat_messages
import {
  pgTable, serial, text, integer, timestamp,
  primaryKey, index, jsonb, uniqueIndex,
  vector, doublePrecision, boolean,
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
    // Current-task ownership token: the id of the latest enqueued parse job.
    // A fenced parse commit rejects the write when this points at a different
    // (newer) job, preventing an old parse from overwriting a newer one.
    currentParseJobId: text('current_parse_job_id'),
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

// ---- Document Elements (layout-aware parse output, P2-02) ----
// Extracted headings, tables, images, and page markers with their source
// coordinates (char/line offsets). `content` is element-type-specific: headings
// carry level+text, tables carry header+rows, images carry src (blob ref)+alt.
export const documentElements = pgTable(
  'document_elements',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    elementType: text('element_type', { enum: ['heading', 'table', 'image', 'page'] }).notNull(),
    position: integer('position').notNull().default(0),
    content: jsonb('content').notNull().default({}),
    startChar: integer('start_char'),
    endChar: integer('end_char'),
    startLine: integer('start_line'),
    endLine: integer('end_line'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('document_elements_doc_idx').on(table.documentId),
    index('document_elements_type_idx').on(table.elementType),
  ],
);

// ---- Document Images (trusted parse provenance, P1-B) ----
// The authoritative image ↔ document ownership table. A row exists ONLY when a
// trusted parse pipeline extracted an image file from a document's source
// bytes. It is never populated from user-editable `documents.content`, so
// pasting `/api/images/<name>` into a body cannot grant access. `image_name`
// is the UUID filename under DATA_DIR/images (single segment, collision-proof).
export const documentImages = pgTable(
  'document_images',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    imageName: text('image_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_images_document_id_image_name_unique').on(table.documentId, table.imageName),
    index('document_images_document_idx').on(table.documentId),
    index('document_images_image_name_idx').on(table.imageName),
  ],
);

// ---- Knowledge Chunks (P2-03) ----
// A document's embeddable chunks, produced by the four chunking strategies
// (fixed/paragraph/sentence/markdown). Editing or deleting a chunk invalidates
// its vector so the index never serves stale text.
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    text: text('text').notNull(),
    strategy: text('strategy').notNull().default('markdown'),
    heading: text('heading'),
    startChar: integer('start_char').notNull().default(0),
    endChar: integer('end_char').notNull().default(0),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('knowledge_chunks_doc_idx').on(table.documentId)],
);

// ---- Knowledge Vectors (pgvector, P2-03 invalidation / P2-05 embedding) ----
export const knowledgeVectors = pgTable(
  'knowledge_vectors',
  {
    chunkId: text('chunk_id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 1024 }),
    store: text('store').notNull().default('pgvector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('knowledge_vectors_doc_idx').on(table.documentId)],
);

// ---- Parse Jobs (P2-04 durable queue) ----
// A durable parse job with worker lease + checkpoint. Retries count up to
// max_attempts; when exhausted the job is moved to parse_deadletters so no
// parse is silently lost.
export const parseJobs = pgTable(
  'parse_jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull().default('parse'),
    documentId: integer('document_id').references(() => documents.id, { onDelete: 'set null' }),
    kbId: integer('kb_id').references(() => knowledgeBases.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'] })
      .notNull()
      .default('pending'),
    attempt: integer('attempt').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    stage: text('stage'),
    progress: integer('progress').notNull().default(0),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseVersion: integer('lease_version').notNull().default(0),
    checkpoint: jsonb('checkpoint').notNull().default({}),
    error: text('error'),
    errorCode: text('error_code'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('parse_jobs_status_idx').on(table.status),
    index('parse_jobs_document_idx').on(table.documentId),
    index('parse_jobs_lease_idx').on(table.leaseExpiresAt),
  ],
);

// ---- Parse Deadletters (P2-04 DLQ) ----
export const parseDeadletters = pgTable(
  'parse_deadletters',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    documentId: integer('document_id').references(() => documents.id, { onDelete: 'set null' }),
    error: text('error'),
    errorCode: text('error_code'),
    attempts: integer('attempts').notNull().default(0),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    replayedAt: timestamp('replayed_at', { withTimezone: true }),
  },
  (table) => [
    index('parse_deadletters_job_idx').on(table.jobId),
    index('parse_deadletters_document_idx').on(table.documentId),
  ],
);

// ---- Eval Datasets (P3-05) ----
// A retrieval evaluation dataset: a named, KB-scoped collection of query
// relevance judgements. Each item pairs a query with the document ids that
// SHOULD be retrieved for it, so `eval.run` can score a retrieval method
// against a ground-truth set (recall/mrr/ndcg).
export const evalDatasets = pgTable(
  'eval_datasets',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    kbId: integer('kb_id').references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    description: text('description').notNull().default(''),
    method: text('method', { enum: ['vector', 'lexical', 'hybrid'] }).notNull().default('hybrid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('eval_datasets_kb_idx').on(table.kbId),
    index('eval_datasets_deleted_at_idx').on(table.deletedAt),
  ],
);

export const evalDatasetItems = pgTable(
  'eval_dataset_items',
  {
    id: serial('id').primaryKey(),
    datasetId: integer('dataset_id')
      .notNull()
      .references(() => evalDatasets.id, { onDelete: 'cascade' }),
    query: text('query').notNull(),
    relevantDocumentIds: jsonb('relevant_document_ids').notNull().default([]),
  },
  (table) => [index('eval_dataset_items_dataset_idx').on(table.datasetId)],
);

// ---- Eval Runs (P3-05) ----
// A persisted evaluation run: which dataset + method was scored, the aggregate
// metrics, and the per-query breakdown (for eval.report / eval.compare).
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: text('id').primaryKey(),
    datasetId: integer('dataset_id')
      .notNull()
      .references(() => evalDatasets.id, { onDelete: 'cascade' }),
    method: text('method', { enum: ['vector', 'lexical', 'hybrid'] }).notNull(),
    params: jsonb('params').notNull().default({}),
    status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
    metrics: jsonb('metrics').notNull().default({}),
    perQuery: jsonb('per_query').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('eval_runs_dataset_idx').on(table.datasetId)],
);

// ---- Chat Sessions (P4) ----
// A chat session is the v2 conversation container: a title, the scoped
// knowledge bases it draws from, and the retrieval scope (top_k/method). Legacy
// `conversations` (entry-based) remain untouched; this is the P4 slice.
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New Chat'),
    kbIds: jsonb('kb_ids').notNull().default([]),
    scope: jsonb('scope').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Chat Messages (P4) ----
// A message in a session. Citations record the grounding chunks (index,
// chunk_id, document_id, title, text, score); `trace` records the retrieval
// + generation timing for chat.trace.
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    citations: jsonb('citations').notNull().default([]),
    trace: jsonb('trace').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('messages_session_idx').on(table.sessionId)],
);

// ---- Wiki (P5) ----
// A wiki page: a synthesized or manually-authored article scoped to a knowledge
// base, versioned like documents (every content edit appends a revision) and
// grounded by wiki_sources citations. `status` tracks generation (draft for
// manual pages, completed for generated pages).
export const wikis = pgTable(
  'wikis',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    kbId: integer('kb_id').references(() => knowledgeBases.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['draft', 'generating', 'completed'] }).notNull().default('draft'),
    revisionNo: integer('revision_no').notNull().default(1),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('wikis_kb_idx').on(table.kbId),
    index('wikis_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Wiki Revisions (P5) ----
export const wikiRevisions = pgTable(
  'wiki_revisions',
  {
    id: serial('id').primaryKey(),
    wikiId: integer('wiki_id')
      .notNull()
      .references(() => wikis.id, { onDelete: 'cascade' }),
    revisionNo: integer('revision_no').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    checksum: text('checksum').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('wiki_revisions_wiki_idx').on(table.wikiId)],
);

// ---- Wiki Sources (P5) ----
// Grounding anchors: which chunks/documents back a wiki page (W02 citations).
export const wikiSources = pgTable(
  'wiki_sources',
  {
    id: serial('id').primaryKey(),
    wikiId: integer('wiki_id')
      .notNull()
      .references(() => wikis.id, { onDelete: 'cascade' }),
    chunkId: text('chunk_id').notNull(),
    documentId: integer('document_id').notNull(),
    index: integer('index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('wiki_sources_wiki_idx').on(table.wikiId),
    index('wiki_sources_chunk_idx').on(table.chunkId),
  ],
);

// ---- Wiki Links (P5) ----
// Directed links between wiki pages (W03), forming the wiki knowledge graph.
export const wikiLinks = pgTable(
  'wiki_links',
  {
    id: serial('id').primaryKey(),
    sourceWikiId: integer('source_wiki_id')
      .notNull()
      .references(() => wikis.id, { onDelete: 'cascade' }),
    targetWikiId: integer('target_wiki_id')
      .notNull()
      .references(() => wikis.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wiki_links_src_tgt_idx').on(table.sourceWikiId, table.targetWikiId),
    index('wiki_links_target_idx').on(table.targetWikiId),
  ],
);

// ---- Agents (P6) ----
// A configurable agent: a named assistant with instructions, an optional model,
// an enabled tool set, configured MCP servers, and installed skills. Agents run
// grounded multi-step "runs" over the retrieval + tool pipeline (A01).
export const agents = pgTable(
  'agents',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    instructions: text('instructions').notNull().default(''),
    model: text('model').notNull().default(''),
    tools: jsonb('tools').notNull().default([]),
    mcpServers: jsonb('mcp_servers').notNull().default([]),
    skills: jsonb('skills').notNull().default([]),
    status: text('status', { enum: ['idle', 'running', 'stopped', 'error'] }).notNull().default('idle'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('agents_name_idx').on(table.name),
    index('agents_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Agent Runs (P6) ----
// One execution of an agent against a goal: the ordered tool-call steps, the
// final grounded answer, and the timing trace (agent.run / agent.trace / A06).
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    agentId: integer('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    goal: text('goal').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('running'),
    steps: jsonb('steps').notNull().default([]),
    answer: text('answer').notNull().default(''),
    trace: jsonb('trace').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('agent_runs_agent_idx').on(table.agentId),
    index('agent_runs_status_idx').on(table.status),
  ],
);

// ---- Agent Skills (P6) ----
// An installable skill: a named capability with a manifest. skills.list/install/
// validate/read operate on this table (A04).
export const agentSkills = pgTable(
  'agent_skills',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    manifest: jsonb('manifest').notNull().default({}),
    installed: boolean('installed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('agent_skills_name_idx').on(table.name)],
);

// ---- Agent Artifacts (P6) ----
// Outputs produced by sandbox runs (agent.sandbox_run → agent.artifact_list).
export const agentArtifacts = pgTable(
  'agent_artifacts',
  {
    id: serial('id').primaryKey(),
    runId: text('run_id').notNull(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull().default('application/json'),
    data: jsonb('data').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('agent_artifacts_run_idx').on(table.runId)],
);

// ---- Datasources (P7) ----
// A datasource binds a connector (by name) to a saved configuration, an optional
// cron schedule, and a sync cursor. Syncs append rows to datasource_sync_logs so
// datasource.logs can show history without mutating past results (D01/D02/D04).
export const datasources = pgTable(
  'datasources',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    connector: text('connector').notNull(),
    config: jsonb('config').notNull().default({}),
    schedule: text('schedule').notNull().default(''),
    status: text('status', { enum: ['active', 'paused', 'error'] }).notNull().default('active'),
    cursor: text('cursor'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('datasources_connector_idx').on(table.connector),
    index('datasources_deleted_at_idx').on(table.deletedAt),
  ],
);

// ---- Datasource Sync Logs (P7) ----
// One row per sync run: status, counts (total/created/updated/skipped), and any
// per-document errors. Never overwritten — datasource.logs reads history.
export const datasourceSyncLogs = pgTable(
  'datasource_sync_logs',
  {
    id: text('id').primaryKey(),
    datasourceId: integer('datasource_id')
      .notNull()
      .references(() => datasources.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['running', 'succeeded', 'failed', 'cancelled'] }).notNull().default('running'),
    total: integer('total').notNull().default(0),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    errors: jsonb('errors').notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('datasource_sync_logs_ds_idx').on(table.datasourceId),
    index('datasource_sync_logs_status_idx').on(table.status),
  ],
);

// ---- Models (P8 M01/M03) ----
// A registry of LLM / embedding / rerank models a workspace can bind to. Models
// are soft-deleted; exactly one model per `kind` is marked default (enforced by
// model.set_default, not a DB constraint). `config` holds provider-specific
// overrides (temperature, top_k, …) without storing credentials.
export const models = pgTable(
  'models',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['llm', 'embedding', 'rerank'] }).notNull(),
    provider: text('provider').notNull().default('ollama'),
    modelName: text('model_name').notNull(),
    baseUrl: text('base_url'),
    config: jsonb('config').notNull().default({}),
    isDefault: boolean('is_default').notNull().default(false),
    status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('models_kind_idx').on(table.kind),
    index('models_provider_idx').on(table.provider),
    index('models_deleted_at_idx').on(table.deletedAt),
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
