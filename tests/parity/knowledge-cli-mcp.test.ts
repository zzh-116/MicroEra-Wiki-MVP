// P1-06 — Knowledge CLI+MCP parity: every P1 knowledge operation is a
// registry-bound verb with a handler, an MCP toolName, and a CLI command, and
// both transports resolve to the same OperationDef (single business truth).
import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { listTools } from '../../packages/mcp/src/mcp-core.js';

// The 28 P1 knowledge operations (K01–K06).
const P1_OPS = [
  'kb.create', 'kb.list', 'kb.view', 'kb.update', 'kb.delete', 'kb.status', 'kb.check',
  'kb.folder_create', 'kb.folder_list', 'kb.folder_move', 'kb.folder_delete',
  'doc.list', 'doc.view', 'doc.update', 'doc.delete', 'doc.restore', 'doc.move', 'doc.batch',
  'kb.export', 'kb.import',
  'doc.revisions', 'doc.revision_view', 'doc.revision_restore', 'doc.source_view',
  'doc.preview', 'doc.download', 'doc.artifacts', 'doc.artifact_download',
];

describe('P1-06 knowledge CLI+MCP parity', () => {
  beforeAll(() => {
    // Idempotent: populates the global registry once.
    registerOperations(new ApiClient({ baseUrl: 'http://localhost:1' }));
  });

  it('registers all 28 P1 knowledge operations with a handler', () => {
    for (const id of P1_OPS) {
      const def = operationRegistry.get(id);
      expect(def, `${id} registered`).toBeDefined();
      expect(typeof def!.handler, `${id} has a handler`).toBe('function');
    }
  });

  it('exposes every P1 operation as an MCP tool', () => {
    const toolNames = new Set(listTools().map((t) => t.name));
    for (const id of P1_OPS) {
      const def = operationRegistry.get(id)!;
      expect(toolNames.has(def.mcp.toolName), `${id} → ${def.mcp.toolName}`).toBe(true);
    }
  });

  it('exposes every P1 operation as a CLI command', () => {
    for (const id of P1_OPS) {
      const def = operationRegistry.get(id)!;
      expect(def.cli.command, `${id} cli.command`).toMatch(/^microera /);
      expect(def.cli.examples.length, `${id} has examples`).toBeGreaterThan(0);
    }
  });

  it('maps each CLI verb back to the same operation (no collisions)', () => {
    for (const id of P1_OPS) {
      const def = operationRegistry.get(id)!;
      const tokens = def.cli.command.split(/\s+/).filter((t) => t !== 'microera');
      const found = operationRegistry.list().find((d) => {
        const dt = d.cli.command.split(/\s+/).filter((t) => t !== 'microera');
        return dt.length === tokens.length && dt.every((t, i) => t === tokens[i]);
      });
      expect(found?.id, `${id} resolves uniquely via its cli verb`).toBe(id);
    }
  });

  it('keeps every P1 operation on the remote transport (HTTP-backed)', () => {
    for (const id of P1_OPS) {
      const def = operationRegistry.get(id)!;
      expect(def.transport, `${id} transport`).toBe('remote');
      expect(def.http?.path, `${id} http route`).toMatch(/^\/api\/v2\/ops\//);
    }
  });
});
