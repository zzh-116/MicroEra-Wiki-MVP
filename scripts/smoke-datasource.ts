// P7 live smoke — proves datasource.* (D01/D02/D04) end-to-end over the real
// REST surface and real Postgres: login → types → create a 'local' datasource →
// list/view/connect/preview → sync (imports the deterministic sample docs) →
// sync again (incremental, 0 new) → changes/cursor/logs → schedule/pause/resume
// → delete (soft) → view-after-delete returns resource_not_found.
//
// Run: npm run smoke:datasource   (server must already be up, e.g. `npm run server`)
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

  // ── D01: types / create / list / view / connect / preview ─────────────────
  const types = await v2('GET', '/api/v2/ops/datasource/types', token);
  check(Array.isArray(types?.connectors) && types.connectors.some((c: any) => c.name === 'local'), 'datasource.types includes the local connector');

  const created = await v2('POST', '/api/v2/ops/datasource/create', token, { name: `Local Sample ${stamp}`, connector: 'local' });
  check(!!created?.id && created.connector === 'local', 'datasource.create returns a local datasource');
  const did = created.id;

  const list = await v2('GET', '/api/v2/ops/datasource/list', token);
  check(Array.isArray(list?.items) && list.items.some((d: any) => d.id === did), 'datasource.list includes the created datasource');

  const view = await v2('GET', '/api/v2/ops/datasource/view', token, { datasource_id: did });
  check(view?.id === did && view.name.startsWith('Local Sample'), 'datasource.view returns the datasource');

  const connected = await v2('POST', '/api/v2/ops/datasource/connect', token, { datasource_id: did });
  check(connected?.connected === true, 'datasource.connect reports connected');

  const preview = await v2('POST', '/api/v2/ops/datasource/preview', token, { datasource_id: did });
  check(preview?.total === 3 && Array.isArray(preview?.documents), 'datasource.preview lists 3 sample docs');

  // ── D02: sync / changes / cursor / logs ───────────────────────────────────
  const sync1 = await v2('POST', '/api/v2/ops/datasource/sync', token, { datasource_id: did });
  // Idempotent: on a shared dev DB the 3 sample docs may already be imported by a
  // prior run (deduped by source), so accept `created + skipped === 3` rather than
  // requiring `created === 3` (B1).
  const imported1 = (sync1?.created ?? 0) + (sync1?.skipped ?? 0);
  check(sync1?.total === 3 && imported1 === 3, 'datasource.sync imports 3 docs (idempotent: created + skipped)');
  check(!!sync1?.cursor, 'datasource.sync advances the cursor');

  const sync2 = await v2('POST', '/api/v2/ops/datasource/sync', token, { datasource_id: did });
  check(sync2?.total === 0 && sync2.created === 0, 'datasource.sync is incremental (0 new after cursor)');

  const changes = await v2('GET', '/api/v2/ops/datasource/changes', token, { datasource_id: did, since: '2026-01-01T00:00:00.000Z' });
  check(changes?.changed === 3, 'datasource.changes with old since returns 3 changed docs');

  const cursor = await v2('GET', '/api/v2/ops/datasource/cursor', token, { datasource_id: did });
  check(!!cursor?.cursor, 'datasource.cursor returns the saved cursor');

  const logs = await v2('GET', '/api/v2/ops/datasource/logs', token, { datasource_id: did });
  check(Array.isArray(logs?.items) && logs.items.length >= 2, 'datasource.logs lists ≥2 sync runs');

  // ── D04: schedule / pause / resume / delete ───────────────────────────────
  const scheduled = await v2('POST', '/api/v2/ops/datasource/schedule', token, { datasource_id: did, schedule: '0 3 * * *' });
  check(scheduled?.schedule === '0 3 * * *', 'datasource.schedule sets the cron string');

  const paused = await v2('POST', '/api/v2/ops/datasource/pause', token, { datasource_id: did });
  check(paused?.status === 'paused', 'datasource.pause sets status paused');

  const resumed = await v2('POST', '/api/v2/ops/datasource/resume', token, { datasource_id: did });
  check(resumed?.status === 'active', 'datasource.resume sets status active');

  const del = await v2('DELETE', '/api/v2/ops/datasource/delete', token, { datasource_id: did });
  check(del?.deleted === true, 'datasource.delete soft-removes the datasource');

  const after = await raw('GET', `/api/v2/ops/datasource/view${qs({ datasource_id: did })}`, token);
  check(after.status === 404 && after.json?.error?.type === 'resource.not_found', 'datasource.view after delete returns resource_not_found');

  console.log(`\nP7 datasource smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
