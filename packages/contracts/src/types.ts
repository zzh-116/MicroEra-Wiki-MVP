// MiqroEra typed contracts — the single source of truth for operation I/O.
// These are plain TypeScript types (no runtime validation library) so the
// package stays dependency-free. JSON Schemas are authored alongside each
// OperationDef in the registry.
export type OperationKind = 'query' | 'mutation' | 'job';
export type Risk = 'read' | 'write' | 'destructive';
export type StreamMode = 'none' | 'sse' | 'ndjson' | 'job';

export interface Principal {
  userId?: number;
  username?: string;
  role?: string;
  serviceId?: string;
  scopes: string[];
}

/** Per-invocation context supplied by the transport boundary. The `principal`
 *  must come from a trusted server-side session — never from a client payload
 *  that merely claims to be admin. */
export interface OperationContext {
  requestId: string;
  traceId: string;
  principal?: Principal;
  signal?: AbortSignal;
  dryRun: boolean;
  confirmationToken?: string;
  idempotencyKey?: string;
}

/** Minimal JSON Schema (2020-12) subset used for `microera schema` and MCP
 *  `inputSchema` output. Kept as a plain object so no codegen is required. */
export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer' | 'null';
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: Array<string | number>;
  additionalProperties?: boolean;
}

/** A single domain operation: the stable business truth that REST, CLI and MCP
 *  all thin onto. Same input → same business output across all three
 *  transports; only transport-level `meta` may differ. */
export interface OperationDef<I = unknown, O = unknown> {
  id: string;                 // stable, e.g. 'kb.create', 'search.hybrid'
  version: string;
  title: string;
  description?: string;
  kind: OperationKind;
  risk: Risk;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  http?: { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string };
  cli: { command: string; examples: string[] };
  mcp: { toolName: string; readOnlyHint: boolean; scopes: string[]; resourceUris?: string[] };
  streamMode?: StreamMode;
  supportsDryRun?: boolean;
  supportsIdempotency?: boolean;
  /** 'remote' = business op exposed over HTTP/MCP; 'local' = config/profile
   *  only, not exposed as a business MCP tool. */
  transport?: 'remote' | 'local';
  handler?: (input: I, ctx: OperationContext) => Promise<O>;
}

export interface CitationAnchor {
  sourceId: string;
  documentId: string;
  revisionId: string;
  chunkId: string;
  page?: number;
  startOffset?: number;
  endOffset?: number;
  url?: string;
  contentHash: string;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  revisionId: string;
  text: string;
  citation: CitationAnchor;
  scores: { lexical?: number; vector?: number; rrf: number; reranker?: number };
}

export interface JobState {
  id: string;
  kind: 'import' | 'reindex' | 'wiki_ingest' | 'sync' | 'agent_run' | 'evaluation';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  stage?: string;
  progress?: number;
  attempt: number;
  maxAttempts: number;
  traceId: string;
  error?: { code: string; message: string };
}
