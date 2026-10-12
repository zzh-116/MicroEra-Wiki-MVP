// Batch A — CLI argument parsing (schema-aware mapping) regression tests.
// Covers the defects fixed in batch A: positional-arg loss (D2), chat.ask
// param mapping (D3), search.hybrid param mapping (D4), array coercion (D5),
// datasource camelCase + dryRun (D6), --format collision (D8), chat.references
// message_id (D1).
import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { parseArgs, findOperation, buildInput } from '../../cli/src/args.js';

const def = (id: string) => operationRegistry.get(id)!;

beforeAll(() => {
  registerOperations(new ApiClient({ baseUrl: 'http://localhost:1' }));
});

describe('parseArgs', () => {
  it('strips global flags and preserves op tokens in original order', () => {
    const p = parseArgs(['--format', 'text', '--dry-run', 'search', 'vector', 'MOF', '--kb-id', '1']);
    expect(p.format).toBe('text');
    expect(p.dryRun).toBe(true);
    expect(p.tokens).toEqual(['search', 'vector', 'MOF', '--kb-id', '1']);
  });

  it('leaves a non-global --format value for the operation input (D8)', () => {
    const p = parseArgs(['kb', 'export', '--kb-id', '1', '--format', 'xlsx']);
    expect(p.format).toBe('json');
    expect(p.tokens).toEqual(['kb', 'export', '--kb-id', '1', '--format', 'xlsx']);
  });

  it('captures --idempotency-key as a global', () => {
    const p = parseArgs(['--idempotency-key', 'abc123', 'kb', 'list']);
    expect(p.idempotencyKey).toBe('abc123');
    expect(p.tokens).toEqual(['kb', 'list']);
  });
});

describe('findOperation', () => {
  it('matches a leading command against the registry', () => {
    const found = findOperation(['search', 'vector', 'MOF', '--kb-id', '1']);
    expect(found?.def.id).toBe('search.vector');
    expect(found?.consumed).toBe(2);
  });
});

describe('buildInput — positional → primary string field (D2)', () => {
  it('maps positional query for search.vector', () => {
    expect(buildInput(def('search.vector'), ['MOF pore aperture', '--kb-id', '1', '--top-k', '5'], false))
      .toEqual({ query: 'MOF pore aperture', kb_id: 1, top_k: 5 });
  });
  it('maps positional query for search.lexical / explain / filtered', () => {
    expect(buildInput(def('search.lexical'), ['MOF', '--kb-id', '1'], false)).toEqual({ query: 'MOF', kb_id: 1 });
    expect(buildInput(def('search.explain'), ['MOF', '--kb-id', '1'], false)).toEqual({ query: 'MOF', kb_id: 1 });
    expect(buildInput(def('search.filtered'), ['MOF', '--method', 'lexical'], false)).toEqual({ query: 'MOF', method: 'lexical' });
  });
  it('maps positional question for chat.ask / chat.stream / session.ask', () => {
    expect(buildInput(def('chat.ask'), ['which papers?'], false).question).toBe('which papers?');
    expect(buildInput(def('chat.stream'), ['summarize'], false).question).toBe('summarize');
    expect(buildInput(def('session.ask'), ['what did we cover?', '--session-id', 'sess_1'], false))
      .toEqual({ question: 'what did we cover?', session_id: 'sess_1' });
  });
  it('maps positional q for message.search / wiki.search / graph.search', () => {
    expect(buildInput(def('message.search'), ['MOF'], false)).toEqual({ q: 'MOF' });
    expect(buildInput(def('wiki.search'), ['zeolite'], false)).toEqual({ q: 'zeolite' });
    expect(buildInput(def('graph.search'), ['zeolite'], false)).toEqual({ q: 'zeolite' });
  });
});

describe('buildInput — chat.references message_id (D1)', () => {
  it('maps --message-id → message_id', () => {
    expect(buildInput(def('chat.references'), ['--message-id', 'msg_1'], false))
      .toEqual({ message_id: 'msg_1' });
  });
});

describe('buildInput — chat.ask full param mapping (D3)', () => {
  it('maps kb_ids array + session_id + top_k + method + is_internal', () => {
    const input = buildInput(def('chat.ask'), [
      'Q', '--kb-ids', '1', '2', '--session-id', 'sess_1', '--top-k', '7', '--method', 'vector', '--is-internal',
    ], false);
    expect(input).toEqual({
      question: 'Q',
      kb_ids: [1, 2],
      session_id: 'sess_1',
      top_k: 7,
      method: 'vector',
      is_internal: true,
    });
  });
});

describe('buildInput — search.hybrid full param mapping (D4)', () => {
  it('maps kb_id / folder_id / is_internal / rrf_k / top_k', () => {
    const input = buildInput(def('search.hybrid'), [
      'MOF', '--kb-id', '1', '--folder-id', '2', '--is-internal', '--rrf-k', '60', '--top-k', '5',
    ], false);
    expect(input).toEqual({ query: 'MOF', kb_id: 1, folder_id: 2, is_internal: true, rrf_k: 60, top_k: 5 });
  });
});

describe('buildInput — array coercion (D5)', () => {
  it('parses a JSON object array (search.rerank documents)', () => {
    const input = buildInput(def('search.rerank'), ['--query', 'MOF', '--documents', '[{"text":"a"},{"text":"b"}]'], false);
    expect(input.documents).toEqual([{ text: 'a' }, { text: 'b' }]);
  });
  it('parses comma-separated integer arrays', () => {
    expect(buildInput(def('chat.ask'), ['Q', '--kb-ids', '1,2,3'], false).kb_ids).toEqual([1, 2, 3]);
  });
  it('parses space-separated string arrays (eval.compare run_ids)', () => {
    expect(buildInput(def('eval.compare'), ['--run-ids', 'eval_1', 'eval_2'], false).run_ids).toEqual(['eval_1', 'eval_2']);
  });
  it('parses a quoted whitespace-separated integer array', () => {
    expect(buildInput(def('chat.ask'), ['Q', '--kb-ids', '1 2'], false).kb_ids).toEqual([1, 2]);
  });
});

describe('buildInput — camelCase + object fields (D6)', () => {
  it('maps --project-id → projectId (datasource.preview)', () => {
    expect(buildInput(def('datasource.preview'), ['--datasource-id', '1', '--project-id', 'proj1'], false).projectId).toBe('proj1');
  });
  it('maps global --dry-run → datasource.sync dryRun', () => {
    expect(buildInput(def('datasource.sync'), ['--datasource-id', '1'], true).dryRun).toBe(true);
  });
  it('parses object flags (search.filtered filters)', () => {
    expect(buildInput(def('search.filtered'), ['MOF', '--method', 'lexical', '--filters', '{"visibility":"public"}'], false).filters)
      .toEqual({ visibility: 'public' });
  });
});

describe('buildInput — kb.import', () => {
  it('parses --documents inline JSON', () => {
    const input = buildInput(def('kb.import'), ['--kb-id', '1', '--documents', '[{"title":"x"}]'], false);
    expect(input.kb_id).toBe(1);
    expect(input.documents).toEqual([{ title: 'x' }]);
  });
});
