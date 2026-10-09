// Meta service (P9 X01–X03) — the api.*/mcp.*/cli.* introspection layer. Every
// method reads the Operation Registry (and, for MCP, the same mcp-core builders
// the MCP host uses), so there is one source of truth and nothing is fabricated.
// The registry is populated lazily and idempotently: in the server process no
// CLI/MCP entry point runs, so we ensure registration on first introspection.
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ensureOperationsRegistered } from '../../packages/operation-registry/src/operations.js';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { listTools, listResources, listPrompts, serverInfo, MCP_PROTOCOL_VERSION } from '../../packages/mcp/src/mcp-core.js';
import { config } from '../config.js';
import { pool } from '../db/connection.js';
import { ServiceError } from './knowledge.service.js';

const API_VERSION = '0.2.0';
const CLI_VERSION = '0.1.0';
const PLAN_VERSION = '2026-10-09-v1';

let ensured = false;

/** Populate the registry exactly once. The ApiClient is inert here — server
 *  routes are served directly and never invoke a registry handler. */
function ensure(): void {
  if (ensured) return;
  ensureOperationsRegistered(new ApiClient({ baseUrl: `http://localhost:${config.port}` }));
  ensured = true;
}

function operationSummary(d: any): Record<string, unknown> {
  return {
    id: d.id,
    version: d.version,
    title: d.title,
    kind: d.kind,
    risk: d.risk,
    http: d.http ? { method: d.http.method, path: d.http.path } : undefined,
    cli: d.cli?.command,
    mcp_tool: d.mcp?.toolName,
    transport: d.transport ?? 'remote',
  };
}

export class MetaService {
  /** api.operations — list every registered operation with its surface bindings. */
  operations(): { items: Record<string, unknown>[]; total: number } {
    ensure();
    const items = operationRegistry.list().map(operationSummary);
    return { items, total: items.length };
  }

  /** api.schema / cli.schema — full manifest, or one operation's contract. */
  schema(operationId?: string): Record<string, unknown> {
    ensure();
    if (operationId) {
      const def = operationRegistry.get(operationId);
      if (!def) throw new ServiceError('resource_not_found', `unknown operation: ${operationId}`);
      return {
        id: def.id,
        version: def.version,
        title: def.title,
        kind: def.kind,
        risk: def.risk,
        inputSchema: def.inputSchema,
        outputSchema: def.outputSchema,
        http: def.http,
        cli: def.cli,
        mcp: def.mcp,
        transport: def.transport ?? 'remote',
      };
    }
    return operationRegistry.toManifest() as unknown as Record<string, unknown>;
  }

  /** api.version — the running API/CLI/MCP/registry versions. */
  version(): Record<string, unknown> {
    ensure();
    return {
      api_version: API_VERSION,
      cli_version: CLI_VERSION,
      mcp_protocol_version: MCP_PROTOCOL_VERSION,
      operation_registry_version: '1',
      plan_version: PLAN_VERSION,
      registered_operations: operationRegistry.list().length,
    };
  }

  /** mcp.tools — the MCP tools the host exposes (single source of truth). */
  tools(): { tools: Record<string, unknown>[]; total: number } {
    ensure();
    const tools = listTools();
    return { tools, total: tools.length };
  }

  /** mcp.resources — the MCP resources the host exposes. */
  resources(): { resources: Record<string, unknown>[]; total: number } {
    ensure();
    const resources = listResources();
    return { resources, total: resources.length };
  }

  /** mcp.prompts — the MCP prompts the host exposes. */
  prompts(): { prompts: Record<string, unknown>[]; total: number } {
    ensure();
    const prompts = listPrompts();
    return { prompts, total: prompts.length };
  }

  /** mcp.health — a liveness view of the MCP surface (no external calls). */
  health(): Record<string, unknown> {
    ensure();
    const info = serverInfo();
    return {
      ok: true,
      name: info.name,
      version: info.version,
      protocol_version: MCP_PROTOCOL_VERSION,
      tools: listTools().length,
      resources: listResources().length,
      prompts: listPrompts().length,
    };
  }

  /** cli.commands — every registered CLI command with its bound operation. */
  commands(): { commands: Record<string, unknown>[]; total: number } {
    ensure();
    const commands = operationRegistry.list().map((d) => ({
      command: d.cli?.command,
      operation_id: d.id,
      description: d.description ?? d.title,
      examples: d.cli?.examples ?? [],
    }));
    return { commands, total: commands.length };
  }

  /** cli.version — CLI + API + MCP versions. */
  cliVersion(): Record<string, unknown> {
    return {
      version: CLI_VERSION,
      api_version: API_VERSION,
      mcp_protocol_version: MCP_PROTOCOL_VERSION,
      supported_transports: ['stdio', 'http'],
    };
  }

  /** cli.doctor — a real diagnostic: DB reachability + registry integrity. */
  async doctor(): Promise<Record<string, unknown>> {
    ensure();
    let database = 'connected';
    try {
      await pool.query('SELECT 1');
    } catch {
      database = 'unreachable';
    }
    const problems = operationRegistry.validate();
    return {
      server: 'connected',
      database,
      registry_operations: operationRegistry.list().length,
      registry_valid: problems.length === 0,
      registry_problems: problems,
      llm_provider: config.llmProvider,
      ollama_url: config.ollama.url,
      chat_model: config.ollama.chatModel,
      embedding_model: config.ollama.embeddingModel,
      api_version: API_VERSION,
    };
  }
}

export const metaService = new MetaService();
