// P2-06 — Ingest CLI+MCP parity: every P2 operation (upload/import/parse/
// reparse/wait, parsed elements, chunks, durable jobs, deadletters) is a
// registry-bound verb with a handler, an MCP toolName, and a CLI command, and
// both transports resolve to the same OperationDef (single business truth).
import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { listTools } from '../../packages/mcp/src/mcp-core.js';

// The 18 P2 operations (P01 ingest + P02 elements + P03 chunks + P04 jobs + O03 DLQ).
const P2_OPS = [
  'doc.upload', 'doc.import_url', 'doc.parse', 'doc.reparse', 'doc.wait',
  'doc.images', 'doc.tables', 'doc.ocr',
  'chunk.list', 'chunk.view', 'chunk.preview', 'chunk.update', 'chunk.delete',
  'job.parse_status', 'job.parse_retry', 'job.parse_cancel', 'job.deadletters', 'job.replay_deadletter',
];

describe('P2-06 ingest CLI+MCP parity', () => {
  beforeAll(() => {
    // Idempotent: populates the global registry once.
    registerOperations(new ApiClient({ baseUrl: 'http://localhost:1' }));
  });

  it('registers all 18 P2 operations with a handler', () => {
    for (const id of P2_OPS) {
      const def = operationRegistry.get(id);
      expect(def, `${id} registered`).toBeDefined();
      expect(typeof def!.handler, `${id} has a handler`).toBe('function');
    }
  });

  it('exposes every P2 operation as an MCP tool', () => {
    const toolNames = new Set(listTools().map((t) => t.name));
    for (const id of P2_OPS) {
      const def = operationRegistry.get(id)!;
      expect(toolNames.has(def.mcp.toolName), `${id} → ${def.mcp.toolName}`).toBe(true);
    }
  });

  it('exposes every P2 operation as a CLI command', () => {
    for (const id of P2_OPS) {
      const def = operationRegistry.get(id)!;
      expect(def.cli.command, `${id} cli.command`).toMatch(/^microera /);
      expect(def.cli.examples.length, `${id} has examples`).toBeGreaterThan(0);
    }
  });

  it('maps each CLI verb back to the same operation (no collisions)', () => {
    for (const id of P2_OPS) {
      const def = operationRegistry.get(id)!;
      const tokens = def.cli.command.split(/\s+/).filter((t) => t !== 'microera');
      const found = operationRegistry.list().find((d) => {
        const dt = d.cli.command.split(/\s+/).filter((t) => t !== 'microera');
        return dt.length === tokens.length && dt.every((t, i) => t === tokens[i]);
      });
      expect(found?.id, `${id} resolves uniquely via its cli verb`).toBe(id);
    }
  });

  it('keeps every P2 operation on the remote transport (HTTP-backed)', () => {
    for (const id of P2_OPS) {
      const def = operationRegistry.get(id)!;
      expect(def.transport, `${id} transport`).toBe('remote');
      expect(def.http?.path, `${id} http route`).toMatch(/^\/api\/v2\/ops\//);
    }
  });

  it('marks destructive P2 operations with the right risk', () => {
    expect(operationRegistry.get('chunk.delete')!.risk).toBe('destructive');
    expect(operationRegistry.get('job.replay_deadletter')!.risk).toBe('destructive');
    expect(operationRegistry.get('doc.upload')!.risk).toBe('write');
    expect(operationRegistry.get('doc.wait')!.risk).toBe('read');
  });
});
