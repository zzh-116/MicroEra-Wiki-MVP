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

  // ── P3-02: lexical (Postgres FTS) over the same corpus ────────────────────
  const lex = await v2('POST', '/api/v2/ops/search/lexical', token, { query: 'pore aperture', kb_id: kb.id, top_k: 20, is_internal: true });
  check(Array.isArray(lex?.items) && lex.items.length >= 2, 'search.lexical (internal) returns ≥2 chunks');
  check(lex.items.every((x: any) => typeof x.score === 'number'), 'search.lexical returns a numeric score per hit');
  const lexScores = (lex.items as any[]).map((x) => x.score);
  check(lexScores.every((s, i) => i === 0 || lexScores[i - 1] >= s), 'search.lexical returns globally descending scores');

  const lexPub = await v2('POST', '/api/v2/ops/search/lexical', token, { query: 'pore aperture', kb_id: kb.id, top_k: 20, is_internal: false });
  check(Array.isArray(lexPub?.items) && lexPub.items.length > 0, 'search.lexical (public) returns hits');
  check(lexPub.items.every((x: any) => x.visibility === 'public'), 'search.lexical (public) excludes internal documents (DB-level ACL)');

  // Query normalization: extra whitespace + case are collapsed before FTS.
  const lexNorm = await v2('POST', '/api/v2/ops/search/lexical', token, { query: '  PORE   Aperture ', kb_id: kb.id, top_k: 20, is_internal: true });
  check(Array.isArray(lexNorm?.items) && lexNorm.items.length >= 2, 'search.lexical normalizes whitespace/case');

  // ── P3-03: hybrid RRF fusion + explain trace ──────────────────────────────
  const hyb = await v2('POST', '/api/v2/ops/search/hybrid', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true });
  check(Array.isArray(hyb?.items) && hyb.items.length >= 2, 'search.hybrid (internal) returns ≥2 chunks');
  const hybScores = (hyb.items as any[]).map((x) => x.score);
  check(hybScores.every((s, i) => i === 0 || hybScores[i - 1] >= s), 'search.hybrid returns descending RRF scores');

  const hybPub = await v2('POST', '/api/v2/ops/search/hybrid', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: false });
  check(Array.isArray(hybPub?.items) && hybPub.items.length > 0, 'search.hybrid (public) returns hits');
  check(hybPub.items.every((x: any) => x.visibility === 'public'), 'search.hybrid (public) excludes internal documents');

  const expl = await v2('POST', '/api/v2/ops/search/explain', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true });
  check(Array.isArray(expl?.items) && expl.items.length >= 2, 'search.explain returns a score trace');
  check(expl.items.every((x: any) => typeof x.rrf_score === 'number' && (x.vector !== null || x.lexical !== null)), 'search.explain exposes per-source ranks + rrf_score');

  // ── P3-04: rerank adapter over the hybrid hits (provider may fall back) ───
  const rerankDocs = (hyb.items as any[]).slice(0, 3).map((x) => ({ text: x.text, score: x.score }));
  const rr = await v2('POST', '/api/v2/ops/search/rerank', token, { query: QUERY, documents: rerankDocs, top_k: 3 });
  check(Array.isArray(rr?.items) && rr.items.length >= 1 && rr.items.length <= 3, 'search.rerank returns ≤top_k items');
  check(typeof rr?.provider === 'string' && typeof rr?.fallback === 'boolean' && typeof rr?.elapsed_ms === 'number', 'search.rerank returns provider/fallback/elapsed_ms');
  check(rr.items.every((x: any) => typeof x.index === 'number' && typeof x.text === 'string' && typeof x.original_score === 'number' && typeof x.rerank_score === 'number'), 'search.rerank returns a scoring trace per item');

  // ── P3-06: metadata-filtered retrieval + filter schema ─────────────────────
  const meta = await v2('GET', '/api/v2/ops/search/metadata', token);
  check(Array.isArray(meta?.methods) && meta.methods.includes('hybrid'), 'search.metadata returns retrieval methods');
  const fieldNames = (meta?.filterable_fields ?? []).map((f: any) => f.name);
  check(fieldNames.includes('visibility') && fieldNames.includes('document_ids') && fieldNames.includes('strategy'), 'search.metadata returns filterable fields');

  const byVisibility = await v2('POST', '/api/v2/ops/search/filtered', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true, filters: { visibility: 'public' } });
  check(Array.isArray(byVisibility?.items) && byVisibility.items.every((x: any) => x.visibility === 'public'), 'search.filtered (visibility=public) excludes internal documents');

  const byDoc = await v2('POST', '/api/v2/ops/search/filtered', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true, filters: { document_ids: [internal.document_id] } });
  check(Array.isArray(byDoc?.items) && byDoc.items.length > 0 && byDoc.items.every((x: any) => x.document_id === internal.document_id), 'search.filtered (document_ids) restricts to the named document');

  const byTitle = await v2('POST', '/api/v2/ops/search/filtered', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true, filters: { title_contains: 'Internal' } });
  check(Array.isArray(byTitle?.items) && byTitle.items.length > 0 && byTitle.items.every((x: any) => x.title.includes('Internal')), 'search.filtered (title_contains) matches the title substring');

  const byStrategy = await v2('POST', '/api/v2/ops/search/filtered', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true, filters: { strategy: 'markdown' } });
  check(Array.isArray(byStrategy?.items) && byStrategy.items.every((x: any) => x.strategy === 'markdown'), 'search.filtered (strategy) filters by chunking strategy');

  // Soft-delete the public document → its chunks vanish from the index.
  await v2('DELETE', '/api/v2/ops/doc/delete', token, { doc_id: publicDoc.document_id });
  const afterDelete = await v2('POST', '/api/v2/ops/search/vector', token, { query: QUERY, kb_id: kb.id, top_k: 20, is_internal: true });
  check(afterDelete.items.every((x: any) => x.document_id !== publicDoc.document_id), 'search.vector excludes soft-deleted documents');

  await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  console.log(`\nP3-01/P3-02/P3-03/P3-04/P3-06 smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
