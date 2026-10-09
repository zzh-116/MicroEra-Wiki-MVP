// Read-only smoke harness for the legacy REST surface (P0-05).
//
// Verifies the pre-existing routes still answer correctly after the P0 security
// and skeleton changes WITHOUT wiping or mutating the database. Every request is
// a GET or a non-mutating POST search; nothing is created, updated, or deleted.
//
// Run against a live server:  npm run server  (then)  npm run smoke
// Exits 0 on full pass, 1 if any check fails or the server is unreachable.

const BASE = process.env.MICROERA_HOST || process.env.MICROERA_API_URL || 'http://localhost:3001';

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  const text = await res.text();
  let body: any = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body };
}

async function main(): Promise<number> {
  // 1. Health
  try {
    const { status, body } = await getJson('/api/pipeline/health');
    record('GET /api/pipeline/health', status === 200 && body?.status === 'ok', `HTTP ${status} status=${body?.status}`);
  } catch (err: any) {
    record('GET /api/pipeline/health', false, `unreachable: ${err.message}`);
    console.error('Server unreachable — start it first with `npm run server`.');
    return 1;
  }

  // 2. Entries (paged, read-only)
  const entries = await getJson('/api/entries?page=1&pageSize=5');
  record(
    'GET /api/entries',
    entries.status === 200 && Array.isArray(entries.body?.entries),
    `HTTP ${entries.status} entries=${Array.isArray(entries.body?.entries) ? entries.body.entries.length : 'n/a'}`,
  );

  // 3. Auth identity (anonymous — must be 401 or explicit not-logged-in)
  const me = await getJson('/api/auth/me');
  const meOk = me.status === 401 || (me.status === 200 && me.body?.isLoggedIn === false);
  record('GET /api/auth/me', meOk, `HTTP ${me.status} body=${JSON.stringify(me.body)}`);

  // 4. Search (title mode, ASCII — deterministic, no embedding dependency)
  const search = await fetch(`${BASE}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'Friday', searchMode: 'title' }),
  });
  const sBody = await search.json().catch(() => ({}));
  const leakedInternal = Array.isArray(sBody.results)
    ? sBody.results.some((r: any) => r.visibility && r.visibility !== 'public')
    : false;
  record(
    'POST /api/search (title)',
    search.status === 200 && Array.isArray(sBody.results) && !leakedInternal,
    `HTTP ${search.status} results=${sBody.results?.length ?? 'n/a'} leakedInternal=${leakedInternal}`,
  );

  // Report
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
    if (!c.pass) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
