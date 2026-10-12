#!/usr/bin/env node
// microera CLI — thin client of the MicroEra Core Service.
// Global flags: --format json|ndjson|text, --profile, --timeout, --trace,
//               --dry-run, --yes, --idempotency-key.
// Wire contract: success → stdout {"ok":true,...}; error → stderr {"ok":false,...}.
import { ApiClient, resolveBaseUrl, resolveToken } from '../../packages/operation-registry/src/http-client.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ensureOperationsRegistered } from '../../packages/operation-registry/src/operations.js';
import { ok, fail, newTraceId, EXIT, ErrorKind } from '../../packages/contracts/src/wire.js';
import type { OperationContext } from '../../packages/contracts/src/types.js';
import { parseArgs, findOperation, buildInput } from './args.js';

const VERSION = '0.1.0';

function printWire(envelope: unknown, format: 'json' | 'ndjson' | 'text'): void {
  if (format === 'text') {
    // Minimal human rendering of the envelope.
    const e = envelope as any;
    if (e.ok) console.log(JSON.stringify(e.data, null, 2));
    else console.error(`[${e.error.code}] ${e.error.message}${e.error.hint ? `\nHint: ${e.error.hint}` : ''}`);
    return;
  }
  console.log(JSON.stringify(envelope));
}

/** Build a shared OperationContext from CLI flags. */
function makeContext(opId: string, parsed: { dryRun: boolean; idempotencyKey?: string }): OperationContext {
  return {
    requestId: newTraceId(),
    traceId: newTraceId(),
    dryRun: parsed.dryRun,
    idempotencyKey: parsed.idempotencyKey,
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  const traceId = newTraceId();

  // One shared API client + registry for the whole process.
  const api = new ApiClient({ baseUrl: resolveBaseUrl(), token: resolveToken(), timeoutMs: parsed.timeoutMs });
  ensureOperationsRegistered(api);

  // Top-level commands (no operation binding)
  const [cmd0] = parsed.tokens;

  if (!cmd0 || parsed.help) {
    printWire(fail('cli', 'validation_failed', 'Usage: microera <command> [args] (see microera schema)', traceId), parsed.format);
    return EXIT.USAGE;
  }

  if (cmd0 === 'version') {
    printWire(ok('cli.version', { version: VERSION, apiVersion: '0.2.0', mcpProtocolVersion: '2025-03-26', cliVersion: VERSION, supportedTransports: ['stdio', 'http'] }, traceId), parsed.format);
    return EXIT.OK;
  }

  if (cmd0 === 'schema') {
    printWire(ok('cli.schema', operationRegistry.toManifest(), traceId), parsed.format);
    return EXIT.OK;
  }

  if (cmd0 === 'doctor') {
    try {
      const health = await api.request<any>('GET', '/api/pipeline/health');
      printWire(ok('cli.doctor', {
        server: 'connected',
        ollama: health?.pipeline?.ollama ?? 'unknown',
        chatModel: health?.pipeline?.chatModel ?? 'unknown',
        embeddingModel: health?.pipeline?.embeddingModel ?? 'unknown',
        vectorStore: health?.pipeline?.vectorStore ?? 'pgvector',
      }, traceId), parsed.format);
      return EXIT.OK;
    } catch (err: any) {
      printWire(fail('cli.doctor', 'unavailable', `Server unreachable at ${resolveBaseUrl()}: ${err.message}`, traceId, 'Start the API with `npm run server:dev`'), parsed.format);
      return EXIT.UNAVAILABLE;
    }
  }

  // `mcp serve` is handled by the MCP host (stdio/HTTP) — delegated entry.
  // Other `mcp *` verbs (tools/resources/prompts/health) dispatch as ops below.
  if (cmd0 === 'mcp' && parsed.tokens[1] === 'serve') {
    const { runMcpServe } = await import('../../packages/mcp/src/index.js');
    return runMcpServe(parsed.tokens.slice(1));
  }

  // Operation dispatch
  const found = findOperation(parsed.tokens);
  if (!found) {
    printWire(fail('cli', 'resource_not_found', `Unknown command: microera ${parsed.tokens.join(' ')}`, traceId, 'Run `microera schema` to list commands'), parsed.format);
    return EXIT.NOT_FOUND;
  }

  const { def, consumed } = found;
  const opArgs = parsed.tokens.slice(consumed);
  let input: Record<string, unknown>;
  try {
    input = buildInput(def, opArgs, parsed.dryRun);
  } catch (err: any) {
    printWire(fail(def.id, 'validation_failed', `Invalid arguments: ${err?.message ?? String(err)}`, traceId, 'See `microera schema` for the input shape'), parsed.format);
    return EXIT.USAGE;
  }

  if (!def.handler) {
    printWire(fail(def.id, 'not_implemented', `Operation "${def.id}" is a declared contract but its handler lands in a later phase.`, traceId, `Planned route: ${def.http?.method} ${def.http?.path}`), parsed.format);
    return EXIT.NOT_FOUND;
  }

  try {
    const data = await def.handler(input, makeContext(def.id, parsed));
    printWire(ok(def.id, data, traceId), parsed.format);
    return EXIT.OK;
  } catch (err: any) {
    const kind = err?.status === 401 ? 'unauthorized' : err?.status === 404 ? 'resource_not_found' : 'unavailable';
    printWire(fail(def.id, kind as any, err?.message ?? String(err), traceId, err?.status ? `HTTP ${err.status}` : undefined), parsed.format);
    return ErrorKind[kind as keyof typeof ErrorKind]?.exit ?? EXIT.UNCLASSIFIED;
  }
}

main()
  .then((code) => { process.exit(code); })
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: { type: 'internal.error', code: 'INTERNAL', message: String(err), exit_code: EXIT.UNCLASSIFIED, trace_id: newTraceId() } }));
    process.exit(EXIT.UNCLASSIFIED);
  });
