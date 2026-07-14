// Knowledge Layer — unified export
// All downstream consumers import from here, never from individual modules.
//
// Usage:
//   import { parseSandboxDetail, toEmbeddingMarkdown, toDisplayMarkdown } from './knowledge/index.js';

export { parseSandboxDetail, parseBatch } from './parser.js';
export { resolveReferences } from './resolver.js';
export { formatProperties, formatTags } from './formatter.js';
export { toEmbeddingMarkdown, toDisplayMarkdown, toDebugMarkdown } from './markdown.js';
export type {
  KnowledgeDocument,
  KnowledgeType,
  KnowledgeProperty,
  KnowledgeReference,
  KnowledgeAttachment,
  KnowledgeMetadata,
} from './types.js';
