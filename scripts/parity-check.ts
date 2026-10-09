// parity:check — honest coverage reporter. Cross-references the frozen
// operation_registry.csv against the runtime OperationRegistry and reports how
// many *required* operations have a handler + CLI command + MCP tool.
//
// This never fakes results: at P0 the count is intentionally small and grows
// phase by phase. Writes docs/parity/coverage.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { operationRegistry } from '../packages/operation-registry/src/registry.js';
import { registerOperations } from '../packages/operation-registry/src/operations.js';
import { ApiClient } from '../packages/operation-registry/src/http-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Register operations with a non-connecting client (handlers aren't invoked here).
registerOperations(new ApiClient({ baseUrl: 'http://localhost:3001' }));

const csvPath = path.join(root, 'docs', 'parity', 'frozen-spec', 'operation_registry.csv');
const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
const lines = raw.trim().split(/\r?\n/);
const header = lines[0].split(',');

const rows = lines.slice(1).map((line) => {
  const cols = line.split(',');
  const rec: Record<string, string> = {};
  header.forEach((h, i) => { rec[h] = cols[i]; });
  return rec;
});

const required = rows.filter((r) => r.required === 'true');
const totalRequired = required.length;

const registered = new Set(operationRegistry.list().map((d) => d.id));
let withHandler = 0;
let withCli = 0;
let withMcp = 0;
let fullParity = 0;
const fullParityIds: string[] = [];

for (const op of required) {
  const def = operationRegistry.get(op.operation_id);
  if (!def) continue;
  if (def.handler) withHandler++;
  if (def.cli?.command) withCli++;
  if (def.mcp?.toolName) withMcp++;
  if (def.handler && def.cli?.command && def.mcp?.toolName) {
    fullParity++;
    fullParityIds.push(op.operation_id);
  }
}

const missingIds = required.filter((r) => !registered.has(r.operation_id)).map((r) => r.operation_id);
const contractOnlyIds = required.filter((r) => {
  const d = operationRegistry.get(r.operation_id);
  return d && !d.handler;
}).map((r) => r.operation_id);

const coveragePercent = totalRequired === 0 ? 0 : Math.round((fullParity / totalRequired) * 1000) / 10;

const report = {
  generatedAt: new Date().toISOString(),
  planVersion: '2026-10-09-v1',
  totalRequiredOps: totalRequired,
  registeredOps: registered.size,
  withHandler,
  withCli,
  withMcp,
  fullParityOps: fullParity,
  coveragePercent,
  fullParityIds,
  contractOnlyIds,
  missingIds,
  note: 'Full parity = handler + cli.command + mcp.toolName for a required operation. Grows phase by phase; target is 100% of 162 required ops at P9.',
};

const outPath = path.join(root, 'docs', 'parity', 'coverage.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

console.log(`parity:check — required ops ${totalRequired}, full-parity ${fullParity} (${coveragePercent}%), registered ${registered.size}, contract-only ${contractOnlyIds.length}, missing ${missingIds.length}`);
console.log(`report written to docs/parity/coverage.json`);
process.exit(0);
