// P9 — api.*/mcp.*/cli.* introspection ops (X01/X02/X03).
// Unit tests over the meta service; the DB ping in cli.doctor is mocked.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { metaService } from '../../backend/services/meta.service.js';
import { pool } from '../../backend/db/connection.js';

afterEach(() => vi.restoreAllMocks());

describe('P9 X01 — api.* introspection', () => {
  it('api.operations lists every registered operation with bindings', () => {
    const r = metaService.operations();
    expect(r.total).toBeGreaterThan(0);
    const own = r.items.find((i) => i.id === 'api.operations');
    expect(own).toBeDefined();
    expect(own!.cli).toBe('microera api operations');
    expect(own!.mcp_tool).toBe('api_operations');
  });

  it('api.schema (no arg) returns the full manifest', () => {
    const r: any = metaService.schema();
    expect(r.operationRegistryVersion).toBe('1');
    expect(Array.isArray(r.operations)).toBe(true);
    expect(r.operations.length).toBeGreaterThan(0);
  });

  it('api.schema (operation_id) returns a single contract', () => {
    const r: any = metaService.schema('kb.create');
    expect(r.id).toBe('kb.create');
    expect(r.inputSchema).toBeDefined();
    expect(r.outputSchema).toBeDefined();
  });

  it('api.schema throws resource_not_found for an unknown operation', () => {
    expect(() => metaService.schema('nope.missing')).toThrowError(/unknown operation/);
  });

  it('api.version reports versions and the registry size', () => {
    const r: any = metaService.version();
    expect(r.api_version).toBe('0.2.0');
    expect(r.registered_operations).toBeGreaterThan(0);
  });
});

describe('P9 X02 — mcp.* introspection', () => {
  it('mcp.tools lists named tools', () => {
    const r = metaService.tools();
    expect(r.total).toBeGreaterThan(0);
    expect(r.tools.every((t: any) => typeof t.name === 'string')).toBe(true);
  });

  it('mcp.resources lists the host resources', () => {
    const r = metaService.resources();
    expect(r.total).toBeGreaterThan(0);
    expect(r.resources.some((x: any) => x.uri === 'microera://schema/operations')).toBe(true);
  });

  it('mcp.prompts lists the host prompts', () => {
    const r = metaService.prompts();
    expect(r.total).toBeGreaterThan(0);
    expect(r.prompts.every((p: any) => typeof p.name === 'string')).toBe(true);
  });

  it('mcp.health reports liveness', () => {
    const r: any = metaService.health();
    expect(r.ok).toBe(true);
    expect(r.name).toBe('microera');
    expect(r.tools).toBeGreaterThan(0);
  });
});

describe('P9 X03 — cli.* introspection', () => {
  it('cli.commands lists every CLI command with its operation', () => {
    const r = metaService.commands();
    expect(r.total).toBeGreaterThan(0);
    expect(r.commands.some((c: any) => c.command === 'microera cli commands')).toBe(true);
  });

  it('cli.version reports the CLI + API + MCP versions', () => {
    const r: any = metaService.cliVersion();
    expect(r.version).toBe('0.1.0');
    expect(r.api_version).toBe('0.2.0');
    expect(r.supported_transports).toEqual(['stdio', 'http']);
  });

  it('cli.doctor reports a connected database and a valid registry', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);
    const r: any = await metaService.doctor();
    expect(r.server).toBe('connected');
    expect(r.database).toBe('connected');
    expect(r.registry_valid).toBe(true);
    expect(r.registry_problems).toEqual([]);
  });

  it('cli.doctor degrades gracefully when the database is unreachable', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('connection refused'));
    const r: any = await metaService.doctor();
    expect(r.database).toBe('unreachable');
  });
});
