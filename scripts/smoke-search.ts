// P3-01 live smoke — proves search.vector end-to-end over the real REST surface
// and real pgvector: login → kb.create → seed two documents with IDENTICAL
// content (one internal, one public) → ingest (parse→chunk→embed→publish) →
// search.vector. Asserts: global scored TopK ordering, DB-level visibility ACL
// (internal doc excluded when is_internal=false), and soft-delete exclusion.
//
// Run: npm run smoke:search   (server must already be up, e.g. `npm run server`)
import { parseApiService } from '../backend/services/parse-api.service.js';
import { ingestService } from '../backend/services/ingest.service.js';

const BASE = (process.env.MICROERA_HOST || 'http://localhost:3001').replace(/\/$/, '');

// Identical content so both documents embed identically — ACL is the only
// variable that should differ between the two, making the public-only assertion
// deterministic regardless of embedding quality.
const CONTENT = [
  '# Porous Framework Synthesis',
  '',
  'This paper describes a solvothermal synthesis route for a metal-organic framework with a tunable pore aperture in the microporous regime.',
  '',
  'The crystallinity and surface area are characterized by powder diffraction and nitrogen adsorption isotherms.',
].join('\n');
const QUERY = 'metal-organic framework pore aperture';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

async function raw(method: string, path: string, token: string | undefined, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
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

  // Public KB so a public-only caller can still see *something* inside it.
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `Search KB ${stamp}`, visibility: 'public' });
  check(!!kb?.id, 'kb.create returns an id');

  // Seed two documents with identical content — internal + public.
  const internal = await parseApiService.upload({ kb_id: kb.id, title: 'Internal paper', content: CONTENT, visibility: 'internal' });
  const publicDoc = await parseApiService.upload({ kb_id: kb.id, title: 'Public paper', content: CONTENT, visibility: 'public' });
  check(!!internal.document_id && !!publicDoc.document_id, 'parseApiService.upload seeds two documents');

  const ingA = await ingestService.ingest(internal.document_id);
  const ingB = await ingestService.ingest(publicDoc.document_id);
  check(ingA.chunks > 0 && ingB.chunks > 0, 'ingest embeds ≥1 chunk per document');
  if (ingA.chunks === 0 || ingB.chunks === 0) {
    console.error('Ingest produced no chunks (Ollama down or content below min chunk size) — aborting.');
    process.exit(1);
  }

  // Internal caller sees both documents.
  const all = await v2('POST', '/api/v2/ops/search/vector', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true });
  check(Array.isArray(all?.items) && all.items.length >= 2, 'search.vector (internal) returns ≥2 chunks');
  check(all.items.every((x: any) => typeof x.score === 'number'), 'search.vector returns a numeric score per hit');

  // Global scored TopK: results are ordered by descending score.
  const scores = (all.items as any[]).map((x) => x.score);
  check(scores.every((s, i) => i === 0 || scores[i - 1] >= s), 'search.vector returns globally descending scores');

  // Public-only caller: the internal document's chunks are filtered in SQL.
  const pub = await v2('POST', '/api/v2/ops/search/vector', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: false });
  check(Array.isArray(pub?.items) && pub.items.length > 0, 'search.vector (public) returns hits');
  check(pub.items.every((x: any) => x.visibility === 'public'), 'search.vector (public) excludes internal documents (DB-level ACL)');

  // Soft-delete the public document → its chunks vanish from the index.
  await v2('DELETE', '/api/v2/ops/doc/delete', token, { doc_id: publicDoc.document_id });
  const afterDelete = await v2('POST', '/api/v2/ops/search/vector', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true });
  check(afterDelete.items.every((x: any) => x.document_id !== publicDoc.document_id), 'search.vector excludes soft-deleted documents');

  await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  console.log(`\nP3-01 smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
