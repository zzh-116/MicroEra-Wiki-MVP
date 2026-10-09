// P3-06 — Search CLI+MCP parity: every P3 search operation (vector/lexical/
// hybrid/explain/rerank/filtered/metadata) is a registry-bound verb with a
// handler, an MCP toolName, and a CLI command, and both transports resolve to
// the same OperationDef (single business truth).
import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { listTools } from '../../packages/mcp/src/mcp-core.js';

// The 7 P3 search operations (R01–R06).
const SEARCH_OPS = [
  'search.vector', 'search.lexical', 'search.hybrid', 'search.explain',
  'search.rerank', 'search.filtered', 'search.metadata',
];

describe('P3-06 search CLI+MCP parity', () => {
  beforeAll(() => {
    // Idempotent: populates the global registry once.
    registerOperations(new ApiClient({ baseUrl: 'http://localhost:1' }));
  });

  it('registers all 7 P3 search operations with a handler', () => {
    for (const id of SEARCH_OPS) {
      const def = operationRegistry.get(id);
      expect(def, `${id} registered`).toBeDefined();
      expect(typeof def!.handler, `${id} has a handler`).toBe('function');
    }
  });

  it('exposes every P3 search operation as an MCP tool', () => {
    const toolNames = new Set(listTools().map((t) => t.name));
    for (const id of SEARCH_OPS) {
      const def = operationRegistry.get(id)!;
      expect(toolNames.has(def.mcp.toolName), `${id} → ${def.mcp.toolName}`).toBe(true);
    }
  });

  it('exposes every P3 search operation as a CLI command', () => {
    for (const id of SEARCH_OPS) {
      const def = operationRegistry.get(id)!;
      expect(def.cli.command, `${id} cli.command`).toMatch(/^microera /);
      expect(def.cli.examples.length, `${id} has examples`).toBeGreaterThan(0);
    }
  });

  it('maps each CLI verb back to the same operation (no collisions)', () => {
    for (const id of SEARCH_OPS) {
      const def = operationRegistry.get(id)!;
      const tokens = def.cli.command.split(/\s+/).filter((t) => t !== 'microera');
      const found = operationRegistry.list().find((d) => {
        const dt = d.cli.command.split(/\s+/).filter((t) => t !== 'microera');
        return dt.length === tokens.length && dt.every((t, i) => t === tokens[i]);
      });
      expect(found?.id, `${id} resolves uniquely via its cli verb`).toBe(id);
    }
  });

  it('keeps every P3 search operation on the remote transport (HTTP-backed)', () => {
    for (const id of SEARCH_OPS) {
      const def = operationRegistry.get(id)!;
      expect(def.transport, `${id} transport`).toBe('remote');
      expect(def.http?.path, `${id} http route`).toMatch(/^\/api\/v2\/ops\//);
    }
  });

  it('marks search operations read-only and the eval runner job-shaped', () => {
    for (const id of SEARCH_OPS) {
      expect(operationRegistry.get(id)!.risk, `${id} risk`).toBe('read');
    }
    expect(operationRegistry.get('search.metadata')!.kind).toBe('query');
    expect(operationRegistry.get('search.filtered')!.kind).toBe('mutation');
  });
});
