// P0-03/P0-04 contract tests: registry, wire envelope, exit codes, MCP surface.
import { describe, it, expect } from 'vitest';
import { OperationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { ok, fail, newTraceId, EXIT, ErrorKind } from '../../packages/contracts/src/wire.js';
import { listTools, listResources, listPrompts, MCP_PROTOCOL_VERSION } from '../../packages/mcp/src/mcp-core.js';
import type { OperationDef } from '../../packages/contracts/src/types.js';

describe('OperationRegistry', () => {
  it('registers, retrieves and lists operations', () => {
    const reg = new OperationRegistry();
    const def: OperationDef = {
      id: 'test.op', version: '1', title: 'Test op', kind: 'query', risk: 'read',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      cli: { command: 'microera test op', examples: [] },
      mcp: { toolName: 'test_op', readOnlyHint: true, scopes: [] },
    };
    reg.register(def);
    expect(reg.get('test.op')).toBe(def);
    expect(reg.list()).toHaveLength(1);
  });

  it('rejects duplicate operation ids', () => {
    const reg = new OperationRegistry();
    const def = (id: string): OperationDef => ({
      id, version: '1', title: 'T', kind: 'query', risk: 'read',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      cli: { command: 'microera x', examples: [] },
      mcp: { toolName: 'x', readOnlyHint: true, scopes: [] },
    });
    reg.register(def('a.b'));
    expect(() => reg.register(def('a.b'))).toThrow(/Duplicate/);
  });

  it('validates id shape and missing schemas', () => {
    const reg = new OperationRegistry();
    reg.register({
      id: 'BAD_ID', version: '1', title: 'T', kind: 'query', risk: 'read',
      inputSchema: { type: 'object', properties: {} } as any,
      outputSchema: { type: 'object', properties: {} } as any,
      cli: { command: 'microera x', examples: [] },
      mcp: { toolName: 'x', readOnlyHint: true, scopes: [] },
    });
    const problems = reg.validate();
    expect(problems.some((p) => p.includes('id does not match'))).toBe(true);
  });
});

describe('wire contract', () => {
  it('ok() produces the canonical success envelope', () => {
    const env = ok('kb.create', { id: 'kb_1' }, 'trace_1', { count: 1 });
    expect(env.ok).toBe(true);
    expect(env.meta.operation_id).toBe('kb.create');
    expect(env.meta.trace_id).toBe('trace_1');
    expect(env.meta.version).toBe('1');
  });

  it('fail() produces the canonical error envelope with exit code', () => {
    const env = fail('kb.create', 'resource_not_found', 'KB not found', 'trace_1', 'run microera kb list');
    expect(env.ok).toBe(false);
    expect(env.error.type).toBe('resource.not_found');
    expect(env.error.code).toBe('NOT_FOUND');
    expect(env.error.exit_code).toBe(EXIT.NOT_FOUND);
    expect(env.error.hint).toContain('microera kb list');
  });

  it('error kinds carry the documented exit codes', () => {
    expect(ErrorKind.unauthorized.exit).toBe(3);
    expect(ErrorKind.resource_not_found.exit).toBe(4);
    expect(ErrorKind.needs_confirmation.exit).toBe(10);
    expect(ErrorKind.timeout.exit).toBe(124);
    expect(ErrorKind.cancelled.exit).toBe(130);
  });

  it('newTraceId returns a non-empty hex string', () => {
    const id = newTraceId();
    expect(id).toMatch(/^[0-9a-f]+$/);
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('MCP surface (from registry)', () => {
  it('exposes remote operations as tools, not local ones', () => {
    // Build a fresh registry with a local + remote op and check filtering.
    const reg = new OperationRegistry();
    const api = new ApiClient({ baseUrl: 'http://localhost:1' });
    // registerOperations uses the global registry; call it to populate a global.
    registerOperations(api);
    const tools = listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('search_hybrid');
    expect(names).toContain('chat_ask');
    expect(names).not.toContain('auth_whoami'); // local op excluded
  });

  it('lists the schema resource and known prompts', () => {
    const resources = listResources();
    expect(resources.some((r) => r.uri === 'miqroera://schema/operations')).toBe(true);
    const prompts = listPrompts();
    expect(prompts.some((p) => p.name === 'research-grounded-answer')).toBe(true);
  });

  it('declares a supported protocol version', () => {
    expect(MCP_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
