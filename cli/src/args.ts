// CLI argument parsing — schema-aware mapping of argv → OperationDef input.
// Pure functions (no process state), extracted from main.ts so they can be
// unit-tested without booting the CLI.
import type { OperationDef, JsonSchema } from '../../packages/contracts/src/types.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { readFileSync } from 'node:fs';

export interface ParsedArgs {
  format: 'json' | 'ndjson' | 'text';
  /** Command words + operation args, in original order (flags NOT stripped). */
  tokens: string[];
  dryRun: boolean;
  yes: boolean;
  help: boolean;
  timeoutMs: number;
  idempotencyKey?: string;
}

/** Parse global CLI flags up front, leaving every other token (command words,
 *  operation flags, and positionals) in original order for schema-aware parsing. */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    format: 'json',
    tokens: [],
    dryRun: false,
    yes: false,
    help: false,
    timeoutMs: 30000,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // `--format` is a global output-format flag only when the value is one we
    // actually render; otherwise it is an operation input (e.g. kb.export).
    if (arg === '--format' && argv[i + 1] && ['json', 'ndjson', 'text'].includes(argv[i + 1])) { parsed.format = argv[++i] as ParsedArgs['format']; continue; }
    if (arg === '--timeout' && argv[i + 1]) { parsed.timeoutMs = Number(argv[++i]) || 30000; continue; }
    if (arg === '--dry-run') { parsed.dryRun = true; continue; }
    if (arg === '--yes' || arg === '-y') { parsed.yes = true; continue; }
    if (arg === '--profile' && argv[i + 1]) { argv[++i]; continue; } // accepted, no-op for P0
    if (arg === '--trace' && argv[i + 1]) { argv[++i]; continue; }   // accepted, no-op
    if (arg === '--idempotency-key' && argv[i + 1]) { parsed.idempotencyKey = argv[++i]; continue; }
    if (arg === '--help' || arg === '-h') { parsed.help = true; continue; }
    parsed.tokens.push(arg);
  }
  return parsed;
}

/** Find an operation whose cli.command tokens match the leading argv tokens. */
export function findOperation(tokens: string[]): { def: OperationDef; consumed: number } | undefined {
  outer: for (const def of operationRegistry.list()) {
    const cmd = def.cli.command.split(/\s+/).filter((t) => t !== 'microera');
    if (cmd.length === 0 || cmd.length > tokens.length) continue;
    for (let i = 0; i < cmd.length; i++) {
      if (cmd[i] !== tokens[i]) continue outer;
    }
    return { def, consumed: cmd.length };
  }
  return undefined;
}

/** Map a kebab-case flag name to a schema property key (snake_case or camelCase). */
function resolveKey(flag: string, props: Record<string, unknown>): string | undefined {
  if (flag in props) return flag;
  const snake = flag.replace(/-/g, '_');
  if (snake in props) return snake;
  const camel = snake.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  if (camel in props) return camel;
  const camelDirect = flag.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  if (camelDirect in props) return camelDirect;
  return undefined;
}

function coerceBoolean(raw: string): boolean {
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function coerceScalar(raw: string, schema?: JsonSchema): unknown {
  if (schema?.type === 'integer' || schema?.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (schema?.type === 'boolean') return coerceBoolean(raw);
  return raw;
}

/** Coerce an array flag's collected tokens per its `items.type`.
 *  - object/array items: JSON.parse (array or single object)
 *  - integer/number items: split on commas + whitespace, then Number()
 *  - string items: keep whole segments (comma-separated)
 *  - boolean items: true/false/1/0/yes
 */
function coerceArray(tokens: string[], schema: JsonSchema): unknown[] {
  const itemType = schema.items?.type;
  const out: unknown[] = [];
  for (const tok of tokens) {
    const t = tok.trim();
    if (t === '') continue;
    if (t.startsWith('[') || t.startsWith('{')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) { out.push(...parsed); continue; }
        out.push(parsed); continue;
      } catch { /* fall through to plain splitting */ }
    }
    for (const seg of t.split(',')) {
      const s = seg.trim();
      if (s === '') continue;
      if (itemType === 'integer' || itemType === 'number') {
        for (const piece of s.split(/\s+/)) {
          const n = Number(piece);
          if (Number.isFinite(n)) out.push(n);
        }
      } else if (itemType === 'boolean') {
        out.push(coerceBoolean(s));
      } else if (itemType === 'object' || itemType === 'array') {
        try { out.push(JSON.parse(s)); } catch { out.push(s); }
      } else {
        out.push(s);
      }
    }
  }
  return out;
}

/** The single positional string field: first required string prop, else first string prop. */
function primaryStringField(
  props: Record<string, JsonSchema>,
  required: string[],
): string | undefined {
  for (const key of required) {
    if (props[key]?.type === 'string') return key;
  }
  for (const key of Object.keys(props)) {
    if (props[key]?.type === 'string') return key;
  }
  return undefined;
}

/** kb.import accepts --file <export.json> (a kb.export payload or raw array)
 *  or --documents '<json array>' inline. */
function buildImportInput(opArgs: string[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  let documents: unknown[] | undefined;
  for (let i = 0; i < opArgs.length; i++) {
    const tok = opArgs[i];
    if (tok === '--kb-id' && opArgs[i + 1]) { const n = Number(opArgs[++i]); if (Number.isFinite(n)) input.kb_id = n; continue; }
    if (tok.startsWith('--kb-id=')) { const n = Number(tok.slice('--kb-id='.length)); if (Number.isFinite(n)) input.kb_id = n; continue; }
    if (tok === '--documents' && opArgs[i + 1]) { documents = JSON.parse(opArgs[++i]); continue; }
    if (tok.startsWith('--documents=')) { documents = JSON.parse(tok.slice('--documents='.length)); continue; }
    if (tok === '--file' && opArgs[i + 1]) {
      const parsed = JSON.parse(readFileSync(opArgs[++i], 'utf-8'));
      documents = Array.isArray(parsed) ? parsed : (parsed.documents ?? []);
      continue;
    }
  }
  if (documents !== undefined) input.documents = documents;
  return input;
}

/** Map remaining positional args + flags → operation input (schema-aware). */
export function buildInput(def: OperationDef, opArgs: string[], dryRun: boolean): Record<string, unknown> {
  if (def.id === 'kb.import') return buildImportInput(opArgs);

  const props = (def.inputSchema?.properties ?? {}) as Record<string, JsonSchema>;
  const required = def.inputSchema?.required ?? [];
  const input: Record<string, unknown> = {};
  const positionals: string[] = [];

  let i = 0;
  while (i < opArgs.length) {
    const tok = opArgs[i];
    if (!tok.startsWith('--')) { positionals.push(tok); i++; continue; }

    let body = tok.slice(2);
    let inline: string | undefined;
    const eq = body.indexOf('=');
    if (eq >= 0) { inline = body.slice(eq + 1); body = body.slice(0, eq); }

    const key = resolveKey(body, props);
    if (key === undefined) {
      // Unknown flag: consume a following value token if present, then drop both.
      if (inline === undefined && i + 1 < opArgs.length && !opArgs[i + 1].startsWith('--')) i++;
      i++;
      continue;
    }
    const schema = props[key];

    if (schema.type === 'array') {
      const collected: string[] = [];
      if (inline !== undefined) collected.push(inline);
      while (i + 1 < opArgs.length && !opArgs[i + 1].startsWith('--')) collected.push(opArgs[++i]);
      input[key] = coerceArray(collected, schema);
    } else if (schema.type === 'boolean') {
      input[key] = inline === undefined ? true : coerceBoolean(inline);
    } else if (schema.type === 'object') {
      const raw = inline !== undefined ? inline : (i + 1 < opArgs.length && !opArgs[i + 1].startsWith('--') ? opArgs[++i] : undefined);
      input[key] = raw !== undefined ? JSON.parse(raw) : undefined;
    } else {
      let raw = inline;
      if (raw === undefined && i + 1 < opArgs.length && !opArgs[i + 1].startsWith('--')) raw = opArgs[++i];
      if (raw === undefined) { i++; continue; }
      const v = coerceScalar(raw, schema);
      if (v !== undefined) input[key] = v;
    }
    i++;
  }

  // Leading positional(s) → the primary string field (query/question/q/name/...).
  if (positionals.length) {
    const primary = primaryStringField(props, required);
    if (primary && input[primary] === undefined) input[primary] = positionals.join(' ');
  }

  // Global --dry-run also maps onto an op-level dryRun/dry_run input field.
  if (dryRun) {
    if ('dryRun' in props) input.dryRun = true;
    else if ('dry_run' in props) input.dry_run = true;
  }

  return input;
}
