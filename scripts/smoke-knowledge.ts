// P1-03 live smoke — proves the KB / folder / document / revision vertical
// slice over the real REST surface (login → kb.create → folder CRUD → doc CRUD
// → revisions → restore) against the running dev server.
//
// Document *creation* has no public REST route until P2 (doc.upload), so this
// script seeds one document through the same internal service the backfill uses
// (knowledgeService.createDocumentWithRevision) and then drives every public
// doc.* verb over HTTP.
//
// Run: npm run smoke:knowledge   (server must already be up, e.g. `npm run server`)
import { knowledgeService } from '../backend/services/knowledge.service.js';

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

/** Call a v2 op and assert the wire envelope is ok; returns data. */
async function v2(method: string, path: string, token: string, input?: Record<string, unknown>): Promise<any> {
  const isGet = method === 'GET' || method === 'DELETE';
  const url = isGet && input ? `${path}?${new URLSearchParams(Object.entries(input).map(([k, v]) => [k, String(v)]))}` : path;
  const json = await raw(method, url, token, isGet ? undefined : input);
  if (!json?.ok) throw new Error(`${method} ${path} → wire fail: ${JSON.stringify(json?.error)}`);
  return json.data;
}

async function main() {
  // 1. Authenticate.
  const login = await raw('POST', '/api/auth/login', undefined, { username: 'admin', password: adminPassword });
  const token = login?.token ?? login?.data?.token;
  check(!!token, 'auth: admin login returns a token');
  if (!token) { console.error('Cannot continue without a token.'); process.exit(1); }

  const stamp = Date.now();

  // 2. KB create / list / view / update / status / check.
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `Smoke KB ${stamp}`, visibility: 'internal' });
  check(!!kb?.id, 'kb.create returns an id');
  check(kb?.slug?.startsWith('smoke-kb'), 'kb.create derives a stable slug');

  const list = await v2('GET', '/api/v2/ops/kb/list', token, { page_size: 100 });
  check(Array.isArray(list?.items) && list.items.some((k: any) => k.id === kb.id), 'kb.list includes the new KB');

  const viewed = await v2('GET', '/api/v2/ops/kb/view', token, { kb_id: kb.id });
  check(viewed?.id === kb.id && typeof viewed.document_count === 'number', 'kb.view returns the KB with document_count');

  const updated = await v2('PATCH', '/api/v2/ops/kb/update', token, { kb_id: kb.id, description: 'smoke-updated' });
  check(updated?.description === 'smoke-updated', 'kb.update persists a description');

  const status = await v2('GET', '/api/v2/ops/kb/status', token, { kb_id: kb.id });
  check(status?.ready === true && typeof status.document_count === 'number', 'kb.status reports ready');

  const checkBySlug = await v2('GET', '/api/v2/ops/kb/check', token, { slug: kb.slug });
  check(checkBySlug?.exists === true && checkBySlug.id === kb.id, 'kb.check finds by slug');

  // 3. Folders.
  const f1 = await v2('POST', '/api/v2/ops/kb/folder_create', token, { kb_id: kb.id, name: 'Papers' });
  check(!!f1?.id, 'folder_create returns an id');
  const f2 = await v2('POST', '/api/v2/ops/kb/folder_create', token, { kb_id: kb.id, parent_id: f1.id, name: 'Sub' });
  check(f2?.parent_id === f1.id, 'folder_create honours parent_id');

  const folders = await v2('GET', '/api/v2/ops/kb/folder_list', token, { kb_id: kb.id });
  check(Array.isArray(folders?.items) && folders.items.length >= 2, 'folder_list returns folders');

  const moved = await v2('POST', '/api/v2/ops/kb/folder_move', token, { folder_id: f2.id, parent_id: null });
  check(moved?.parent_id === null, 'folder_move reparents to root');

  const fdel = await v2('DELETE', '/api/v2/ops/kb/folder_delete', token, { folder_id: f2.id });
  check(fdel?.deleted === true, 'folder_delete soft-deletes');

  // 4. Seed one document through the internal backfill path (no public REST create until P2).
  const seeded = await knowledgeService.createDocumentWithRevision({
    kbId: kb.id, title: 'Smoke doc', summary: 'seed', content: 'revision v1', visibility: 'internal',
  });
  const docId = seeded.document.id;
  check(!!docId, 'internal seed creates a document');

  const docs = await v2('GET', '/api/v2/ops/doc/list', token, { kb_id: kb.id });
  check(Array.isArray(docs?.items) && docs.items.some((d: any) => d.id === docId), 'doc.list includes the seeded doc');

  const dv = await v2('GET', '/api/v2/ops/doc/view', token, { doc_id: docId });
  check(dv?.id === docId && dv.content === 'revision v1', 'doc.view returns content');

  // Update content → appends revision #2 (K04 invariant).
  const du = await v2('PATCH', '/api/v2/ops/doc/update', token, { doc_id: docId, content: 'revision v2' });
  check(du?.content === 'revision v2', 'doc.update persists new content');

  const revs = await v2('GET', '/api/v2/ops/doc/revisions', token, { doc_id: docId });
  check(Array.isArray(revs?.items) && revs.items.length === 2, 'doc.revisions lists 2 revisions (seed + update)');

  const rv1 = await v2('GET', '/api/v2/ops/doc/revision_view', token, { doc_id: docId, revision_no: 1 });
  check(rv1?.content === 'revision v1', 'doc.revision_view returns revision 1 content');

  const restored = await v2('POST', '/api/v2/ops/doc/revision_restore', token, { doc_id: docId, revision_no: 1 });
  check(restored?.content === 'revision v1', 'doc.revision_restore rolls content back to revision 1');

  const sourceId = seeded.source.id;
  const sv = await v2('GET', '/api/v2/ops/doc/source_view', token, { source_id: sourceId });
  check(sv?.id === sourceId, 'doc.source_view returns the source');

  // 4a. P1-04 — preview / download / artifacts / export / import.
  const preview = await v2('POST', '/api/v2/ops/doc/preview', token, { doc_id: docId });
  check(preview?.format === 'markdown' && typeof preview.preview === 'string', 'doc.preview returns a markdown preview');

  const dl = await v2('GET', '/api/v2/ops/doc/download', token, { doc_id: docId });
  check(dl?.content === 'revision v1' && typeof dl.file_name === 'string', 'doc.download returns content + file name');

  const arts = await v2('GET', '/api/v2/ops/doc/artifacts', token, { doc_id: docId });
  check(Array.isArray(arts?.items) && arts.items.some((a: any) => a.name === 'content.md'), 'doc.artifacts lists content.md');

  const art = await v2('GET', '/api/v2/ops/doc/artifact_download', token, { doc_id: docId, name: 'content.md' });
  check(art?.content === 'revision v1', 'doc.artifact_download returns the artifact content');

  const exp = await v2('POST', '/api/v2/ops/kb/export', token, { kb_id: kb.id });
  check(exp?.format === 'json' && typeof exp.count === 'number' && exp.count >= 1, 'kb.export returns a JSON export with a count');

  const imp = await v2('POST', '/api/v2/ops/kb/import', token, { kb_id: kb.id, documents: [{ title: 'Imported doc', content: 'imported body' }] });
  check(imp?.imported === 1 && imp.document_ids?.length === 1, 'kb.import imports a document');

  // Move document into the remaining folder, then delete + restore + batch-delete.
  const movedDoc = await v2('POST', '/api/v2/ops/doc/move', token, { doc_id: docId, folder_id: f1.id });
  check(movedDoc?.folder_id === f1.id, 'doc.move assigns a folder');

  const del = await v2('DELETE', '/api/v2/ops/doc/delete', token, { doc_id: docId });
  check(del?.deleted === true, 'doc.delete soft-deletes');

  const resd = await v2('POST', '/api/v2/ops/doc/restore', token, { doc_id: docId });
  check(resd?.deleted_at === null, 'doc.restore un-deletes');

  const batch = await v2('POST', '/api/v2/ops/doc/batch', token, { doc_ids: [docId] });
  check(batch?.deleted === 1 && batch.ids.includes(docId), 'doc.batch deletes the document');

  // 5. Cleanup — remove the KB (cascades to its documents/folders).
  const kdel = await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  check(kdel?.deleted === true, 'kb.delete removes the KB (cleanup)');

  console.log(`\nP1-03 smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
