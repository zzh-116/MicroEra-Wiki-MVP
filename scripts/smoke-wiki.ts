// P5 live smoke — proves wiki.* / graph.* end-to-end over the real REST surface
// and real Postgres: login → seed a KB + document → wiki.generate (synthesis +
// grounding) → status/list/read/search → sources/citation_read/verify → CRUD +
// versioning (create/edit/diff/revert/revisions) → links/graph/neighbors/search
// → unlink → delete.
// Asserts: generation grounds ≥1 source, versioning appends revisions, and the
// link graph reflects created edges.
//
// Run: npm run smoke:wiki   (server must already be up, e.g. `npm run server`)
import { parseApiService } from '../backend/services/parse-api.service.js';
import { ingestService } from '../backend/services/ingest.service.js';

const BASE = (process.env.MICROERA_HOST || 'http://localhost:3001').replace(/\/$/, '');

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) { console.error('ADMIN_PASSWORD env var is required (set it to the local admin password)'); process.exit(1); }

const CONTENT = 'This document discusses zeolite catalysis and its applications in green chemistry and sustainable materials synthesis.';

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

function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function v2(method: string, path: string, token: string, input?: Record<string, unknown>): Promise<any> {
  const full = method === 'GET' || method === 'DELETE' ? `${path}${qs(input ?? {})}` : path;
  const json = await raw(method, full, token, method === 'GET' || method === 'DELETE' ? undefined : input);
  if (!json?.ok) throw new Error(`${method} ${path} → wire fail: ${JSON.stringify(json?.error)}`);
  return json.data;
}

async function main() {
  const login = await raw('POST', '/api/auth/login', undefined, { username: 'admin', password: adminPassword });
  const token = login?.token ?? login?.data?.token;
  check(!!token, 'auth: admin login returns a token');
  if (!token) { console.error('Cannot continue without a token.'); process.exit(1); }

  const stamp = Date.now();
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `Wiki KB ${stamp}`, visibility: 'internal' });
  check(!!kb?.id, 'kb.create returns an id');

  const doc = await parseApiService.upload({ kb_id: kb.id, title: 'Zeolite catalysis paper', content: CONTENT, visibility: 'internal' });
  const ing = await ingestService.ingest(doc.document_id);
  check(!!doc.document_id && ing.chunks > 0, 'upload + ingest seed ≥1 chunk');
  if (!doc.document_id || ing.chunks === 0) { console.error('No chunks to retrieve — aborting.'); process.exit(1); }

  // ── W01: generate / status / list / read / search ─────────────────────────
  const gen = await v2('POST', '/api/v2/ops/wiki/generate', token, { title: 'Zeolite catalysis', kb_id: kb.id, method: 'hybrid', top_k: 4 });
  check(!!gen?.wiki_id && gen.status === 'completed', 'wiki.generate returns a completed wiki id');
  check(gen.source_count > 0, 'wiki.generate grounds ≥1 source');
  const wid = gen.wiki_id;

  const status = await v2('GET', '/api/v2/ops/wiki/status', token, { wiki_id: wid });
  check(status?.status === 'completed' && status.revision_no === 1, 'wiki.status reports completed + revision 1');

  const list = await v2('GET', '/api/v2/ops/wiki/list', token);
  check(Array.isArray(list?.items) && list.items.some((w: any) => w.id === wid), 'wiki.list includes the generated wiki');

  const read = await v2('GET', '/api/v2/ops/wiki/read', token, { wiki_id: wid });
  check(typeof read?.content === 'string' && read.content.length > 0, 'wiki.read returns the article content');

  const search = await v2('POST', '/api/v2/ops/wiki/search', token, { q: 'zeolite' });
  check(Array.isArray(search?.items) && search.items.some((w: any) => w.id === wid), 'wiki.search finds the generated wiki');

  // ── W02: sources / citation_read / verify ────────────────────────────────
  const sources = await v2('GET', '/api/v2/ops/wiki/sources', token, { wiki_id: wid });
  check(Array.isArray(sources?.sources) && sources.sources.length > 0, 'wiki.sources returns grounding anchors');

  const citeRead = await v2('GET', '/api/v2/ops/wiki/citation_read', token, { chunk_id: sources.sources[0].chunk_id });
  check(typeof citeRead?.text === 'string' && typeof citeRead?.title === 'string', 'wiki.citation_read resolves chunk text + title');

  const verify = await v2('POST', '/api/v2/ops/wiki/verify', token, { wiki_id: wid });
  check(verify?.resolved === verify?.total && verify.resolved > 0, 'wiki.verify resolves every source');

  // ── W04: create / edit / diff / revert / revisions ────────────────────────
  const manual = await v2('POST', '/api/v2/ops/wiki/create', token, { title: 'Manual page', content: '# Manual\n\nhello world', summary: 's' });
  check(!!manual?.id && manual.status === 'draft', 'wiki.create returns a draft page');
  const mid = manual.id;

  const edited = await v2('PATCH', '/api/v2/ops/wiki/edit', token, { wiki_id: mid, content: '# Manual\n\nhello world\n\nnew paragraph' });
  check(edited?.revision_no === 2, 'wiki.edit bumps revision_no to 2');

  const diff = await v2('POST', '/api/v2/ops/wiki/diff', token, { wiki_id: mid });
  check(diff?.changed === true && diff.added_lines >= 1, 'wiki.diff detects the added paragraph');

  const reverted = await v2('POST', '/api/v2/ops/wiki/revert', token, { wiki_id: mid, revision_no: 1 });
  check(reverted?.new_revision_no === 3, 'wiki.revert appends a new revision (3)');

  const revs = await v2('GET', '/api/v2/ops/wiki/revisions', token, { wiki_id: mid });
  check(revs?.total === 3, 'wiki.revisions lists all 3 revisions');

  // ── W03: link / links / graph / neighbors / search / unlink ───────────────
  const link = await v2('POST', '/api/v2/ops/wiki/link', token, { source_wiki_id: wid, target_wiki_id: mid });
  check(link?.source_wiki_id === wid && link?.target_wiki_id === mid, 'wiki.link creates a directed edge');

  const links = await v2('GET', '/api/v2/ops/wiki/links', token, { wiki_id: wid });
  check(links?.outgoing?.length === 1, 'wiki.links reports the outgoing edge');

  const graph = await v2('GET', '/api/v2/ops/wiki/graph', token);
  check(Array.isArray(graph?.nodes) && graph.nodes.length >= 2 && graph.edges.length >= 1, 'wiki.graph returns nodes + edges');

  const neighbors = await v2('GET', '/api/v2/ops/graph/neighbors', token, { wiki_id: wid, depth: 1 });
  check(Array.isArray(neighbors?.neighbors) && neighbors.neighbors.some((n: any) => n.id === mid), 'graph.neighbors reaches the linked wiki');

  const gsearch = await v2('POST', '/api/v2/ops/graph/search', token, { q: 'Manual' });
  check(Array.isArray(gsearch?.nodes) && gsearch.nodes.some((n: any) => n.id === mid), 'graph.search finds the manual node');

  const unlink = await v2('POST', '/api/v2/ops/wiki/unlink', token, { source_wiki_id: wid, target_wiki_id: mid });
  check(unlink?.removed === true, 'wiki.unlink removes the edge');

  // ── W04: delete (destructive) ─────────────────────────────────────────────
  const del = await v2('DELETE', '/api/v2/ops/wiki/delete', token, { wiki_id: mid });
  check(del?.deleted === true, 'wiki.delete soft-removes the page');

  const rawRead = await fetch(`${BASE}/api/v2/ops/wiki/read${qs({ wiki_id: mid })}`, { headers: { authorization: `Bearer ${token}` } });
  const rawBody = await rawRead.json();
  check(rawRead.status === 404 && rawBody?.error?.type === 'resource.not_found', 'wiki.read after delete returns resource_not_found');

  await v2('DELETE', '/api/v2/ops/wiki/delete', token, { wiki_id: wid });
  await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  console.log(`\nP5 wiki smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
