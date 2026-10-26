// P8 live smoke — proves model.* (M01/M03) and the generic job.* (O01) ops
// end-to-end over the real REST surface and real Postgres: login → model CRUD +
// test/set_default/rerank_list/rerank_test → create a KB + upload a doc to get a
// real durable job → wait/cancel/events/retry/artifacts.
//
// Run: npm run smoke:model   (server must already be up, e.g. `npm run server`)
const BASE = (process.env.MICROERA_HOST || 'http://localhost:3001').replace(/\/$/, '');

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) { console.error('ADMIN_PASSWORD env var is required (set it to the local admin password)'); process.exit(1); }

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
  return { status: res.status, ok: res.ok, json };
}

function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function v2(method: string, path: string, token: string, input?: Record<string, unknown>): Promise<any> {
  const full = method === 'GET' || method === 'DELETE' ? `${path}${qs(input ?? {})}` : path;
  const { json } = await raw(method, full, token, method === 'GET' || method === 'DELETE' ? undefined : input);
  if (!json?.ok) throw new Error(`${method} ${path} → wire fail: ${JSON.stringify(json?.error)}`);
  return json.data;
}

async function main() {
  const { json: login } = await raw('POST', '/api/auth/login', undefined, { username: 'admin', password: adminPassword });
  const token = login?.token ?? login?.data?.token;
  check(!!token, 'auth: admin login returns a token');
  if (!token) { console.error('Cannot continue without a token.'); process.exit(1); }

  const stamp = Date.now();

  // ── M01: model CRUD + test + set_default ────────────────────────────────
  const created = await v2('POST', '/api/v2/ops/model/create', token, {
    name: `Local LLM ${stamp}`, kind: 'llm', provider: 'ollama', model_name: 'qwen2.5:7b',
  });
  check(!!created?.id && created.kind === 'llm', 'model.create returns an llm model');
  const mid = created.id;

  const list = await v2('GET', '/api/v2/ops/model/list', token, { kind: 'llm' });
  check(Array.isArray(list?.items) && list.items.some((m: any) => m.id === mid), 'model.list includes the created model');

  const view = await v2('GET', '/api/v2/ops/model/view', token, { model_id: mid });
  check(view?.id === mid && view.model_name === 'qwen2.5:7b', 'model.view returns the model');

  const updated = await v2('PATCH', '/api/v2/ops/model/update', token, { model_id: mid, name: `Renamed ${stamp}` });
  check(updated?.name === `Renamed ${stamp}`, 'model.update renames the model');

  const tested = await v2('POST', '/api/v2/ops/model/test', token, { model_id: mid });
  check(typeof tested?.reachable === 'boolean' && tested.model_id === mid, 'model.test reports reachability (offline-safe)');

  const def = await v2('POST', '/api/v2/ops/model/set_default', token, { model_id: mid });
  check(def?.is_default === true, 'model.set_default flags the model default');

  // ── M03: rerank_list / rerank_test ───────────────────────────────────────
  const rerankList = await v2('GET', '/api/v2/ops/model/rerank_list', token);
  check(Array.isArray(rerankList?.providers) && rerankList.providers.length > 0, 'model.rerank_list returns providers');

  const rerankTest = await v2('POST', '/api/v2/ops/model/rerank_test', token, {
    query: 'materials science', documents: [{ text: 'paper about catalysts' }, { text: 'paper about cooking' }],
  });
  check(typeof rerankTest?.fallback === 'boolean' && Array.isArray(rerankTest?.items) && rerankTest.items.length === 2, 'model.rerank_test scores 2 documents');

  // ── M01: delete ──────────────────────────────────────────────────────────
  const del = await v2('DELETE', '/api/v2/ops/model/delete', token, { model_id: mid });
  check(del?.deleted === true, 'model.delete soft-removes the model');

  const after = await raw('GET', `/api/v2/ops/model/view${qs({ model_id: mid })}`, token);
  check(after.status === 404 && after.json?.error?.type === 'resource.not_found', 'model.view after delete returns resource_not_found');

  // ── O01: generic job dashboard over the durable queue ───────────────────
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `P8 Smoke KB ${stamp}` });
  check(!!kb?.id, 'kb.create returns a KB id');
  const kbid = kb.id;

  const up = await v2('POST', '/api/v2/ops/doc/upload', token, { kb_id: kbid, title: `Smoke Doc ${stamp}`, content: '# P8 smoke\n\na tiny document' });
  check(!!up?.job_id && !!up?.document_id, 'doc.upload returns a durable job id');
  const jobId = up.job_id;

  const waitPending = await v2('GET', '/api/v2/ops/job/wait', token, { job_id: jobId, timeout_ms: 300, interval_ms: 50 });
  check(waitPending?.status === 'pending' && waitPending.timed_out === true, 'job.wait times out on a never-processed job');

  const ev1 = await v2('GET', '/api/v2/ops/job/events', token, { job_id: jobId });
  check(Array.isArray(ev1?.items) && ev1.items.some((e: any) => e.type === 'enqueued'), 'job.events includes the enqueued event');

  const cancelled = await v2('POST', '/api/v2/ops/job/cancel', token, { job_id: jobId });
  check(cancelled?.status === 'cancelled', 'job.cancel cancels the pending job');

  const waitDone = await v2('GET', '/api/v2/ops/job/wait', token, { job_id: jobId, timeout_ms: 2000 });
  check(waitDone?.finished === true && waitDone.status === 'cancelled', 'job.wait returns finished on a cancelled job');

  const ev2 = await v2('GET', '/api/v2/ops/job/events', token, { job_id: jobId });
  check(Array.isArray(ev2?.items) && ev2.items.some((e: any) => e.type === 'cancelled'), 'job.events includes the cancelled event');

  const retried = await v2('POST', '/api/v2/ops/job/retry', token, { job_id: jobId });
  check(retried?.status === 'pending', 'job.retry requeues the cancelled job');

  const artifacts = await v2('GET', '/api/v2/ops/job/artifacts', token, { job_id: jobId });
  check(Array.isArray(artifacts?.items) && artifacts.items.some((a: any) => a.kind === 'document' && a.name.startsWith('Smoke Doc')), 'job.artifacts returns the produced document');

  console.log(`\nP8 model/job smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
