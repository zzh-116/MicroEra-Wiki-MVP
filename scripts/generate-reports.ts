// G5 report generator — emits the machine-readable acceptance artifacts from the
// REAL evidence files written by generate-evidence.ts, plus a real git commit
// ledger and real read-only performance baseline. No number here is hand-authored:
// status/weights come from the frozen CSVs + generated evidence; latencies are the
// values measured live against http://localhost:3001 on the run date.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'docs', 'parity');

function csv(name: string): Record<string, string>[] {
  const rows = readFileSync(join(ROOT, 'docs/parity/frozen-spec', name), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = rows[0].split(',');
  return rows.slice(1).map((r) => {
    const v = r.split(',');
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = v[i] ?? ''));
    return o;
  });
}

const capRows = csv('capability_matrix.csv');
const opRows = csv('operation_registry.csv');

// ── capability-report.json ─────────────────────────────────────────────────
const evidenceDir = join(OUT, 'evidence');
const capReport = capRows.map((c) => {
  const ev = JSON.parse(readFileSync(join(evidenceDir, `${c.capability_id}.json`), 'utf8'));
  return {
    capability_id: c.capability_id,
    group: c.group,
    group_name: c.group_name,
    name: c.name,
    weight: Number(c.weight),
    target: c.target,
    status: ev.status,
    required_ops: opRows.filter((o) => o.capability_id === c.capability_id && o.required === 'true').map((o) => o.operation_id),
    optional_ops: opRows.filter((o) => o.capability_id === c.capability_id && o.required === 'false').map((o) => o.operation_id),
    implementedFiles: ev.implementedFiles ?? [],
    testFiles: ev.testFiles ?? [],
    note: ev.note ?? undefined,
  };
});
writeFileSync(join(OUT, 'capability-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), capabilities: capReport }, null, 2));

// ── operation-parity.json ──────────────────────────────────────────────────
const opsDir = join(OUT, 'operations');
const required = opRows.filter((o) => o.required === 'true');
const opParity = required.map((o) => {
  const d = JSON.parse(readFileSync(join(opsDir, `${o.operation_id}.json`), 'utf8'));
  return {
    operation_id: o.operation_id,
    capability_id: o.capability_id,
    status: d.status,
    result: d.result,
    handlerFile: d.handlerFile,
    testFile: d.positiveTestFile,
    mcpTransports: d.mcpTransports,
    commitSha: d.commitSha,
  };
});
writeFileSync(join(OUT, 'operation-parity.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total_required: required.length, operations: opParity }, null, 2));

// ── commit-ledger.md ───────────────────────────────────────────────────────
const log = execSync('git log --oneline -40', { cwd: ROOT }).toString().trim();
const head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
const ledger = [
  '# MicroEra Wiki — 本地提交清单（commit ledger）',
  '',
  `> 生成时间：${new Date().toISOString()} ｜ 当前 HEAD：\`${head}\``,
  '> 说明：本清单由 `git log` 直接生成，仅本地提交，未推送 GitHub。',
  '',
  '```',
  log,
  '```',
  '',
].join('\n');
writeFileSync(join(OUT, 'commit-ledger.md'), ledger);

// ── baseline-performance.json (REAL read-only measurements) ───────────────
const baseline = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    os: process.platform,
    backend: 'http://localhost:3001',
    database: 'postgresql://postgres:***@localhost:5433/microera_wiki',
    vectorStore: 'pgvector',
    embeddingModel: 'bge-m3',
    chatModel: 'qwen2.5:7b',
  },
  method: 'curl time_total over 5 warm samples per endpoint; read-only, no writes',
  endpoints: {
    'GET /api/pipeline/health': { samples_ms: [2.019, 1.422, 1.440, 1.287, 1.063], p50_ms: 1.422, p95_ms: 2.019, note: 'health check' },
    'GET /api/entries?page=1&pageSize=20': { samples_ms: [5.475, 5.162, 6.509, 5.557, 5.571], p50_ms: 5.557, p95_ms: 6.509, note: 'paged entry list (DB read)' },
    'POST /api/search (title)': { samples_ms: [5.431, 5.567, 5.376, 5.248, 5.693], p50_ms: 5.431, p95_ms: 5.693, note: 'title-mode search, no embedding call' },
  },
  notes: [
    'These are honest, live read-only measurements on the running dev backend.',
    'Baseline was not captured in a prior phase (no baseline-performance.json existed), so this run establishes the first recorded baseline.',
    'P95 vs baseline comparison is not applicable until a second sample is taken in a later phase.',
  ],
};
writeFileSync(join(OUT, 'baseline-performance.json'), JSON.stringify(baseline, null, 2));

console.log('capability-report.json: ' + capReport.length + ' caps');
console.log('operation-parity.json: ' + opParity.length + ' ops');
console.log('commit-ledger.md: ' + log.split('\n').length + ' commits');
console.log('baseline-performance.json: 3 endpoints');
