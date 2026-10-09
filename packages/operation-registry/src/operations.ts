// Vertical-slice operations. The first half are wired to the existing REST
// endpoints (search/chat/jobs); the domain operations that arrive in P1/P2
// (kb.create, doc.upload, …) are registered as contracts so they are already
// discoverable via `microera schema` and MCP `tools/list`, but their handlers
// are intentionally absent until their phase lands.
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

export function registerOperations(api: ApiClient): void {
  // ── P1: knowledge base (contract only for P0) ─────────────────────────
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
        visibility: { type: 'string', enum: ['public', 'internal'] },
      },
      required: ['name'],
    },
    outputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' } }, required: ['id', 'name', 'slug'] },
    http: { method: 'POST', path: '/api/v2/ops/kb/create' },
    cli: { command: 'microera kb create', examples: ['microera kb create --name "Materials" --visibility internal'] },
    mcp: { toolName: 'kb_create', readOnlyHint: false, scopes: ['kb:write'] },
    transport: 'remote',
  });

  operationRegistry.register({
    id: 'kb.list',
    version: '1',
    title: 'List knowledge bases',
    kind: 'query',
    risk: 'read',
    inputSchema: { type: 'object', properties: { page: { type: 'integer' }, page_size: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } } } },
    http: { method: 'GET', path: '/api/v2/ops/kb/list' },
    cli: { command: 'microera kb list', examples: ['microera kb list'] },
    mcp: { toolName: 'kb_list', readOnlyHint: true, scopes: ['kb:read'] },
    transport: 'remote',
  });

  // ── P2: document upload (contract only for P0) ────────────────────────
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

  // ── P3: search (wired to existing /api/search) ────────────────────────
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

  // ── P4: chat (wired to existing /api/ai/chat) ─────────────────────────
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

  // ── P8: jobs (wired to existing /api/pipeline/jobs) ───────────────────
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
