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
