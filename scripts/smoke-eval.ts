// P3-05 live smoke — proves eval.* end-to-end over the real REST surface and
// real Postgres: login → kb.create → seed a matching + an unrelated document →
// ingest → eval.dataset_create (relevance judgement) → eval.run (lexical, no
// embedder dependency) → eval.report → eval.compare → eval.dataset_list.
// Asserts: recall@k/MRR are computed against ground truth, the matching doc is
// retrieved, and report/compare read back persisted runs.
//
// Run: npm run smoke:eval   (server must already be up, e.g. `npm run server`)
import { parseApiService } from '../backend/services/parse-api.service.js';
import { ingestService } from '../backend/services/ingest.service.js';

const BASE = (process.env.MICROERA_HOST || 'http://localhost:3001').replace(/\/$/, '');

const MATCH_CONTENT = 'This document discusses zeolite catalysis and its applications in green chemistry and sustainable materials synthesis.';
const UNRELATED_CONTENT = 'A historical overview of medieval manuscript illumination techniques across European scriptoria.';
const QUERY = 'zeolite catalysis';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

async function raw(method: string, path: string, token: string | undefined, body?: unknown): Promise<any> {
  const isBodyless = method === 'GET' || method === 'HEAD';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: !isBodyless && body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

async function v2(method: string, path: string, token: string, input?: Record<string, unknown>): Promise<any> {
  const json = await raw(method, path, token, input);
  if (!json?.ok) throw new Error(`${method} ${path} → wire fail: ${JSON.stringify(json?.error)}`);
  return json.data;
}

async function main() {
  const login = await raw('POST', '/api/auth/login', undefined, { username: 'admin', password: 'admin123' });
  const token = login?.token ?? login?.data?.token;
  check(!!token, 'auth: admin login returns a token');
  if (!token) { console.error('Cannot continue without a token.'); process.exit(1); }

  const stamp = Date.now();
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `Eval KB ${stamp}`, visibility: 'internal' });
  check(!!kb?.id, 'kb.create returns an id');

  const match = await parseApiService.upload({ kb_id: kb.id, title: 'Zeolite catalysis paper', content: MATCH_CONTENT, visibility: 'internal' });
  const unrelated = await parseApiService.upload({ kb_id: kb.id, title: 'Manuscript illumination', content: UNRELATED_CONTENT, visibility: 'internal' });
  check(!!match.document_id && !!unrelated.document_id, 'parseApiService.upload seeds two documents');

  const ingA = await ingestService.ingest(match.document_id);
  const ingB = await ingestService.ingest(unrelated.document_id);
  check(ingA.chunks > 0 && ingB.chunks > 0, 'ingest embeds ≥1 chunk per document');
  if (ingA.chunks === 0) { console.error('Ingest produced no chunks — aborting.'); process.exit(1); }

  // ── eval.dataset_create (relevance judgement: only the matching doc is relevant) ──
  const ds = await v2('POST', '/api/v2/ops/eval/dataset_create', token, {
    name: `Eval set ${stamp}`,
    kb_id: kb.id,
    method: 'lexical',
    queries: [{ query: QUERY, relevant_document_ids: [match.document_id] }],
  });
  check(!!ds?.id && Array.isArray(ds?.items) && ds.items.length === 1, 'eval.dataset_create returns a dataset with 1 judgement');

  // ── eval.run (lexical — no embedder dependency) ───────────────────────────
  const run = await v2('POST', '/api/v2/ops/eval/run', token, { dataset_id: ds.id, method: 'lexical', top_k: 5 });
  check(!!run?.run_id && typeof run.run_id === 'string', 'eval.run returns a run id');
  check(typeof run?.metrics?.recall_at_k === 'number' && typeof run?.metrics?.mrr === 'number' && typeof run?.metrics?.ndcg_at_k === 'number', 'eval.run returns recall_at_k/mrr/ndcg_at_k metrics');
  check(run.metrics.num_queries === 1, 'eval.run scores exactly one query');
  check(run.per_query?.[0]?.retrieved_document_ids?.includes(match.document_id), 'eval.run retrieves the relevant document');
  check(run.per_query?.[0]?.recall_at_k > 0 && run.per_query?.[0]?.mrr > 0, 'eval.run yields positive recall + MRR');

  // ── eval.report ───────────────────────────────────────────────────────────
  const rep = await v2('POST', '/api/v2/ops/eval/report', token, { run_id: run.run_id });
  check(rep?.run_id === run.run_id && typeof rep?.metrics?.recall_at_k === 'number', 'eval.report reads the persisted run back');

  // ── eval.compare (two runs) ───────────────────────────────────────────────
  const run2 = await v2('POST', '/api/v2/ops/eval/run', token, { dataset_id: ds.id, method: 'lexical', top_k: 3 });
  const cmp = await v2('POST', '/api/v2/ops/eval/compare', token, { run_ids: [run.run_id, run2.run_id] });
  check(cmp?.baseline_run_id === run.run_id && cmp?.runs?.length === 2, 'eval.compare returns the two runs side-by-side');
  check(Array.isArray(cmp?.deltas) && cmp.deltas.length === 1 && typeof cmp.deltas[0].recall_at_k_delta === 'number', 'eval.compare returns metric deltas vs baseline');

  // ── eval.dataset_list ─────────────────────────────────────────────────────
  const list = await v2('GET', '/api/v2/ops/eval/dataset_list', token);
  check(Array.isArray(list?.items) && list.items.some((d: any) => d.id === ds.id), 'eval.dataset_list includes the created dataset');
  check(list.items.find((d: any) => d.id === ds.id)?.item_count === 1, 'eval.dataset_list reports item_count');

  await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  console.log(`\nP3-05 eval smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
