#!/usr/bin/env node
// microera CLI — thin client of the MicroEra Core Service.
// Global flags: --format json|ndjson|text, --profile, --timeout, --trace,
//               --dry-run, --yes, --idempotency-key.
// Wire contract: success → stdout {"ok":true,...}; error → stderr {"ok":false,...}.
import { ApiClient, resolveBaseUrl, resolveToken } from '../../packages/operation-registry/src/http-client.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ensureOperationsRegistered } from '../../packages/operation-registry/src/operations.js';
import { ok, fail, newTraceId, EXIT, ErrorKind } from '../../packages/contracts/src/wire.js';
import type { OperationContext, OperationDef } from '../../packages/contracts/src/types.js';

const VERSION = '0.1.0';

interface ParsedArgs {
  format: 'json' | 'ndjson' | 'text';
  command: string[];
  flags: Record<string, string | boolean>;
  dryRun: boolean;
  yes: boolean;
  timeoutMs: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    format: 'json',
    command: [],
    flags: {},
    dryRun: false,
    yes: false,
    timeoutMs: 30000,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--format' && argv[i + 1]) { parsed.format = argv[++i] as ParsedArgs['format']; continue; }
    if (arg === '--timeout' && argv[i + 1]) { parsed.timeoutMs = Number(argv[++i]) || 30000; continue; }
    if (arg === '--dry-run') { parsed.dryRun = true; continue; }
    if (arg === '--yes' || arg === '-y') { parsed.yes = true; continue; }
    if (arg === '--profile' && argv[i + 1]) { argv[++i]; continue; } // accepted, no-op for P0
    if (arg === '--trace' && argv[i + 1]) { argv[++i]; continue; }
    if (arg === '--idempotency-key' && argv[i + 1]) { parsed.flags.idempotencyKey = argv[++i]; continue; }
    if (arg === '--help' || arg === '-h') { parsed.flags.help = true; continue; }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      const val = eq >= 0 ? arg.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
      parsed.flags[key] = val;
      continue;
    }
    positionals.push(arg);
  }
  parsed.command = positionals;
  return parsed;
}

function printWire(envelope: unknown, format: ParsedArgs['format']): void {
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
function makeContext(opId: string, parsed: ParsedArgs): OperationContext {
  return {
    requestId: newTraceId(),
    traceId: newTraceId(),
    dryRun: parsed.dryRun,
    idempotencyKey: typeof parsed.flags.idempotencyKey === 'string' ? parsed.flags.idempotencyKey : undefined,
  };
}

/** Find an operation whose cli.command tokens match the leading argv tokens. */
function findOperation(command: string[]): { def: OperationDef; consumed: number } | undefined {
  outer: for (const def of operationRegistry.list()) {
    const tokens = def.cli.command.split(/\s+/).filter((t) => t !== 'microera');
    if (tokens.length === 0 || tokens.length > command.length) continue;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] !== command[i]) continue outer;
    }
    return { def, consumed: tokens.length };
  }
  return undefined;
}

/** Per-operation input builders: map remaining positional args + flags → input. */
function buildInput(defId: string, rest: string[], flags: Record<string, string | boolean>): Record<string, unknown> {
  const num = (v: unknown): number | undefined => (typeof v === 'string' && v !== '' ? Number(v) : undefined);
  switch (defId) {
    case 'search.hybrid': return { query: rest.join(' '), top_k: num(flags['top-k']) ?? num(flags.top_k) };
    case 'chat.ask': return { question: rest.join(' '), conversation_id: flags['conversation-id'] ?? flags.conversation_id };
    case 'chat.references': return { conversation_id: flags['conversation-id'] ?? flags.conversation_id };
    case 'job.view': return { job_id: flags['job-id'] ?? flags.job_id ?? rest[0] };
    case 'job.list': return {};
    case 'kb.create': return { name: flags.name ?? rest[0], visibility: flags.visibility ?? 'internal' };
    case 'kb.list': return {};
    case 'doc.upload': return { kb_id: flags['kb-id'] ?? flags.kb_id, file_path: flags.file ?? rest[0] };
    case 'auth.whoami': return {};
    default: return {};
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  const traceId = newTraceId();

  // One shared API client + registry for the whole process.
  const api = new ApiClient({ baseUrl: resolveBaseUrl(), token: resolveToken(), timeoutMs: parsed.timeoutMs });
  ensureOperationsRegistered(api);

  // Top-level commands (no operation binding)
  const [cmd0] = parsed.command;

  if (!cmd0 || parsed.flags.help) {
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
  if (cmd0 === 'mcp') {
    const { runMcpServe } = await import('../../packages/mcp/src/index.js');
    return runMcpServe(parsed.command.slice(1));
  }

  // Operation dispatch
  const found = findOperation(parsed.command);
  if (!found) {
    printWire(fail('cli', 'resource_not_found', `Unknown command: microera ${parsed.command.join(' ')}`, traceId, 'Run `microera schema` to list commands'), parsed.format);
    return EXIT.NOT_FOUND;
  }

  const { def, consumed } = found;
  const rest = parsed.command.slice(consumed);
  const input = buildInput(def.id, rest, parsed.flags);

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
