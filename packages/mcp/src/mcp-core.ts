// MCP core — builds tools/resources/prompts from the Operation Registry and
// routes tool calls to the same handlers the CLI uses (single business truth).
import { operationRegistry } from '../../operation-registry/src/registry.js';
import { ApiClient } from '../../operation-registry/src/http-client.js';
import { ok, fail, newTraceId } from '../../contracts/src/wire.js';
import type { OperationContext } from '../../contracts/src/types.js';

export const MCP_PROTOCOL_VERSION = '2025-03-26';

export function serverInfo() {
  return { name: 'microera', version: '0.1.0' };
}

export function listTools() {
  return operationRegistry
    .list()
    .filter((d) => d.transport !== 'local')
    .map((d) => ({
      name: d.mcp.toolName,
      description: d.description ?? d.title,
      inputSchema: d.inputSchema,
      annotations: { readOnlyHint: d.mcp.readOnlyHint, destructiveHint: d.risk === 'destructive' },
    }));
}

export function listResources() {
  return [
    { uri: 'microera://schema/operations', name: 'Operation registry manifest', mimeType: 'application/json' },
    { uri: 'microera://kb/{id}', name: 'Knowledge base', mimeType: 'application/json' },
    { uri: 'microera://doc/{id}/revision/{n}', name: 'Document revision', mimeType: 'text/markdown' },
    { uri: 'microera://chunk/{id}', name: 'Document chunk', mimeType: 'text/markdown' },
    { uri: 'microera://wiki/{id}/{slug}', name: 'Wiki page', mimeType: 'text/markdown' },
    { uri: 'microera://job/{id}', name: 'Job status', mimeType: 'application/json' },
  ];
}

export function listPrompts() {
  const arg = (name: string, description: string) => ({ name, description, required: true });
  return [
    { name: 'research-grounded-answer', description: 'Answer a research question grounded in cited documents.', arguments: [arg('question', 'The question to answer'), arg('kb_ids', 'Knowledge base scope')] },
    { name: 'compare-papers', description: 'Compare two or more papers on a shared axis.', arguments: [arg('document_ids', 'Documents to compare')] },
    { name: 'synthesize-wiki', description: 'Synthesize wiki sections from source references.', arguments: [arg('topic', 'Topic to synthesize')] },
    { name: 'audit-citations', description: 'Audit the citations backing a generated answer.', arguments: [arg('answer', 'Answer text to audit')] },
    { name: 'explain-material-property', description: 'Explain a material property from grounded sources.', arguments: [arg('property', 'Property to explain')] },
  ];
}

export function readResource(uri: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  if (uri === 'microera://schema/operations') {
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(operationRegistry.toManifest(), null, 2) }] };
  }
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ uri, note: 'dynamic resource content lands in a later phase' }, null, 2) }] };
}

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export async function callTool(name: string, args: unknown, api: ApiClient): Promise<ToolCallResult> {
  const def = operationRegistry.list().find((d) => d.mcp.toolName === name);
  if (!def) {
    return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { type: 'resource.not_found', code: 'NOT_FOUND', message: `Unknown tool: ${name}` } }) }], isError: true };
  }
  const ctx: OperationContext = { requestId: newTraceId(), traceId: newTraceId(), dryRun: false };
  if (!def.handler) {
    return {
      content: [{ type: 'text', text: JSON.stringify(fail(def.id, 'not_implemented', `Tool "${name}" is declared but its handler lands in a later phase.`, ctx.traceId)) }],
      isError: true,
    };
  }
  try {
    const data = await def.handler(args ?? {}, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(ok(def.id, data, ctx.traceId)) }], isError: false };
  } catch (err: any) {
    const kind = err?.status === 401 ? 'unauthorized' : err?.status === 404 ? 'resource_not_found' : 'unavailable';
    return { content: [{ type: 'text', text: JSON.stringify(fail(def.id, kind as any, err?.message ?? String(err), ctx.traceId)) }], isError: true };
  }
}
