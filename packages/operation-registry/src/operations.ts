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

  // ── P1: preview / artifacts / export / import ───────────────────────────
  operationRegistry.register({
    id: 'doc.preview',
    version: '1',
    title: 'Preview a document',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, title: { type: 'string' }, format: { type: 'string' }, preview: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/doc/preview' },
    cli: { command: 'microera doc preview', examples: ['microera doc preview --doc-id 1'] },
    mcp: { toolName: 'doc_preview', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/preview', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.download',
    version: '1',
    title: 'Download a document',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, file_name: { type: 'string' }, mime: { type: 'string' }, size: { type: 'integer' }, content: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/download' },
    cli: { command: 'microera doc download', examples: ['microera doc download --doc-id 1'] },
    mcp: { toolName: 'doc_download', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/download', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.artifacts',
    version: '1',
    title: 'List document artifacts',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' } } } } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/artifacts' },
    cli: { command: 'microera doc artifacts', examples: ['microera doc artifacts --doc-id 1'] },
    mcp: { toolName: 'doc_artifacts', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/artifacts', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.artifact_download',
    version: '1',
    title: 'Download a document artifact',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, name: { type: 'string' } }, required: ['doc_id', 'name'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, name: { type: 'string' }, mime: { type: 'string' }, size: { type: 'integer' }, content: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/artifact_download' },
    cli: { command: 'microera doc artifact-download', examples: ['microera doc artifact-download --doc-id 1 --name content.md'] },
    mcp: { toolName: 'doc_artifact_download', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/artifact_download', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.export',
    version: '1',
    title: 'Export a knowledge base',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, format: { type: 'string' } }, required: ['kb_id'] },
    outputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, format: { type: 'string' }, exported_at: { type: 'string' }, count: { type: 'integer' }, data: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/kb/export' },
    cli: { command: 'microera kb export', examples: ['microera kb export --kb-id 1'] },
    mcp: { toolName: 'kb_export', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/kb/export', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'kb.import',
    version: '1',
    title: 'Import documents into a knowledge base',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, documents: { type: 'array', items: { type: 'object' } } }, required: ['kb_id', 'documents'] },
    outputSchema: { type: 'object', properties: { kb_id: { type: 'integer' }, imported: { type: 'integer' }, document_ids: { type: 'array', items: { type: 'integer' } } } },
    http: { method: 'POST', path: '/api/v2/ops/kb/import' },
    cli: { command: 'microera kb import', examples: ['microera kb import --kb-id 1 --file export.json'] },
    mcp: { toolName: 'kb_import', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/kb/import', input, ctx);
    },
  });

  // ── P2: upload / import / parse / reparse / wait (P01) ──────────────────
  const jobHandleSchema = {
    type: 'object',
    properties: { document_id: { type: 'integer' }, job_id: { type: 'string' } },
    required: ['document_id', 'job_id'],
  };
  const jobStatusSchema = {
    type: 'object',
    properties: {
      job_id: { type: 'string' },
      status: { type: 'string' },
      type: { type: 'string' },
      document_id: { type: 'integer' },
      attempt: { type: 'integer' },
      max_attempts: { type: 'integer' },
      stage: { type: 'string' },
      progress: { type: 'integer' },
      error: { type: 'string' },
      error_code: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
    required: ['job_id', 'status'],
  };
  const chunkSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      document_id: { type: 'integer' },
      index: { type: 'integer' },
      text: { type: 'string' },
      strategy: { type: 'string' },
      heading: { type: 'string' },
      start_char: { type: 'integer' },
      end_char: { type: 'integer' },
    },
    required: ['id', 'document_id', 'index', 'text'],
  };

  operationRegistry.register({
    id: 'doc.upload',
    version: '1',
    title: 'Upload a document',
    description: 'Upload text/markdown into a KB; returns a document id and a durable parse job id (not "already indexed").',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        kb_id: { type: 'integer' },
        title: { type: 'string' },
        content: { type: 'string' },
        file_name: { type: 'string' },
        file_path: { type: 'string' },
        visibility: { type: 'string', enum: ['public', 'internal'] },
      },
      required: ['kb_id'],
    },
    outputSchema: jobHandleSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/upload' },
    cli: { command: 'microera doc upload', examples: ['microera doc upload --kb-id 1 --title "Paper" --content "# H"'] },
    mcp: { toolName: 'doc_upload', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/upload', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.import_url',
    version: '1',
    title: 'Import a document from a URL',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { kb_id: { type: 'integer' }, url: { type: 'string' }, title: { type: 'string' }, visibility: { type: 'string', enum: ['public', 'internal'] } },
      required: ['kb_id', 'url'],
    },
    outputSchema: jobHandleSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/import_url' },
    cli: { command: 'microera doc import-url', examples: ['microera doc import-url --kb-id 1 --url https://example.com/paper.md'] },
    mcp: { toolName: 'doc_import_url', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/import_url', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.parse',
    version: '1',
    title: 'Parse a document',
    description: 'Enqueue a durable parse job for an existing document.',
    kind: 'job',
    risk: 'write',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: jobHandleSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/parse' },
    cli: { command: 'microera doc parse', examples: ['microera doc parse --doc-id 1'] },
    mcp: { toolName: 'doc_parse', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/parse', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.reparse',
    version: '1',
    title: 'Re-parse a document',
    kind: 'job',
    risk: 'write',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: jobHandleSchema,
    http: { method: 'POST', path: '/api/v2/ops/doc/reparse' },
    cli: { command: 'microera doc reparse', examples: ['microera doc reparse --doc-id 1'] },
    mcp: { toolName: 'doc_reparse', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/reparse', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.wait',
    version: '1',
    title: 'Wait for a parse job',
    kind: 'job',
    risk: 'read',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, timeout_ms: { type: 'integer' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' }, document_id: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/wait' },
    cli: { command: 'microera doc wait', examples: ['microera doc wait --job-id parse_x'] },
    mcp: { toolName: 'doc_wait', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/wait', input, ctx);
    },
  });

  // ── P2: parsed elements (P02) ───────────────────────────────────────────
  operationRegistry.register({
    id: 'doc.images',
    version: '1',
    title: 'List document images',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/images' },
    cli: { command: 'microera doc images', examples: ['microera doc images --doc-id 1'] },
    mcp: { toolName: 'doc_images', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/images', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.tables',
    version: '1',
    title: 'List document tables',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/doc/tables' },
    cli: { command: 'microera doc tables', examples: ['microera doc tables --doc-id 1'] },
    mcp: { toolName: 'doc_tables', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/doc/tables', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'doc.ocr',
    version: '1',
    title: 'Run OCR over document images',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, ocr_status: { type: 'string' }, images: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/doc/ocr' },
    cli: { command: 'microera doc ocr', examples: ['microera doc ocr --doc-id 1'] },
    mcp: { toolName: 'doc_ocr', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/doc/ocr', input, ctx);
    },
  });

  // ── P2: chunks (P03) ────────────────────────────────────────────────────
  operationRegistry.register({
    id: 'chunk.list',
    version: '1',
    title: 'List document chunks',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' } }, required: ['doc_id'] },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, items: { type: 'array', items: chunkSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/chunk/list' },
    cli: { command: 'microera chunk list', examples: ['microera chunk list --doc-id 1'] },
    mcp: { toolName: 'chunk_list', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/chunk/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chunk.view',
    version: '1',
    title: 'View a document chunk',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, chunk_id: { type: 'string' } }, required: ['doc_id', 'chunk_id'] },
    outputSchema: chunkSchema,
    http: { method: 'GET', path: '/api/v2/ops/chunk/view' },
    cli: { command: 'microera chunk view', examples: ['microera chunk view --doc-id 1 --chunk-id c1'] },
    mcp: { toolName: 'chunk_view', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/chunk/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chunk.preview',
    version: '1',
    title: 'Preview chunking of a document',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'integer' }, strategy: { type: 'string' }, chunk_size: { type: 'integer' }, overlap: { type: 'integer' }, min_chunk_size: { type: 'integer' } },
      required: ['doc_id'],
    },
    outputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, strategy: { type: 'string' }, chunk_size: { type: 'integer' }, overlap: { type: 'integer' }, chunks: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/chunk/preview' },
    cli: { command: 'microera chunk preview', examples: ['microera chunk preview --doc-id 1 --strategy markdown'] },
    mcp: { toolName: 'chunk_preview', readOnlyHint: true, scopes: ['doc:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chunk/preview', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chunk.update',
    version: '1',
    title: 'Update a chunk',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, chunk_id: { type: 'string' }, text: { type: 'string' } }, required: ['doc_id', 'chunk_id', 'text'] },
    outputSchema: chunkSchema,
    http: { method: 'PATCH', path: '/api/v2/ops/chunk/update' },
    cli: { command: 'microera chunk update', examples: ['microera chunk update --doc-id 1 --chunk-id c1 --text "new"'] },
    mcp: { toolName: 'chunk_update', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'PATCH', '/api/v2/ops/chunk/update', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chunk.delete',
    version: '1',
    title: 'Delete a chunk',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { doc_id: { type: 'integer' }, chunk_id: { type: 'string' } }, required: ['doc_id', 'chunk_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'string' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/chunk/delete' },
    cli: { command: 'microera chunk delete', examples: ['microera chunk delete --doc-id 1 --chunk-id c1'] },
    mcp: { toolName: 'chunk_delete', readOnlyHint: false, scopes: ['doc:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/chunk/delete', input, ctx);
    },
  });

  // ── P2: durable parse jobs (P04) + deadletters (O03) ────────────────────
  operationRegistry.register({
    id: 'job.parse_status',
    version: '1',
    title: 'Parse job status',
    kind: 'job',
    risk: 'read',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: jobStatusSchema,
    http: { method: 'GET', path: '/api/v2/ops/job/parse_status' },
    cli: { command: 'microera job parse-status', examples: ['microera job parse-status --job-id parse_x'] },
    mcp: { toolName: 'job_parse_status', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/job/parse_status', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.parse_retry',
    version: '1',
    title: 'Retry a failed parse job',
    kind: 'job',
    risk: 'write',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: jobStatusSchema,
    http: { method: 'POST', path: '/api/v2/ops/job/parse_retry' },
    cli: { command: 'microera job parse-retry', examples: ['microera job parse-retry --job-id parse_x'] },
    mcp: { toolName: 'job_parse_retry', readOnlyHint: false, scopes: ['job:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/job/parse_retry', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.parse_cancel',
    version: '1',
    title: 'Cancel a parse job',
    kind: 'job',
    risk: 'write',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: jobStatusSchema,
    http: { method: 'POST', path: '/api/v2/ops/job/parse_cancel' },
    cli: { command: 'microera job parse-cancel', examples: ['microera job parse-cancel --job-id parse_x'] },
    mcp: { toolName: 'job_parse_cancel', readOnlyHint: false, scopes: ['job:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/job/parse_cancel', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.deadletters',
    version: '1',
    title: 'List dead-lettered parse jobs',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/job/deadletters' },
    cli: { command: 'microera job deadletters', examples: ['microera job deadletters'] },
    mcp: { toolName: 'job_deadletters', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(_input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/job/deadletters', {}, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.replay_deadletter',
    version: '1',
    title: 'Replay a dead-lettered job',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { deadletter_id: { type: 'string' } }, required: ['deadletter_id'] },
    outputSchema: jobStatusSchema,
    http: { method: 'POST', path: '/api/v2/ops/job/replay_deadletter' },
    cli: { command: 'microera job replay-deadletter', examples: ['microera job replay-deadletter --deadletter-id dl_1'] },
    mcp: { toolName: 'job_replay_deadletter', readOnlyHint: false, scopes: ['job:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/job/replay_deadletter', input, ctx);
    },
  });

  // ── P3-03: search.hybrid + search.explain (RRF fusion) ───────────────────
  operationRegistry.register({
    id: 'search.hybrid',
    version: '1',
    title: 'Hybrid retrieval',
    description: 'Fuses vector and lexical results with reciprocal-rank fusion (RRF) into a single deterministic ranking.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kb_id: { type: 'integer' },
        folder_id: { type: 'integer' },
        top_k: { type: 'integer' },
        is_internal: { type: 'boolean' },
        rrf_k: { type: 'integer' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/search/hybrid' },
    cli: { command: 'microera search hybrid', examples: ['microera search hybrid "MOF pore aperture" --kb-id 1 --top-k 5'] },
    mcp: { toolName: 'search_hybrid', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/search/hybrid', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'search.explain',
    version: '1',
    title: 'Explain hybrid retrieval',
    description: 'Hybrid retrieval with a per-source score trace: vector rank/score, lexical rank/score, and the fused RRF score.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kb_id: { type: 'integer' },
        folder_id: { type: 'integer' },
        top_k: { type: 'integer' },
        is_internal: { type: 'boolean' },
        rrf_k: { type: 'integer' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/search/explain' },
    cli: { command: 'microera search explain', examples: ['microera search explain "MOF pore aperture" --kb-id 1'] },
    mcp: { toolName: 'search_explain', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/search/explain', input, ctx);
    },
  });

  // ── P3-04: search.rerank (adapter + fallback + timeout + scoring trace) ──
  operationRegistry.register({
    id: 'search.rerank',
    version: '1',
    title: 'Rerank candidates',
    description: 'Rerank a candidate list against a query via a pluggable provider, with a timeout and fallback to original ordering; returns a scoring trace.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        documents: { type: 'array', items: { type: 'object' } },
        top_k: { type: 'integer' },
      },
      required: ['query', 'documents'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        provider: { type: 'string' },
        fallback: { type: 'boolean' },
        timed_out: { type: 'boolean' },
        elapsed_ms: { type: 'integer' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/search/rerank' },
    cli: { command: 'microera search rerank', examples: ['microera search rerank --query "MOF pore aperture" --documents \'[{"text":"a"}]\''] },
    mcp: { toolName: 'search_rerank', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/search/rerank', input, ctx);
    },
  });

  // ── P3-01: search.vector (global scored TopK + DB-level ACL) ─────────────
  operationRegistry.register({
    id: 'search.vector',
    version: '1',
    title: 'Vector search',
    description: 'Semantic TopK over the knowledge pipeline, ranked globally by cosine similarity with visibility ACL enforced in SQL.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kb_id: { type: 'integer' },
        folder_id: { type: 'integer' },
        top_k: { type: 'integer' },
        is_internal: { type: 'boolean' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/search/vector' },
    cli: { command: 'microera search vector', examples: ['microera search vector "MOF pore aperture" --kb-id 1 --top-k 5'] },
    mcp: { toolName: 'search_vector', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/search/vector', input, ctx);
    },
  });

  // ── P3-02: search.lexical (Postgres FTS BM25 baseline) ───────────────────
  operationRegistry.register({
    id: 'search.lexical',
    version: '1',
    title: 'Lexical search',
    description: 'Keyword retrieval via Postgres full-text search (ts_rank baseline) with query normalization and SQL-enforced visibility ACL.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kb_id: { type: 'integer' },
        folder_id: { type: 'integer' },
        top_k: { type: 'integer' },
        is_internal: { type: 'boolean' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/search/lexical' },
    cli: { command: 'microera search lexical', examples: ['microera search lexical "MOF pore aperture" --kb-id 1'] },
    mcp: { toolName: 'search_lexical', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/search/lexical', input, ctx);
    },
  });

  // ── P3-06: search.filtered + search.metadata (metadata-filtered retrieval) ─
  operationRegistry.register({
    id: 'search.filtered',
    version: '1',
    title: 'Filtered retrieval',
    description: 'Retrieve with metadata filters (strategy, visibility, document ids, title substring, created range) applied in SQL.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] },
        kb_id: { type: 'integer' },
        folder_id: { type: 'integer' },
        top_k: { type: 'integer' },
        is_internal: { type: 'boolean' },
        filters: { type: 'object' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        method: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/search/filtered' },
    cli: { command: 'microera search filtered', examples: ['microera search filtered "MOF" --method lexical --filters \'{"visibility":"public"}\''] },
    mcp: { toolName: 'search_filtered', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/search/filtered', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'search.metadata',
    version: '1',
    title: 'Search filter metadata',
    description: 'Describe the filterable metadata fields and available retrieval methods for filtered search.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        methods: { type: 'array', items: { type: 'string' } },
        filterable_fields: { type: 'array', items: { type: 'object' } },
      },
    },
    http: { method: 'GET', path: '/api/v2/ops/search/metadata' },
    cli: { command: 'microera search metadata', examples: ['microera search metadata'] },
    mcp: { toolName: 'search_metadata', readOnlyHint: true, scopes: ['search:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/search/metadata', input, ctx);
    },
  });

  // ── P3-05: eval.* (retrieval evaluation datasets + runs) ─────────────────
  operationRegistry.register({
    id: 'eval.dataset_list',
    version: '1',
    title: 'List eval datasets',
    description: 'List retrieval evaluation datasets (name, scope, default method, item count).',
    kind: 'query',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        page_size: { type: 'integer' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
    },
    http: { method: 'GET', path: '/api/v2/ops/eval/dataset_list' },
    cli: { command: 'microera eval dataset-list', examples: ['microera eval dataset-list'] },
    mcp: { toolName: 'eval_dataset_list', readOnlyHint: true, scopes: ['eval:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/eval/dataset_list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'eval.dataset_create',
    version: '1',
    title: 'Create an eval dataset',
    description: 'Create a retrieval evaluation dataset from a list of query relevance judgements.',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        kb_id: { type: 'integer' },
        description: { type: 'string' },
        method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] },
        queries: { type: 'array', items: { type: 'object' } },
      },
      required: ['name', 'queries'],
    },
    outputSchema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, items: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/eval/dataset_create' },
    cli: { command: 'microera eval dataset-create', examples: ['microera eval dataset-create --name "retrieval set" --queries \'[{"query":"MOF","relevant_document_ids":[1]}]\''] },
    mcp: { toolName: 'eval_dataset_create', readOnlyHint: false, scopes: ['eval:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/eval/dataset_create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'eval.run',
    version: '1',
    title: 'Run an evaluation',
    description: 'Score a retrieval method (vector/lexical/hybrid) against a dataset and record recall@k/MRR/nDCG@k.',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: { type: 'integer' },
        method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] },
        top_k: { type: 'integer' },
        is_internal: { type: 'boolean' },
      },
      required: ['dataset_id'],
    },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, metrics: { type: 'object' }, per_query: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/eval/run' },
    cli: { command: 'microera eval run', examples: ['microera eval run --dataset-id 1 --method hybrid --top-k 5'] },
    mcp: { toolName: 'eval_run', readOnlyHint: false, scopes: ['eval:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/eval/run', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'eval.report',
    version: '1',
    title: 'Read an eval report',
    description: 'Return a persisted eval run: aggregate metrics and the per-query breakdown.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, metrics: { type: 'object' }, per_query: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/eval/report' },
    cli: { command: 'microera eval report', examples: ['microera eval report --run-id eval_...'] },
    mcp: { toolName: 'eval_report', readOnlyHint: true, scopes: ['eval:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/eval/report', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'eval.compare',
    version: '1',
    title: 'Compare eval runs',
    description: 'Compare two or more eval runs side-by-side, with metric deltas relative to the first (baseline) run.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { run_ids: { type: 'array', items: { type: 'string' } } },
      required: ['run_ids'],
    },
    outputSchema: { type: 'object', properties: { baseline_run_id: { type: 'string' }, runs: { type: 'array', items: { type: 'object' } }, deltas: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/eval/compare' },
    cli: { command: 'microera eval compare', examples: ['microera eval compare --run-ids eval_... eval_...'] },
    mcp: { toolName: 'eval_compare', readOnlyHint: true, scopes: ['eval:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/eval/compare', input, ctx);
    },
  });

  // ── P4: chat (grounded Q&A over the v2 retrieval pipeline) ──────────────
  operationRegistry.register({
    id: 'chat.ask',
    version: '1',
    title: 'Ask a grounded question',
    description: 'Retrieve the top chunks for the question, build a citation-grounded prompt, and return the answer + citation list.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        kb_ids: { type: 'array', items: { type: 'integer' } },
        session_id: { type: 'string' },
        top_k: { type: 'integer' },
        method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] },
        is_internal: { type: 'boolean' },
      },
      required: ['question'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        citations: { type: 'array', items: { type: 'object' } },
        session_id: { type: 'string' },
        trace: { type: 'object' },
      },
    },
    http: { method: 'POST', path: '/api/v2/ops/chat/ask' },
    cli: { command: 'microera chat ask', examples: ['microera chat ask "Which papers discuss pore size?" --kb-ids 1 --method hybrid'] },
    mcp: { toolName: 'chat_ask', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chat/ask', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chat.references',
    version: '1',
    title: 'List chat references',
    description: 'Return the source citations backing an assistant message.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' } }, required: ['message_id'] },
    outputSchema: { type: 'object', properties: { message_id: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/chat/references' },
    cli: { command: 'microera chat references', examples: ['microera chat references --message-id msg_...'] },
    mcp: { toolName: 'chat_references', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chat/references', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chat.citation_read',
    version: '1',
    title: 'Read a citation chunk',
    description: 'Fetch the full chunk text + document title behind a citation.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { chunk_id: { type: 'string' } }, required: ['chunk_id'] },
    outputSchema: { type: 'object', properties: { chunk_id: { type: 'string' }, document_id: { type: 'integer' }, title: { type: 'string' }, text: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/chat/citation_read' },
    cli: { command: 'microera chat citation-read', examples: ['microera chat citation-read --chunk-id chunk_...'] },
    mcp: { toolName: 'chat_citation_read', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/chat/citation_read', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chat.verify_citations',
    version: '1',
    title: 'Verify message citations',
    description: 'Re-check each citation against the live chunk/document store and flag unresolved anchors.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' } }, required: ['message_id'] },
    outputSchema: { type: 'object', properties: { message_id: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } }, resolved: { type: 'integer' }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/chat/verify_citations' },
    cli: { command: 'microera chat verify-citations', examples: ['microera chat verify-citations --message-id msg_...'] },
    mcp: { toolName: 'chat_verify_citations', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chat/verify_citations', input, ctx);
    },
  });

  // ── P4-03: sessions + messages ────────────────────────────────────────────
  operationRegistry.register({
    id: 'session.create',
    version: '1',
    title: 'Create a chat session',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'integer' } }, scope: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'integer' } }, scope: { type: 'object' }, created_at: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/session/create' },
    cli: { command: 'microera session create', examples: ['microera session create --title "Q3 review" --kb-ids 1 2'] },
    mcp: { toolName: 'session_create', readOnlyHint: false, scopes: ['chat:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/session/create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'session.list',
    version: '1',
    title: 'List chat sessions',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/session/list' },
    cli: { command: 'microera session list', examples: ['microera session list'] },
    mcp: { toolName: 'session_list', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/session/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'session.view',
    version: '1',
    title: 'View a chat session',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'integer' } }, scope: { type: 'object' } } },
    http: { method: 'GET', path: '/api/v2/ops/session/view' },
    cli: { command: 'microera session view', examples: ['microera session view --session-id sess_...'] },
    mcp: { toolName: 'session_view', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/session/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'session.delete',
    version: '1',
    title: 'Delete a chat session',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'string' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/session/delete' },
    cli: { command: 'microera session delete', examples: ['microera session delete --session-id sess_...'] },
    mcp: { toolName: 'session_delete', readOnlyHint: false, scopes: ['chat:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/session/delete', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'message.list',
    version: '1',
    title: 'List session messages',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { session_id: { type: 'string' }, items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/message/list' },
    cli: { command: 'microera message list', examples: ['microera message list --session-id sess_...'] },
    mcp: { toolName: 'message_list', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/message/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'message.view',
    version: '1',
    title: 'View a message',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' } }, required: ['message_id'] },
    outputSchema: { type: 'object', properties: { id: { type: 'string' }, session_id: { type: 'string' }, role: { type: 'string' }, content: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/message/view' },
    cli: { command: 'microera message view', examples: ['microera message view --message-id msg_...'] },
    mcp: { toolName: 'message_view', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/message/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'message.search',
    version: '1',
    title: 'Search messages',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { q: { type: 'string' }, session_id: { type: 'string' } }, required: ['q'] },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/message/search' },
    cli: { command: 'microera message search', examples: ['microera message search "MOF"'] },
    mcp: { toolName: 'message_search', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/message/search', input, ctx);
    },
  });

  // ── P4-04: streaming + cancellation ────────────────────────────────────────
  operationRegistry.register({
    id: 'chat.stream',
    version: '1',
    title: 'Stream a grounded answer',
    description: 'Stream tokens via SSE; the remote transport collects the full answer into a single result.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        kb_ids: { type: 'array', items: { type: 'integer' } },
        session_id: { type: 'string' },
        top_k: { type: 'integer' },
        method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] },
        is_internal: { type: 'boolean' },
      },
      required: ['question'],
    },
    outputSchema: { type: 'object', properties: { answer: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } }, session_id: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/chat/stream' },
    cli: { command: 'microera chat stream', examples: ['microera chat stream "summarize pore size" --method hybrid'] },
    mcp: { toolName: 'chat_stream', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chat/stream', { ...input, stream: false }, ctx);
    },
  });

  operationRegistry.register({
    id: 'chat.cancel',
    version: '1',
    title: 'Cancel a stream',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { cancelled: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/chat/cancel' },
    cli: { command: 'microera chat cancel', examples: ['microera chat cancel --session-id sess_...'] },
    mcp: { toolName: 'chat_cancel', readOnlyHint: false, scopes: ['chat:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chat/cancel', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'session.stop',
    version: '1',
    title: 'Stop a session stream',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { cancelled: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/session/stop' },
    cli: { command: 'microera session stop', examples: ['microera session stop --session-id sess_...'] },
    mcp: { toolName: 'session_stop', readOnlyHint: false, scopes: ['chat:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/session/stop', input, ctx);
    },
  });

  // ── P4-05: session-scoped ask + scope editing ──────────────────────────────
  operationRegistry.register({
    id: 'session.ask',
    version: '1',
    title: 'Ask within a session',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, session_id: { type: 'string' }, top_k: { type: 'integer' }, method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] } }, required: ['question', 'session_id'] },
    outputSchema: { type: 'object', properties: { answer: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } }, session_id: { type: 'string' }, trace: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/session/ask' },
    cli: { command: 'microera session ask', examples: ['microera session ask "what did we cover?" --session-id sess_...'] },
    mcp: { toolName: 'session_ask', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/session/ask', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'chat.scope',
    version: '1',
    title: 'Set chat scope',
    description: 'Update a session scoped KBs and retrieval defaults (top_k / method).',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'integer' } }, top_k: { type: 'integer' }, method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { id: { type: 'string' }, kb_ids: { type: 'array', items: { type: 'integer' } }, scope: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/chat/scope' },
    cli: { command: 'microera chat scope', examples: ['microera chat scope --session-id sess_... --kb-ids 1 --method hybrid'] },
    mcp: { toolName: 'chat_scope', readOnlyHint: false, scopes: ['chat:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/chat/scope', input, ctx);
    },
  });

  // ── P4-06: trace + export ─────────────────────────────────────────────────
  operationRegistry.register({
    id: 'chat.trace',
    version: '1',
    title: 'View message grounding trace',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' } }, required: ['message_id'] },
    outputSchema: { type: 'object', properties: { message_id: { type: 'string' }, session_id: { type: 'string' }, role: { type: 'string' }, trace: { type: 'object' }, citations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/chat/trace' },
    cli: { command: 'microera chat trace', examples: ['microera chat trace --message-id msg_...'] },
    mcp: { toolName: 'chat_trace', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/chat/trace', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'session.export',
    version: '1',
    title: 'Export a session',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
    outputSchema: { type: 'object', properties: { session: { type: 'object' }, messages: { type: 'array', items: { type: 'object' } }, exported_at: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/session/export' },
    cli: { command: 'microera session export', examples: ['microera session export --session-id sess_...'] },
    mcp: { toolName: 'session_export', readOnlyHint: true, scopes: ['chat:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/session/export', input, ctx);
    },
  });

  // ── P5: wiki (W01–W04) + graph ────────────────────────────────────────────
  const wikiSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      title: { type: 'string' },
      summary: { type: 'string' },
      content: { type: 'string' },
      kb_id: { type: 'integer' },
      status: { type: 'string' },
      revision_no: { type: 'integer' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
  };

  operationRegistry.register({
    id: 'wiki.generate',
    version: '1',
    title: 'Generate a wiki page',
    description: 'Synthesize a wiki article from the top chunks of a knowledge base (or explicit document set) and record its grounding sources.',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        question: { type: 'string' },
        kb_id: { type: 'integer' },
        document_ids: { type: 'array', items: { type: 'integer' } },
        top_k: { type: 'integer' },
        method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] },
      },
    },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, title: { type: 'string' }, status: { type: 'string' }, revision_no: { type: 'integer' }, source_count: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/generate' },
    cli: { command: 'microera wiki generate', examples: ['microera wiki generate --title "Zeolites overview" --kb-id 1'] },
    mcp: { toolName: 'wiki_generate', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/generate', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.status',
    version: '1',
    title: 'Wiki generation status',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, status: { type: 'string' }, revision_no: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/status' },
    cli: { command: 'microera wiki status', examples: ['microera wiki status --wiki-id 1'] },
    mcp: { toolName: 'wiki_status', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/status', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.list',
    version: '1',
    title: 'List wiki pages',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' }, kb_id: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: wikiSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/list' },
    cli: { command: 'microera wiki list', examples: ['microera wiki list'] },
    mcp: { toolName: 'wiki_list', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.read',
    version: '1',
    title: 'Read a wiki page',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: wikiSchema,
    http: { method: 'GET', path: '/api/v2/ops/wiki/read' },
    cli: { command: 'microera wiki read', examples: ['microera wiki read --wiki-id 1'] },
    mcp: { toolName: 'wiki_read', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/read', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.search',
    version: '1',
    title: 'Search wiki pages',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { q: { type: 'string' }, page: { type: 'integer' }, page_size: { type: 'integer' } }, required: ['q'] },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: wikiSchema }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/search' },
    cli: { command: 'microera wiki search', examples: ['microera wiki search "zeolite"'] },
    mcp: { toolName: 'wiki_search', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/search', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.sources',
    version: '1',
    title: 'List wiki sources',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, sources: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/sources' },
    cli: { command: 'microera wiki sources', examples: ['microera wiki sources --wiki-id 1'] },
    mcp: { toolName: 'wiki_sources', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/sources', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.citation_read',
    version: '1',
    title: 'Read a wiki citation chunk',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { chunk_id: { type: 'string' } }, required: ['chunk_id'] },
    outputSchema: { type: 'object', properties: { chunk_id: { type: 'string' }, document_id: { type: 'integer' }, title: { type: 'string' }, text: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/citation_read' },
    cli: { command: 'microera wiki citation-read', examples: ['microera wiki citation-read --chunk-id chunk_...'] },
    mcp: { toolName: 'wiki_citation_read', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/citation_read', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.verify',
    version: '1',
    title: 'Verify wiki citations',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, citations: { type: 'array', items: { type: 'object' } }, resolved: { type: 'integer' }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/verify' },
    cli: { command: 'microera wiki verify', examples: ['microera wiki verify --wiki-id 1'] },
    mcp: { toolName: 'wiki_verify', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/verify', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.links',
    version: '1',
    title: 'List wiki links',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, outgoing: { type: 'array', items: { type: 'object' } }, incoming: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/links' },
    cli: { command: 'microera wiki links', examples: ['microera wiki links --wiki-id 1'] },
    mcp: { toolName: 'wiki_links', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/links', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.link',
    version: '1',
    title: 'Link two wiki pages',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { source_wiki_id: { type: 'integer' }, target_wiki_id: { type: 'integer' } }, required: ['source_wiki_id', 'target_wiki_id'] },
    outputSchema: { type: 'object', properties: { source_wiki_id: { type: 'integer' }, target_wiki_id: { type: 'integer' }, created_at: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/link' },
    cli: { command: 'microera wiki link', examples: ['microera wiki link --source-wiki-id 1 --target-wiki-id 2'] },
    mcp: { toolName: 'wiki_link', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/link', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.unlink',
    version: '1',
    title: 'Remove a wiki link',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { source_wiki_id: { type: 'integer' }, target_wiki_id: { type: 'integer' } }, required: ['source_wiki_id', 'target_wiki_id'] },
    outputSchema: { type: 'object', properties: { removed: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/unlink' },
    cli: { command: 'microera wiki unlink', examples: ['microera wiki unlink --source-wiki-id 1 --target-wiki-id 2'] },
    mcp: { toolName: 'wiki_unlink', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/unlink', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.graph',
    version: '1',
    title: 'Wiki graph view',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/graph' },
    cli: { command: 'microera wiki graph', examples: ['microera wiki graph'] },
    mcp: { toolName: 'wiki_graph', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/graph', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'graph.neighbors',
    version: '1',
    title: 'Wiki graph neighbors',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, depth: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, depth: { type: 'integer' }, neighbors: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/graph/neighbors' },
    cli: { command: 'microera graph neighbors', examples: ['microera graph neighbors --wiki-id 1 --depth 2'] },
    mcp: { toolName: 'graph_neighbors', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/graph/neighbors', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'graph.search',
    version: '1',
    title: 'Search wiki graph nodes',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    outputSchema: { type: 'object', properties: { nodes: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/graph/search' },
    cli: { command: 'microera graph search', examples: ['microera graph search "zeolite"'] },
    mcp: { toolName: 'graph_search', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/graph/search', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.create',
    version: '1',
    title: 'Create a wiki page',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, summary: { type: 'string' }, kb_id: { type: 'integer' } }, required: ['title'] },
    outputSchema: wikiSchema,
    http: { method: 'POST', path: '/api/v2/ops/wiki/create' },
    cli: { command: 'microera wiki create', examples: ['microera wiki create --title "My page" --content "# Hi"'] },
    mcp: { toolName: 'wiki_create', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.edit',
    version: '1',
    title: 'Edit a wiki page',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, title: { type: 'string' }, content: { type: 'string' }, summary: { type: 'string' } }, required: ['wiki_id'] },
    outputSchema: wikiSchema,
    http: { method: 'PATCH', path: '/api/v2/ops/wiki/edit' },
    cli: { command: 'microera wiki edit', examples: ['microera wiki edit --wiki-id 1 --content "# Updated"'] },
    mcp: { toolName: 'wiki_edit', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'PATCH', '/api/v2/ops/wiki/edit', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.delete',
    version: '1',
    title: 'Delete a wiki page',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/wiki/delete' },
    cli: { command: 'microera wiki delete', examples: ['microera wiki delete --wiki-id 1'] },
    mcp: { toolName: 'wiki_delete', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/wiki/delete', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.diff',
    version: '1',
    title: 'Diff wiki revisions',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, from_revision_no: { type: 'integer' }, to_revision_no: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, from_revision_no: { type: 'integer' }, to_revision_no: { type: 'integer' }, added_lines: { type: 'integer' }, removed_lines: { type: 'integer' }, changed: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/diff' },
    cli: { command: 'microera wiki diff', examples: ['microera wiki diff --wiki-id 1'] },
    mcp: { toolName: 'wiki_diff', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/diff', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.revert',
    version: '1',
    title: 'Revert a wiki revision',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, revision_no: { type: 'integer' } }, required: ['wiki_id', 'revision_no'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, reverted_from_revision_no: { type: 'integer' }, new_revision_no: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/wiki/revert' },
    cli: { command: 'microera wiki revert', examples: ['microera wiki revert --wiki-id 1 --revision-no 1'] },
    mcp: { toolName: 'wiki_revert', readOnlyHint: false, scopes: ['wiki:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/wiki/revert', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'wiki.revisions',
    version: '1',
    title: 'List wiki revisions',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' } }, required: ['wiki_id'] },
    outputSchema: { type: 'object', properties: { wiki_id: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/wiki/revisions' },
    cli: { command: 'microera wiki revisions', examples: ['microera wiki revisions --wiki-id 1'] },
    mcp: { toolName: 'wiki_revisions', readOnlyHint: true, scopes: ['wiki:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/wiki/revisions', input, ctx);
    },
  });

  // ── P6: agent (A01–A06) + skills + sandbox ───────────────────────────────
  const agentSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      description: { type: 'string' },
      instructions: { type: 'string' },
      model: { type: 'string' },
      tools: { type: 'array', items: { type: 'string' } },
      mcp_servers: { type: 'array', items: { type: 'object' } },
      skills: { type: 'array', items: { type: 'string' } },
      status: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
  };

  operationRegistry.register({
    id: 'agent.create',
    version: '1',
    title: 'Create an agent',
    description: 'Create a configurable agent with instructions, optional model, enabled tools, MCP servers and skills.',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        instructions: { type: 'string' },
        model: { type: 'string' },
        tools: { type: 'array', items: { type: 'string' } },
        mcp_servers: { type: 'array', items: { type: 'object' } },
        skills: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    outputSchema: agentSchema,
    http: { method: 'POST', path: '/api/v2/ops/agent/create' },
    cli: { command: 'microera agent create', examples: ['microera agent create --name "Research" --instructions "Gather evidence"'] },
    mcp: { toolName: 'agent_create', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.list',
    version: '1',
    title: 'List agents',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: agentSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/list' },
    cli: { command: 'microera agent list', examples: ['microera agent list'] },
    mcp: { toolName: 'agent_list', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.view',
    version: '1',
    title: 'View an agent',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' } }, required: ['agent_id'] },
    outputSchema: agentSchema,
    http: { method: 'GET', path: '/api/v2/ops/agent/view' },
    cli: { command: 'microera agent view', examples: ['microera agent view --agent-id 1'] },
    mcp: { toolName: 'agent_view', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.update',
    version: '1',
    title: 'Update an agent',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        instructions: { type: 'string' },
        model: { type: 'string' },
        tools: { type: 'array', items: { type: 'string' } },
        mcp_servers: { type: 'array', items: { type: 'object' } },
        skills: { type: 'array', items: { type: 'string' } },
      },
      required: ['agent_id'],
    },
    outputSchema: agentSchema,
    http: { method: 'PATCH', path: '/api/v2/ops/agent/update' },
    cli: { command: 'microera agent update', examples: ['microera agent update --agent-id 1 --instructions "New prompt"'] },
    mcp: { toolName: 'agent_update', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'PATCH', '/api/v2/ops/agent/update', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.delete',
    version: '1',
    title: 'Delete an agent',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' } }, required: ['agent_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/agent/delete' },
    cli: { command: 'microera agent delete', examples: ['microera agent delete --agent-id 1'] },
    mcp: { toolName: 'agent_delete', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/agent/delete', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.run',
    version: '1',
    title: 'Run an agent',
    description: 'Run the agent against a goal: retrieve context, execute the tool steps, and produce a grounded answer + trace.',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'integer' }, goal: { type: 'string' }, kb_id: { type: 'integer' }, top_k: { type: 'integer' }, method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] } },
      required: ['agent_id', 'goal'],
    },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, agent_id: { type: 'integer' }, status: { type: 'string' }, answer: { type: 'string' }, steps: { type: 'array', items: { type: 'object' } }, trace: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/run' },
    cli: { command: 'microera agent run', examples: ['microera agent run --agent-id 1 --goal "Summarize zeolite catalysis"'] },
    mcp: { toolName: 'agent_run', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/run', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.tools',
    version: '1',
    title: 'List agent tools',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { tools: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/tools' },
    cli: { command: 'microera agent tools', examples: ['microera agent tools', 'microera agent tools --agent-id 1'] },
    mcp: { toolName: 'agent_tools', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/tools', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.tool_call',
    version: '1',
    title: 'Call an agent tool',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, tool: { type: 'string' }, input: { type: 'object' }, run_id: { type: 'string' } }, required: ['agent_id', 'tool'] },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, tool: { type: 'string' }, result: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/tool_call' },
    cli: { command: 'microera agent tool-call', examples: ['microera agent tool-call --agent-id 1 --tool retrieve --input \'{"query":"zeolite"}\''] },
    mcp: { toolName: 'agent_tool_call', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/tool_call', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.tool_result',
    version: '1',
    title: 'Read a tool result',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' }, step_index: { type: 'integer' } }, required: ['run_id'] },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, step_index: { type: 'integer' }, tool: { type: 'string' }, result: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/tool_result' },
    cli: { command: 'microera agent tool-result', examples: ['microera agent tool-result --run-id run_... --step-index 0'] },
    mcp: { toolName: 'agent_tool_result', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/tool_result', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.mcp_list',
    version: '1',
    title: 'List MCP servers',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { servers: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/mcp_list' },
    cli: { command: 'microera agent mcp-list', examples: ['microera agent mcp-list --agent-id 1'] },
    mcp: { toolName: 'agent_mcp_list', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/mcp_list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.mcp_test',
    version: '1',
    title: 'Test an MCP server',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { server: { type: 'string' }, reachable: { type: 'boolean' }, checked_at: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/mcp_test' },
    cli: { command: 'microera agent mcp-test', examples: ['microera agent mcp-test --name my-mcp --url http://localhost:9000'] },
    mcp: { toolName: 'agent_mcp_test', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/mcp_test', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.mcp_call',
    version: '1',
    title: 'Call an MCP tool',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, server: { type: 'string' }, tool: { type: 'string' }, arguments: { type: 'object' } }, required: ['agent_id', 'tool'] },
    outputSchema: { type: 'object', properties: { server: { type: 'string' }, tool: { type: 'string' }, result: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/mcp_call' },
    cli: { command: 'microera agent mcp-call', examples: ['microera agent mcp-call --agent-id 1 --tool retrieve --arguments \'{"query":"zeolite"}\''] },
    mcp: { toolName: 'agent_mcp_call', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/mcp_call', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'skills.list',
    version: '1',
    title: 'List skills',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/skills/list' },
    cli: { command: 'microera skills list', examples: ['microera skills list'] },
    mcp: { toolName: 'skills_list', readOnlyHint: true, scopes: ['skill:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/skills/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'skills.install',
    version: '1',
    title: 'Install a skill',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, manifest: { type: 'object' } }, required: ['name'] },
    outputSchema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, installed: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/skills/install' },
    cli: { command: 'microera skills install', examples: ['microera skills install --name research --manifest \'{"version":"1.0.0"}\''] },
    mcp: { toolName: 'skills_install', readOnlyHint: false, scopes: ['skill:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/skills/install', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'skills.validate',
    version: '1',
    title: 'Validate a skill manifest',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, manifest: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { valid: { type: 'boolean' }, errors: { type: 'array', items: { type: 'string' } } } },
    http: { method: 'POST', path: '/api/v2/ops/skills/validate' },
    cli: { command: 'microera skills validate', examples: ['microera skills validate --name research'] },
    mcp: { toolName: 'skills_validate', readOnlyHint: true, scopes: ['skill:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/skills/validate', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'skills.read',
    version: '1',
    title: 'Read a skill',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    outputSchema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' }, manifest: { type: 'object' }, installed: { type: 'boolean' } } },
    http: { method: 'GET', path: '/api/v2/ops/skills/read' },
    cli: { command: 'microera skills read', examples: ['microera skills read --name research'] },
    mcp: { toolName: 'skills_read', readOnlyHint: true, scopes: ['skill:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/skills/read', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.sandbox_status',
    version: '1',
    title: 'Sandbox status',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { available: { type: 'boolean' }, mode: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/sandbox_status' },
    cli: { command: 'microera agent sandbox-status', examples: ['microera agent sandbox-status'] },
    mcp: { toolName: 'agent_sandbox_status', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/sandbox_status', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.sandbox_run',
    version: '1',
    title: 'Run a sandbox task',
    kind: 'job',
    risk: 'write',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, task: { type: 'string' }, payload: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, task: { type: 'string' }, artifact_id: { type: 'integer' }, result: { type: 'object' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/sandbox_run' },
    cli: { command: 'microera agent sandbox-run', examples: ['microera agent sandbox-run --task count_tokens --payload \'{"text":"hello world"}\''] },
    mcp: { toolName: 'agent_sandbox_run', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/sandbox_run', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.artifact_list',
    version: '1',
    title: 'List sandbox artifacts',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' }, agent_id: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/artifact_list' },
    cli: { command: 'microera agent artifact-list', examples: ['microera agent artifact-list --run-id run_...'] },
    mcp: { toolName: 'agent_artifact_list', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/artifact_list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.status',
    version: '1',
    title: 'Agent status',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' } }, required: ['agent_id'] },
    outputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, status: { type: 'string' }, latest_run: { type: 'object' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/status' },
    cli: { command: 'microera agent status', examples: ['microera agent status --agent-id 1'] },
    mcp: { toolName: 'agent_status', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/status', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.check',
    version: '1',
    title: 'Check agent readiness',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' } }, required: ['agent_id'] },
    outputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, ok: { type: 'boolean' }, checks: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/check' },
    cli: { command: 'microera agent check', examples: ['microera agent check --agent-id 1'] },
    mcp: { toolName: 'agent_check', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/check', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.stop',
    version: '1',
    title: 'Stop an agent run or agent',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, run_id: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { status: { type: 'string' }, run_id: { type: 'string' }, agent_id: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/stop' },
    cli: { command: 'microera agent stop', examples: ['microera agent stop --agent-id 1'] },
    mcp: { toolName: 'agent_stop', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/stop', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.resume',
    version: '1',
    title: 'Resume an agent run',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, agent_id: { type: 'integer' }, status: { type: 'string' }, answer: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/agent/resume' },
    cli: { command: 'microera agent resume', examples: ['microera agent resume --run-id run_...'] },
    mcp: { toolName: 'agent_resume', readOnlyHint: false, scopes: ['agent:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/agent/resume', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'session.agent_ask',
    version: '1',
    title: 'Ask an agent within a session',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { agent_id: { type: 'integer' }, session_id: { type: 'string' }, question: { type: 'string' }, top_k: { type: 'integer' }, method: { type: 'string', enum: ['vector', 'lexical', 'hybrid'] } }, required: ['agent_id', 'question'] },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, answer: { type: 'string' }, session_id: { type: 'string' }, citations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/session/agent_ask' },
    cli: { command: 'microera session agent-ask', examples: ['microera session agent-ask --agent-id 1 --session-id sess_... --question "What is zeolite?"'] },
    mcp: { toolName: 'session_agent_ask', readOnlyHint: false, scopes: ['agent:write', 'chat:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/session/agent_ask', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'agent.trace',
    version: '1',
    title: 'Agent run trace',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
    outputSchema: { type: 'object', properties: { run_id: { type: 'string' }, agent_id: { type: 'integer' }, goal: { type: 'string' }, status: { type: 'string' }, steps: { type: 'array', items: { type: 'object' } }, trace: { type: 'object' } } },
    http: { method: 'GET', path: '/api/v2/ops/agent/trace' },
    cli: { command: 'microera agent trace', examples: ['microera agent trace --run-id run_...'] },
    mcp: { toolName: 'agent_trace', readOnlyHint: true, scopes: ['agent:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/agent/trace', input, ctx);
    },
  });

  // ── P7: datasource (D01/D02/D04) ──────────────────────────────────────────
  const datasourceSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      connector: { type: 'string' },
      config: { type: 'object' },
      schedule: { type: 'string' },
      status: { type: 'string' },
      cursor: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
    required: ['id', 'name', 'connector'],
  };

  operationRegistry.register({
    id: 'datasource.types',
    version: '1',
    title: 'List connector types',
    description: 'Enumerate the registered connectors (name/label/version) that a datasource can bind to.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { connectors: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/datasource/types' },
    cli: { command: 'microera datasource types', examples: ['microera datasource types'] },
    mcp: { toolName: 'datasource_types', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/datasource/types', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.list',
    version: '1',
    title: 'List datasources',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: datasourceSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/datasource/list' },
    cli: { command: 'microera datasource list', examples: ['microera datasource list'] },
    mcp: { toolName: 'datasource_list', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/datasource/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.create',
    version: '1',
    title: 'Create a datasource',
    description: 'Bind a connector to a named, saved configuration.',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        connector: { type: 'string' },
        config: { type: 'object' },
        schedule: { type: 'string' },
      },
      required: ['name', 'connector'],
    },
    outputSchema: datasourceSchema,
    http: { method: 'POST', path: '/api/v2/ops/datasource/create' },
    cli: { command: 'microera datasource create', examples: ['microera datasource create --name "Local" --connector local'] },
    mcp: { toolName: 'datasource_create', readOnlyHint: false, scopes: ['datasource:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.view',
    version: '1',
    title: 'View a datasource',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: datasourceSchema,
    http: { method: 'GET', path: '/api/v2/ops/datasource/view' },
    cli: { command: 'microera datasource view', examples: ['microera datasource view --datasource-id 1'] },
    mcp: { toolName: 'datasource_view', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/datasource/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.connect',
    version: '1',
    title: 'Test a datasource connection',
    description: 'Run the bound connector connect() to verify it is reachable/authenticated.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, connector: { type: 'string' }, connected: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/datasource/connect' },
    cli: { command: 'microera datasource connect', examples: ['microera datasource connect --datasource-id 1'] },
    mcp: { toolName: 'datasource_connect', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/connect', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.preview',
    version: '1',
    title: 'Preview datasource documents',
    description: 'List the connector documents without importing them.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, projectId: { type: 'string' }, keyword: { type: 'string' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, connector: { type: 'string' }, total: { type: 'integer' }, documents: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/datasource/preview' },
    cli: { command: 'microera datasource preview', examples: ['microera datasource preview --datasource-id 1'] },
    mcp: { toolName: 'datasource_preview', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/preview', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.sync',
    version: '1',
    title: 'Sync a datasource',
    description: 'Fetch connector documents and run them through the import pipeline (chunk → embed → vector), advancing the cursor.',
    kind: 'job',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { datasource_id: { type: 'integer' }, since: { type: 'string' }, dryRun: { type: 'boolean' }, projectId: { type: 'string' }, keyword: { type: 'string' } },
      required: ['datasource_id'],
    },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, log_id: { type: 'string' }, total: { type: 'integer' }, created: { type: 'integer' }, updated: { type: 'integer' }, skipped: { type: 'integer' }, failed: { type: 'integer' }, cursor: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/datasource/sync' },
    cli: { command: 'microera datasource sync', examples: ['microera datasource sync --datasource-id 1'] },
    mcp: { toolName: 'datasource_sync', readOnlyHint: false, scopes: ['datasource:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/sync', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.changes',
    version: '1',
    title: 'List datasource changes since cursor',
    description: 'List connector documents updated after a given (or the saved) cursor.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, since: { type: 'string' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, since: { type: 'string' }, changed: { type: 'integer' }, documents: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/datasource/changes' },
    cli: { command: 'microera datasource changes', examples: ['microera datasource changes --datasource-id 1'] },
    mcp: { toolName: 'datasource_changes', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/datasource/changes', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.cursor',
    version: '1',
    title: 'Read a datasource cursor',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, cursor: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/datasource/cursor' },
    cli: { command: 'microera datasource cursor', examples: ['microera datasource cursor --datasource-id 1'] },
    mcp: { toolName: 'datasource_cursor', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/datasource/cursor', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.logs',
    version: '1',
    title: 'List datasource sync logs',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, page: { type: 'integer' }, page_size: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/datasource/logs' },
    cli: { command: 'microera datasource logs', examples: ['microera datasource logs --datasource-id 1'] },
    mcp: { toolName: 'datasource_logs', readOnlyHint: true, scopes: ['datasource:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/datasource/logs', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.schedule',
    version: '1',
    title: 'Set a datasource schedule',
    description: 'Set the cron schedule string for automatic sync.',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, schedule: { type: 'string' } }, required: ['datasource_id', 'schedule'] },
    outputSchema: datasourceSchema,
    http: { method: 'POST', path: '/api/v2/ops/datasource/schedule' },
    cli: { command: 'microera datasource schedule', examples: ['microera datasource schedule --datasource-id 1 --schedule "0 3 * * *"'] },
    mcp: { toolName: 'datasource_schedule', readOnlyHint: false, scopes: ['datasource:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/schedule', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.pause',
    version: '1',
    title: 'Pause a datasource',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, status: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/datasource/pause' },
    cli: { command: 'microera datasource pause', examples: ['microera datasource pause --datasource-id 1'] },
    mcp: { toolName: 'datasource_pause', readOnlyHint: false, scopes: ['datasource:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/pause', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.resume',
    version: '1',
    title: 'Resume a datasource',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' }, status: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/datasource/resume' },
    cli: { command: 'microera datasource resume', examples: ['microera datasource resume --datasource-id 1'] },
    mcp: { toolName: 'datasource_resume', readOnlyHint: false, scopes: ['datasource:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/datasource/resume', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'datasource.delete',
    version: '1',
    title: 'Delete a datasource',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { datasource_id: { type: 'integer' } }, required: ['datasource_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/datasource/delete' },
    cli: { command: 'microera datasource delete', examples: ['microera datasource delete --datasource-id 1'] },
    mcp: { toolName: 'datasource_delete', readOnlyHint: false, scopes: ['datasource:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/datasource/delete', input, ctx);
    },
  });

  // ── P8: model registry (M01/M03) ───────────────────────────────────────
  const modelSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      kind: { type: 'string', enum: ['llm', 'embedding', 'rerank'] },
      provider: { type: 'string' },
      model_name: { type: 'string' },
      base_url: { type: 'string' },
      config: { type: 'object' },
      is_default: { type: 'boolean' },
      status: { type: 'string' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' },
    },
    required: ['id', 'name', 'kind', 'model_name'],
  };

  operationRegistry.register({
    id: 'model.list',
    version: '1',
    title: 'List models',
    description: 'List the registered LLM/embedding/rerank models, optionally filtered by kind.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['llm', 'embedding', 'rerank'] }, page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: modelSchema }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/model/list' },
    cli: { command: 'microera model list', examples: ['microera model list', 'microera model list --kind llm'] },
    mcp: { toolName: 'model_list', readOnlyHint: true, scopes: ['model:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/model/list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.view',
    version: '1',
    title: 'View a model',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { model_id: { type: 'integer' } }, required: ['model_id'] },
    outputSchema: modelSchema,
    http: { method: 'GET', path: '/api/v2/ops/model/view' },
    cli: { command: 'microera model view', examples: ['microera model view --model-id 1'] },
    mcp: { toolName: 'model_view', readOnlyHint: true, scopes: ['model:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/model/view', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.create',
    version: '1',
    title: 'Create a model',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        kind: { type: 'string', enum: ['llm', 'embedding', 'rerank'] },
        provider: { type: 'string' },
        model_name: { type: 'string' },
        base_url: { type: 'string' },
        config: { type: 'object' },
        is_default: { type: 'boolean' },
      },
      required: ['name', 'kind', 'model_name'],
    },
    outputSchema: modelSchema,
    http: { method: 'POST', path: '/api/v2/ops/model/create' },
    cli: { command: 'microera model create', examples: ['microera model create --name "Local LLM" --kind llm --model-name qwen2.5:7b'] },
    mcp: { toolName: 'model_create', readOnlyHint: false, scopes: ['model:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/model/create', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.update',
    version: '1',
    title: 'Update a model',
    kind: 'mutation',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { model_id: { type: 'integer' }, name: { type: 'string' }, provider: { type: 'string' }, model_name: { type: 'string' }, base_url: { type: 'string' }, config: { type: 'object' }, status: { type: 'string' } },
      required: ['model_id'],
    },
    outputSchema: modelSchema,
    http: { method: 'PATCH', path: '/api/v2/ops/model/update' },
    cli: { command: 'microera model update', examples: ['microera model update --model-id 1 --name "Renamed"'] },
    mcp: { toolName: 'model_update', readOnlyHint: false, scopes: ['model:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'PATCH', '/api/v2/ops/model/update', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.delete',
    version: '1',
    title: 'Delete a model',
    kind: 'mutation',
    risk: 'destructive',
    inputSchema: { type: 'object', properties: { model_id: { type: 'integer' } }, required: ['model_id'] },
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'integer' } } },
    http: { method: 'DELETE', path: '/api/v2/ops/model/delete' },
    cli: { command: 'microera model delete', examples: ['microera model delete --model-id 1'] },
    mcp: { toolName: 'model_delete', readOnlyHint: false, scopes: ['model:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'DELETE', '/api/v2/ops/model/delete', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.test',
    version: '1',
    title: 'Test a model',
    description: 'Probe a model provider and report reachability without failing the request.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: { model_id: { type: 'integer' } }, required: ['model_id'] },
    outputSchema: { type: 'object', properties: { model_id: { type: 'integer' }, reachable: { type: 'boolean' }, latency_ms: { type: 'number' }, detail: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/model/test' },
    cli: { command: 'microera model test', examples: ['microera model test --model-id 1'] },
    mcp: { toolName: 'model_test', readOnlyHint: true, scopes: ['model:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/model/test', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.set_default',
    version: '1',
    title: 'Set the default model for a kind',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { model_id: { type: 'integer' } }, required: ['model_id'] },
    outputSchema: modelSchema,
    http: { method: 'POST', path: '/api/v2/ops/model/set_default' },
    cli: { command: 'microera model set-default', examples: ['microera model set-default --model-id 1'] },
    mcp: { toolName: 'model_set_default', readOnlyHint: false, scopes: ['model:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/model/set_default', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.rerank_list',
    version: '1',
    title: 'List rerank-capable models',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { providers: { type: 'array', items: { type: 'object' } }, models: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/model/rerank_list' },
    cli: { command: 'microera model rerank-list', examples: ['microera model rerank-list'] },
    mcp: { toolName: 'model_rerank_list', readOnlyHint: true, scopes: ['model:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/model/rerank_list', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'model.rerank_test',
    version: '1',
    title: 'Test reranking',
    description: 'Score candidate documents against a query with the rerank adapter.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, documents: { type: 'array', items: { type: 'object' } }, model_id: { type: 'integer' }, top_k: { type: 'integer' } },
      required: ['query', 'documents'],
    },
    outputSchema: { type: 'object', properties: { query: { type: 'string' }, provider: { type: 'string' }, fallback: { type: 'boolean' }, items: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'POST', path: '/api/v2/ops/model/rerank_test' },
    cli: { command: 'microera model rerank-test', examples: ['microera model rerank-test --query "q" --documents \'[{"text":"a"}]\''] },
    mcp: { toolName: 'model_rerank_test', readOnlyHint: true, scopes: ['model:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/model/rerank_test', input, ctx);
    },
  });

  // ── P8: generic job dashboard (O01) over the durable queue ─────────────
  operationRegistry.register({
    id: 'job.wait',
    version: '1',
    title: 'Wait for a job',
    description: 'Poll a durable job until it reaches a terminal state or times out.',
    kind: 'job',
    risk: 'read',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, timeout_ms: { type: 'integer' }, interval_ms: { type: 'integer' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' }, finished: { type: 'boolean' }, timed_out: { type: 'boolean' } } },
    http: { method: 'GET', path: '/api/v2/ops/job/wait' },
    cli: { command: 'microera job wait', examples: ['microera job wait --job-id parse_x'] },
    mcp: { toolName: 'job_wait', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/job/wait', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.cancel',
    version: '1',
    title: 'Cancel a job',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/job/cancel' },
    cli: { command: 'microera job cancel', examples: ['microera job cancel --job-id parse_x'] },
    mcp: { toolName: 'job_cancel', readOnlyHint: false, scopes: ['job:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/job/cancel', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.retry',
    version: '1',
    title: 'Retry a job',
    description: 'Requeue a failed or cancelled job back to pending.',
    kind: 'mutation',
    risk: 'write',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' } } },
    http: { method: 'POST', path: '/api/v2/ops/job/retry' },
    cli: { command: 'microera job retry', examples: ['microera job retry --job-id parse_x'] },
    mcp: { toolName: 'job_retry', readOnlyHint: false, scopes: ['job:write'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/job/retry', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.events',
    version: '1',
    title: 'List job events',
    description: 'Return a job lifecycle timeline (enqueued/started/finished) derived from the job row.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/job/events' },
    cli: { command: 'microera job events', examples: ['microera job events --job-id parse_x'] },
    mcp: { toolName: 'job_events', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/job/events', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'job.artifacts',
    version: '1',
    title: 'List job artifacts',
    description: 'Return the real outputs a job produced (e.g. its parsed document).',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
    outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/job/artifacts' },
    cli: { command: 'microera job artifacts', examples: ['microera job artifacts --job-id parse_x'] },
    mcp: { toolName: 'job_artifacts', readOnlyHint: true, scopes: ['job:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/job/artifacts', input, ctx);
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

  // ── P9 X01: api.* introspection ─────────────────────────────────────────
  operationRegistry.register({
    id: 'api.operations',
    version: '1',
    title: 'List API operations',
    description: 'Enumerate every registered operation with its REST/CLI/MCP bindings.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/api/operations' },
    cli: { command: 'microera api operations', examples: ['microera api operations'] },
    mcp: { toolName: 'api_operations', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/api/operations', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'api.schema',
    version: '1',
    title: 'Show the operation schema',
    description: 'Return the full operation manifest, or one operation contract when operation_id is given.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { operation_id: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { operationRegistryVersion: { type: 'string' }, operations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/api/schema' },
    cli: { command: 'microera api schema', examples: ['microera api schema', 'microera api schema --operation-id kb.create'] },
    mcp: { toolName: 'api_schema', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/api/schema', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'api.version',
    version: '1',
    title: 'Show API versions',
    description: 'Report the running API/CLI/MCP/registry versions.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { api_version: { type: 'string' }, cli_version: { type: 'string' }, mcp_protocol_version: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/api/version' },
    cli: { command: 'microera api version', examples: ['microera api version'] },
    mcp: { toolName: 'api_version', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/api/version', input, ctx);
    },
  });

  // ── P9 X02: mcp.* introspection ─────────────────────────────────────────
  operationRegistry.register({
    id: 'mcp.tools',
    version: '1',
    title: 'List MCP tools',
    description: 'Enumerate the MCP tools the host exposes.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { tools: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/mcp/tools' },
    cli: { command: 'microera mcp tools', examples: ['microera mcp tools'] },
    mcp: { toolName: 'mcp_tools', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/mcp/tools', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'mcp.resources',
    version: '1',
    title: 'List MCP resources',
    description: 'Enumerate the MCP resources the host exposes.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { resources: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/mcp/resources' },
    cli: { command: 'microera mcp resources', examples: ['microera mcp resources'] },
    mcp: { toolName: 'mcp_resources', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/mcp/resources', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'mcp.prompts',
    version: '1',
    title: 'List MCP prompts',
    description: 'Enumerate the MCP prompts the host exposes.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { prompts: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/mcp/prompts' },
    cli: { command: 'microera mcp prompts', examples: ['microera mcp prompts'] },
    mcp: { toolName: 'mcp_prompts', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/mcp/prompts', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'mcp.health',
    version: '1',
    title: 'MCP health',
    description: 'Report MCP host liveness: name, version, and tool/resource/prompt counts.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' }, name: { type: 'string' }, tools: { type: 'integer' } } },
    http: { method: 'GET', path: '/api/v2/ops/mcp/health' },
    cli: { command: 'microera mcp health', examples: ['microera mcp health'] },
    mcp: { toolName: 'mcp_health', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/mcp/health', input, ctx);
    },
  });

  // ── P9 X03: cli.* introspection ─────────────────────────────────────────
  operationRegistry.register({
    id: 'cli.commands',
    version: '1',
    title: 'List CLI commands',
    description: 'Enumerate every CLI command and the operation it dispatches to.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { commands: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } } },
    http: { method: 'POST', path: '/api/v2/ops/cli/commands' },
    cli: { command: 'microera cli commands', examples: ['microera cli commands'] },
    mcp: { toolName: 'cli_commands', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/cli/commands', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'cli.version',
    version: '1',
    title: 'Show CLI version',
    description: 'Report the CLI + API + MCP protocol versions.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { version: { type: 'string' }, api_version: { type: 'string' }, mcp_protocol_version: { type: 'string' } } },
    http: { method: 'GET', path: '/api/v2/ops/cli/version' },
    cli: { command: 'microera cli version', examples: ['microera cli version'] },
    mcp: { toolName: 'cli_version', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/cli/version', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'cli.doctor',
    version: '1',
    title: 'Run CLI diagnostics',
    description: 'Report database reachability and registry integrity.',
    kind: 'mutation',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { server: { type: 'string' }, database: { type: 'string' }, registry_valid: { type: 'boolean' } } },
    http: { method: 'POST', path: '/api/v2/ops/cli/doctor' },
    cli: { command: 'microera cli doctor', examples: ['microera cli doctor'] },
    mcp: { toolName: 'cli_doctor', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'POST', '/api/v2/ops/cli/doctor', input, ctx);
    },
  });

  operationRegistry.register({
    id: 'cli.schema',
    version: '1',
    title: 'Show the CLI schema',
    description: 'Return the machine-readable operation manifest used by `microera schema`.',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { operationRegistryVersion: { type: 'string' }, operations: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/cli/schema' },
    cli: { command: 'microera cli schema', examples: ['microera cli schema'] },
    mcp: { toolName: 'cli_schema', readOnlyHint: true, scopes: ['meta:read'] },
    transport: 'remote',
    async handler(input: any, ctx: OperationContext) {
      return callV2(api, 'GET', '/api/v2/ops/cli/schema', input, ctx);
    },
  });
}
