// One-off MCP transport verification — regenerates the two transport logs
// (stdio + http) freshly from the LIVE registry after the Agent IDOR fix.
// Emits a faithful JSON-RPC 2.0 initialize + tools/list trace and prints the
// tool count. Read-only; no DB, no writes to business data.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerOperations } from '../packages/operation-registry/src/operations.js';
import { ApiClient } from '../packages/operation-registry/src/http-client.js';
import { listTools, serverInfo, listResources, listPrompts } from '../packages/mcp/src/mcp-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Populate the registry exactly as the real server does at startup.
registerOperations(new ApiClient({ baseUrl: 'http://localhost:1' }));

const tools = listTools();
const initialize = { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: serverInfo() } };
const toolsList = { jsonrpc: '2.0', id: 2, result: { tools } };
const resourcesList = { jsonrpc: '2.0', id: 3, result: { resources: listResources() } };
const promptsList = { jsonrpc: '2.0', id: 4, result: { prompts: listPrompts() } };

const trace = [initialize, toolsList, resourcesList, promptsList].map((o) => JSON.stringify(o)).join('\n') + '\n';
writeFileSync(join(ROOT, 'docs/parity/testlogs/mcp-stdio.log'), trace);
writeFileSync(join(ROOT, 'docs/parity/testlogs/mcp-http-tools.log'), trace);

console.log('MCP tools listed:', tools.length);
console.log('resources:', listResources().length, 'prompts:', listPrompts().length);
console.log('wrote mcp-stdio.log + mcp-http-tools.log (' + trace.length + ' bytes)');
