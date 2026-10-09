// Operation Registry — maps a stable `operation_id` to its OperationDef and is
// the single source of truth that REST, CLI and MCP all resolve against.
import type { OperationDef, JsonSchema } from '../../contracts/src/types.js';

export interface OperationManifestEntry {
  id: string;
  version: string;
  title: string;
  kind: OperationDef['kind'];
  risk: OperationDef['risk'];
  cli: string;
  mcp_tool: string;
  mcp_read_only: boolean;
  http?: { method: string; path: string };
  transport: 'remote' | 'local';
  has_handler: boolean;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  streamMode: string;
  examples: string[];
}

export class OperationRegistry {
  private defs = new Map<string, OperationDef>();

  register(def: OperationDef): this {
    if (this.defs.has(def.id)) {
      throw new Error(`Duplicate operation id: ${def.id}`);
    }
    this.defs.set(def.id, def);
    return this;
  }

  get(id: string): OperationDef | undefined {
    return this.defs.get(id);
  }

  list(): OperationDef[] {
    return [...this.defs.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Structural validation — returns a list of problems (empty = valid). */
  validate(): string[] {
    const problems: string[] = [];
    for (const def of this.list()) {
      if (!/^[a-z]+\.[a-z][a-z0-9_]*$/.test(def.id)) {
        problems.push(`${def.id}: id does not match ^[a-z]+\\.[a-z][a-z0-9_]*$`);
      }
      if (!def.inputSchema || !def.outputSchema) {
        problems.push(`${def.id}: missing input/output schema`);
      }
      if (!def.cli?.command || !def.mcp?.toolName) {
        problems.push(`${def.id}: missing cli.command or mcp.toolName`);
      }
      if (def.transport === 'remote' && !def.http) {
        problems.push(`${def.id}: remote operation is missing an http route`);
      }
    }
    return problems;
  }

  /** Manifest for `microera schema` and MCP `resources` (machine-discoverable). */
  toManifest(): { operationRegistryVersion: string; operations: OperationManifestEntry[] } {
    return {
      operationRegistryVersion: '1',
      operations: this.list().map((d) => ({
        id: d.id,
        version: d.version,
        title: d.title,
        kind: d.kind,
        risk: d.risk,
        cli: d.cli.command,
        mcp_tool: d.mcp.toolName,
        mcp_read_only: d.mcp.readOnlyHint,
        http: d.http ? { method: d.http.method, path: d.http.path } : undefined,
        transport: d.transport ?? 'remote',
        has_handler: typeof d.handler === 'function',
        inputSchema: d.inputSchema,
        outputSchema: d.outputSchema,
        streamMode: d.streamMode ?? 'none',
        examples: d.cli.examples,
      })),
    };
  }
}

export const operationRegistry = new OperationRegistry();
