// Vertical-slice operations. P1 knowledge operations (kb.*/doc.*/folder.*) are
// wired to the v2 REST surface; search/chat/jobs hit the existing REST; P2
// operations (doc.upload, …) stay contract-only until their phase lands.
import type { OperationDef, OperationContext } from '../../contracts/src/types.js';
import { operationRegistry } from './registry.js';
import { ApiClient } from './http-client.js';

let registered = false;

/** Populate the registry exactly once per process. Idempotent — safe to call
 *  from every entry point (CLI, MCP stdio, MCP http). */
export function ensureOperationsRegistered(api: ApiClient): void {
  if (registered) return;
  registered = true;
  registerOperations(api);
}

function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

/** Call a v2 operation and unwrap the wire envelope's `data`. */
async function callV2(
  api: ApiClient,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  input: Record<string, unknown>,
  ctx: OperationContext,
): Promise<any> {
  if (method === 'GET' || method === 'DELETE') {
    const res = await api.request<any>(method, `${path}${qs(input)}`, undefined, ctx);
    return res?.data ?? res;
  }
  const res = await api.request<any>(method, path, input, ctx);
  return res?.data ?? res;
}

const kbSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    slug: { type: 'string' },
    description: { type: 'string' },
    visibility: { type: 'string', enum: ['public', 'internal'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'name', 'slug'],
};

export function registerOperations(api: ApiClient): void {
  // ── P1: KB CRUD ─────────────────────────────────────────────────────────
  operationRegistry.register({
    id: 'kb.create',
    version: '1',
    title: 'Create a knowledge base',
    description: 'Create a scoped knowledge base with a stable slug and visibility.',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        visibility: { type: 'string', enum: ['public', 'internal'] },
      },
      required: ['name'],
    },
    outputSchema: kbSchema,
    http: { method: 'POST', path: '/api/v2/ops/kb/create' },
    cli: { command: 'microera kb create', examples: ['microera kb create --name "Materials" --visibility internal'] },
    mcp: { toolName: 'kb_create', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/kb/create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.list',
    version: '1',
    title: 'List knowledge bases',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: kbSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/kb/list' },
    cli: { command: 'microera kb list', examples: ['microera kb list'] },
    mcp: { toolName: 'kb_list', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/kb/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.view',
    version: '1',
    title: 'View a knowledge base',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' } }, required: ['kb_id'] },
    outputSchema: kbSchema,
    http: { method: 'GET', path: '/api/v2/ops/kb/view' },
    cli: { command: 'microera kb view', examples: ['microera kb view --kb-id 1'] },
    mcp: { toolName: 'kb_view', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/kb/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.update',
    version: '1',
    title: 'Update a knowledge base',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        kb_id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        visibility: { type: 'string', enum: ['public', 'internal'] },
      },
      required: ['kb_id'],
    },
    outputSchema: kbSchema,
    http: { method: 'PATCH', path: '/api/v2/ops/kb/update' },
    cli: { command: 'microera kb update', examples: ['microera kb update --kb-id 1 --name "New name"'] },
    mcp: { toolName: 'kb_update', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'PATCH', '/api/v2/ops/kb/update', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.delete',
    version: '1',
    title: 'Delete a knowledge base',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' } }, required: ['kb_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/kb/delete' },
    cli: { command: 'microera kb delete', examples: ['microera kb delete --kb-id 1'] },
    mcp: { toolName: 'kb_delete', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/kb/delete', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.status',
    version: '1',
    title: 'Knowledge base status',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' } }, required: ['kb_id'] },
    outputSchema: { type: 'object', properties: { id: { type: 'integer' }, document_count: { type: 'integer' }, embedding_model: { type: 'string' }, ready: { type: 'boolean' } } },
    http: { method: 'GET', path: '/api/v2/ops/kb/status' },
    cli: { command: 'microera kb status', examples: ['microera kb status --kb-id 1'] },
    mcp: { toolName: 'kb_status', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/kb/status', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.check',
    version: '1',
    title: 'Check knowledge base existence',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, slug: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { exists: { type: 'boolean' }, id: { type: 'integer' }, slug: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/kb/check' },
    cli: { command: 'microera kb check', examples: ['microera kb check --slug legacy'] },
    mcp: { toolName: 'kb_check', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/kb/check', input, ctx);
    },
  });

  // ── P1: Folders ─────────────────────────────────────────────────────────
  const folderSchema = {
    type: 'object',
    properties: { id: { type: 'integer' }, kb_id: { type: 'integer' }, parent_id: { type: 'integer' }, name: { type: 'string' } },
    required: ['id', 'kb_id', 'name'],
  };

  operationRegistry.register({
    id: 'kb.folder_create',
    version: '1',
    title: 'Create a folder',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, parent_id: { type: 'integer' }, name: { type: 'string' } }, required: ['kb_id', 'name'] },
    outputSchema: folderSchema,
    http: { method: 'POST', path: '/api/v2/ops/kb/folder_create' },
    cli: { command: 'microera kb folder create', examples: ['microera kb folder create --kb-id 1 --name "Papers"'] },
    mcp: { toolName: 'kb_folder_create', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/kb/folder_create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.folder_list',
    version: '1',
    title: 'List folders',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' } }, required: ['kb_id'] },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: folderSchema }, kb_id: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/kb/folder_list' },
    cli: { command: 'microera kb folder list', examples: ['microera kb folder list --kb-id 1'] },
    mcp: { toolName: 'kb_folder_list', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/kb/folder_list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.folder_move',
    version: '1',
    title: 'Move a folder',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { folder_id: { type: 'integer' }, parent_id: { type: 'integer' } }, required: ['folder_id'] },
    outputSchema: folderSchema,
    http: { method: 'POST', path: '/api/v2/ops/kb/folder_move' },
    cli: { command: 'microera kb folder move', examples: ['microera kb folder move --folder-id 2 --parent-id 1'] },
    mcp: { toolName: 'kb_folder_move', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/kb/folder_move', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.folder_delete',
    version: '1',
    title: 'Delete a folder',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { folder_id: { type: 'integer' } }, required: ['folder_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/kb/folder_delete' },
    cli: { command: 'microera kb folder delete', examples: ['microera kb folder delete --folder-id 2'] },
    mcp: { toolName: 'kb_folder_delete', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/kb/folder_delete', input, ctx);
    },
  });

  // ── P1: Documents ───────────────────────────────────────────────────────
  const docSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      kb_id: { type: 'integer' },
      source_id: { type: 'integer' },
      entry_id: { type: 'integer' },
      folder_id: { type: 'integer' },
      title: { type: 'string' },
      summary: { type: 'string' },
      content: { type: 'string' },
      visibility: { type: 'string', enum: ['public', 'internal'] },
      parse_status: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
    required: ['id', 'kb_id', 'title'],
  };

  operationRegistry.register({
    id: 'doc.list',
    version: '1',
    title: 'List documents',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, folder_id: { type: 'integer' }, page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: docSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/list' },
    cli: { command: 'microera doc list', examples: ['microera doc list --kb-id 1'] },
    mcp: { toolName: 'doc_list', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.view',
    version: '1',
    title: 'View a document',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: docSchema,
    http: { method: 'GET', path: '/api/v2/ops/doc/view' },
    cli: { command: 'microera doc view', examples: ['microera doc view --doc-id 1'] },
    mcp: { toolName: 'doc_view', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.update',
    version: '1',
    title: 'Update a document',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'integer' },
        title: { type: 'string' },
        summary: { type: 'string' },
        content: { type: 'string' },
        visibility: { type: 'string', enum: ['public', 'internal'] },
        folder_id: { type: 'integer' },
      },
      required: ['doc_id'],
    },
    outputSchema: docSchema,
    http: { method: 'PATCH', path: '/api/v2/ops/doc/update' },
    cli: { command: 'microera doc update', examples: ['microera doc update --doc-id 1 --title "New title"'] },
    mcp: { toolName: 'doc_update', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'PATCH', '/api/v2/ops/doc/update', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.delete',
    version: '1',
    title: 'Delete a document',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/doc/delete' },
    cli: { command: 'microera doc delete', examples: ['microera doc delete --doc-id 1'] },
    mcp: { toolName: 'doc_delete', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/doc/delete', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.restore',
    version: '1',
    title: 'Restore a deleted document',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: docSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/restore' },
    cli: { command: 'microera doc restore', examples: ['microera doc restore --doc-id 1'] },
    mcp: { toolName: 'doc_restore', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/restore', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.move',
    version: '1',
    title: 'Move a document to a folder',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, folder_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: docSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/move' },
    cli: { command: 'microera doc move', examples: ['microera doc move --doc-id 1 --folder-id 2'] },
    mcp: { toolName: 'doc_move', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/move', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.batch',
    version: '1',
    title: 'Batch delete documents',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { doc_ids: { type: 'array', items: { type: 'integer' } } }, required: ['doc_ids'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'integer' }, ids: { type: 'array', items: { type: 'integer' } }, missing: { type: 'array', items: { type: 'integer' } } } },
    http: { method: 'POST', path: '/api/v2/ops/doc/batch' },
    cli: { command: 'microera doc batch', examples: ['microera doc batch --doc-ids 1,2,3'] },
    mcp: { toolName: 'doc_batch', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/batch', input, ctx);
    },
  });

  // ── P1: Revisions ───────────────────────────────────────────────────────
  const revisionSchema = {
    type: 'object',
    properties: { id: { type: 'integer' }, document_id: { type: 'integer' }, revision_no: { type: 'integer' }, title: { type: 'string' }, content: { type: 'string' }, checksum: { type: 'string' }, created_at: { type: 'string' } },
    required: ['id', 'document_id', 'revision_no', 'checksum'],
  };

  operationRegistry.register({
    id: 'doc.revisions',
    version: '1',
    title: 'List document revisions',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: revisionSchema }, document_id: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/revisions' },
    cli: { command: 'microera doc revisions', examples: ['microera doc revisions --doc-id 1'] },
    mcp: { toolName: 'doc_revisions', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/revisions', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.revision_view',
    version: '1',
    title: 'View a document revision',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, revision_no: { type: 'integer' } }, required: ['doc_id', 'revision_no'] },
    outputSchema: revisionSchema,
    http: { method: 'GET', path: '/api/v2/ops/doc/revision_view' },
    cli: { command: 'microera doc revision-view', examples: ['microera doc revision-view --doc-id 1 --revision-no 1'] },
    mcp: { toolName: 'doc_revision_view', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/revision_view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.revision_restore',
    version: '1',
    title: 'Restore a document revision',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, revision_no: { type: 'integer' } }, required: ['doc_id', 'revision_no'] },
    outputSchema: docSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/revision_restore' },
    cli: { command: 'microera doc revision-restore', examples: ['microera doc revision-restore --doc-id 1 --revision-no 1'] },
    mcp: { toolName: 'doc_revision_restore', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/revision_restore', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.source_view',
    version: '1',
    title: 'View a document source',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { source_id: { type: 'integer' } }, required: ['source_id'] },
    outputSchema: { type: 'object', properties: { id: { type: 'integer' }, kb_id: { type: 'integer' }, type: { type: 'string' }, name: { type: 'string' }, uri: { type: 'string' }, checksum: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/source_view' },
    cli: { command: 'microera doc source-view', examples: ['microera doc source-view --source-id 1'] },
    mcp: { toolName: 'doc_source_view', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/source_view', input, ctx);
    },
  });

  // ── P2: document upload (contract only for now) ─────────────────────────
  operationRegistry.register({
    id: 'doc.upload',
    version: '1',
    title: 'Upload a document',
    description: 'Upload a file into a knowledge base; returns a document id and job id (not "already indexed").',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { kb_id: { type: 'string' }, file_path: { type: 'string' } },
      required: ['kb_id', 'file_path'],
    },
    outputSchema: { type: 'object', properties: { document_id: { type: 'string' }, job_id: { type: 'string' } }, required: ['document_id', 'job_id'] },
    http: { method: 'POST', path: '/api/v2/ops/doc/upload' },
    cli: { command: 'microera doc upload', examples: ['microera doc upload --kb-id kb_x --file paper.pdf'] },
    mcp: { toolName: 'doc_upload', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
  });

  // ── P3: search (wired to existing /api/search) ──────────────────────────
  operationRegistry.register({
    id: 'search.hybrid',
    version: '1',
    title: 'Hybrid retrieval',
    description: 'Semantic + keyword retrieval over the knowledge base.',
    kind: 'query',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'string' } }, top_k: { type: 'integer' } },
      required: ['query'],
    },
    outputSchema: { type: 'object', properties: { hits: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/search' },
    cli: { command: 'microera search hybrid', examples: ['microera search hybrid "MOF pore aperture"'] },
    mcp: { toolName: 'search_hybrid', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      const body = await api.request<any>('POST', '/api/search', { query: input.query, searchMode: 'nlp' }, ctx);
      const results: any[] = body?.results ?? [];
      return {
        hits: results.map((r: any) => ({
          documentId: String(r.id),
          chunkId: `entry_${r.id}`,
          revisionId: 'legacy',
          text: r.summary ?? '',
          score: 1,
        })),
        count: results.length,
      };
    },
  });

  // ── P4: chat (wired to existing /api/ai/chat) ───────────────────────────
  operationRegistry.register({
    id: 'chat.ask',
    version: '1',
    title: 'Ask a grounded question',
    kind: 'query',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'string' } }, conversation_id: { type: 'string' } },
      required: ['question'],
    },
    outputSchema: { type: 'object', properties: { answer: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } }, conversation_id: { type: 'string' } } },
    http: { method: 'POST', path: '/api/ai/chat' },
    cli: { command: 'microera chat ask', examples: ['microera chat ask "Which papers discuss pore size?"'] },
    mcp: { toolName: 'chat_ask', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      const body = await api.request<any>('POST', '/api/ai/chat', {
        question: input.question,
        conversationId: input.conversation_id,
      }, ctx);
      return {
        answer: body?.answer ?? '',
        citations: (body?.sources ?? []).map((s: any) => ({
          source_uri: `entry:${s.id}`,
          document_id: String(s.id),
          revision_id: 'legacy',
          chunk_id: `entry_${s.id}`,
          title: s.title,
        })),
        conversation_id: body?.conversationId != null ? String(body.conversationId) : undefined,
      };
    },
  });

  operationRegistry.register({
    id: 'chat.references',
    version: '1',
    title: 'List chat references',
    description: 'Return the source anchors backing a chat answer.',
    kind: 'query',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { conversation_id: { type: 'string' } },
    },
    outputSchema: { type: 'object', properties: { citations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/ai/chat' },
    cli: { command: 'microera chat references', examples: ['microera chat references --conversation-id 12'] },
    mcp: { toolName: 'chat_references', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      const body = await api.request<any>('GET', `/api/ai/conversations/${input.conversation_id}`, undefined, ctx);
      const messages: any[] = Array.isArray(body) ? body : [];
      const sources = messages.flatMap((m: any) => (m.sources ?? []));
      return { citations: sources.map((s: any) => ({ document_id: String(s.id), title: s.title, revision_id: 'legacy' })) };
    },
  });

  // ── P8: jobs (wired to existing /api/pipeline/jobs) ─────────────────────
  operationRegistry.register({
    id: 'job.view',
    version: '1',
    title: 'View a job',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' }, stage: { type: 'string' }, progress: { type: 'number' } } },
    http: { method: 'GET', path: '/api/pipeline/jobs/:id' },
    cli: { command: 'microera job view', examples: ['microera job view --job-id abc123'] },
    mcp: { toolName: 'job_view', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      const body = await api.request<any>('GET', `/api/pipeline/jobs/${input.job_id}`, undefined, ctx);
      const j = body?.job ?? {};
      return {
        job_id: String(j.id ?? input.job_id),
        status: j.status ?? 'unknown',
        stage: j.stage ?? undefined,
        progress: j.progress ?? undefined,
      };
    },
  });

  operationRegistry.register({
    id: 'job.list',
    version: '1',
    title: 'List jobs',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/pipeline/jobs' },
    cli: { command: 'microera job list', examples: ['microera job list'] },
    mcp: { toolName: 'job_list', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(_input: any, ctx: OperationContext) {
      const body = await api.request<any>('GET', '/api/pipeline/jobs', undefined, ctx);
      return { jobs: body?.jobs ?? [] };
    },
  });

  // ── local: auth whoami (reuses existing login; not a business MCP tool) ─
  operationRegistry.register({
    id: 'auth.whoami',
    version: '1',
    title: 'Show the current identity',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { isLoggedIn: { type: 'boolean' }, user: { type: 'object' } } },
    cli: { command: 'microera auth whoami', examples: ['microera auth whoami'] },
    mcp: { toolName: 'auth_whoami', readOnlyHint: true, scopes: [] },
    transport: 'local',
    async handler(_input: any, ctx: OperationContext) {
      return api.request<any>('GET', '/api/auth/me', undefined, ctx);
    },
  });
}
