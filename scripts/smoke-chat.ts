// P4 live smoke — proves chat.* / session.* / message.* end-to-end over the
// real REST surface and real Postgres: login → seed a KB + document → chat.ask
// (grounded answer + citations) → session + message CRUD → citation read/verify
// → trace → export → stream (JSON fallback) → cancel/stop → delete.
// Asserts: the answer is non-empty, citations resolve to real chunks, session
// scoping persists the turn, and delete soft-removes the session.
//
// Run: npm run smoke:chat   (server must already be up, e.g. `npm run server`)
import { parseApiService } from '../backend/services/parse-api.service.js';
import { ingestService } from '../backend/services/ingest.service.js';

const BASE = (process.env.MICROERA_HOST || 'http://localhost:3001').replace(/\/$/, '');

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) { console.error('ADMIN_PASSWORD env var is required (set it to the local admin password)'); process.exit(1); }

const CONTENT = 'This document discusses zeolite catalysis and its applications in green chemistry and sustainable materials synthesis.';
const QUERY = 'What is zeolite catalysis used for?';

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
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `Chat KB ${stamp}`, visibility: 'internal' });
  check(!!kb?.id, 'kb.create returns an id');

  const doc = await parseApiService.upload({ kb_id: kb.id, title: 'Zeolite catalysis paper', content: CONTENT, visibility: 'internal' });
  const ing = await ingestService.ingest(doc.document_id);
  check(!!doc.document_id && ing.chunks > 0, 'upload + ingest seed ≥1 chunk');
  if (!doc.document_id || ing.chunks === 0) { console.error('No chunks to retrieve — aborting.'); process.exit(1); }

  // ── session.create / list / view ───────────────────────────────────────────
  const sess = await v2('POST', '/api/v2/ops/session/create', token, { title: 'Chat smoke', kb_ids: [kb.id] });
  check(!!sess?.id && sess.id.startsWith('sess_'), 'session.create returns a session id');
  check(Array.isArray(sess?.kb_ids) && sess.kb_ids.includes(kb.id), 'session.create stores scoped kb_ids');

  const list = await v2('GET', '/api/v2/ops/session/list', token);
  check(Array.isArray(list?.items) && list.items.some((s: any) => s.id === sess.id), 'session.list includes the new session');

  const view = await v2('GET', '/api/v2/ops/session/view', token, { session_id: sess.id });
  check(view?.id === sess.id, 'session.view returns the session');

  // ── chat.ask (grounded, session-scoped) ────────────────────────────────────
  const ask = await v2('POST', '/api/v2/ops/chat/ask', token, { question: QUERY, session_id: sess.id, method: 'hybrid', top_k: 4 });
  check(typeof ask?.answer === 'string' && ask.answer.length > 0, 'chat.ask returns a non-empty answer');
  check(Array.isArray(ask?.citations) && ask.citations.length > 0, 'chat.ask returns ≥1 citation');
  check(ask?.session_id === sess.id, 'chat.ask echoes the session id');
  check(typeof ask?.trace?.num_chunks === 'number', 'chat.ask returns a retrieval trace');

  // ── message.list / view / references / citation_read / verify / trace ──────
  const msgs = await v2('GET', '/api/v2/ops/message/list', token, { session_id: sess.id });
  check(msgs?.total === 2 && msgs.items.some((m: any) => m.role === 'user') && msgs.items.some((m: any) => m.role === 'assistant'), 'message.list shows user + assistant turns');

  const assistant = msgs.items.find((m: any) => m.role === 'assistant');
  const mv = await v2('GET', '/api/v2/ops/message/view', token, { message_id: assistant.id });
  check(mv?.id === assistant.id && typeof mv?.content === 'string', 'message.view returns the message');

  const refs = await v2('POST', '/api/v2/ops/chat/references', token, { message_id: assistant.id });
  check(Array.isArray(refs?.citations) && refs.citations.length > 0, 'chat.references returns the answer citations');

  const citeRead = await v2('GET', '/api/v2/ops/chat/citation_read', token, { chunk_id: refs.citations[0].chunk_id });
  check(typeof citeRead?.text === 'string' && typeof citeRead?.title === 'string', 'chat.citation_read resolves chunk text + title');

  const verify = await v2('POST', '/api/v2/ops/chat/verify_citations', token, { message_id: assistant.id });
  check(verify?.resolved === verify?.total && verify.resolved > 0, 'chat.verify_citations resolves every citation');

  const trace = await v2('GET', '/api/v2/ops/chat/trace', token, { message_id: assistant.id });
  check(trace?.message_id === assistant.id && typeof trace?.trace?.num_chunks === 'number', 'chat.trace returns the grounding trace');

  // ── message.search ─────────────────────────────────────────────────────────
  const msearch = await v2('POST', '/api/v2/ops/message/search', token, { q: 'zeolite' });
  check(Array.isArray(msearch?.items), 'message.search returns matching messages');

  // ── session.ask / chat.scope / session.export ───────────────────────────────
  const sask = await v2('POST', '/api/v2/ops/session/ask', token, { session_id: sess.id, question: 'Summarize the applications', method: 'lexical' });
  check(typeof sask?.answer === 'string' && sask.answer.length > 0, 'session.ask answers within the session');

  const scope = await v2('POST', '/api/v2/ops/chat/scope', token, { session_id: sess.id, kb_ids: [kb.id], top_k: 5, method: 'hybrid' });
  check(scope?.scope?.top_k === 5 && scope?.scope?.method === 'hybrid', 'chat.scope updates retrieval defaults');

  const exp = await v2('POST', '/api/v2/ops/session/export', token, { session_id: sess.id });
  check(exp?.session?.id === sess.id && Array.isArray(exp?.messages) && exp.messages.length === 4, 'session.export returns the session + all messages');

  // ── chat.stream (JSON fallback) / cancel / stop ────────────────────────────
  const streamed = await v2('POST', '/api/v2/ops/chat/stream', token, { question: 'What is zeolite?', kb_ids: [kb.id], method: 'lexical', stream: false });
  check(typeof streamed?.answer === 'string' && streamed.answer.length > 0, 'chat.stream (JSON fallback) returns an answer');

  const cancel = await v2('POST', '/api/v2/ops/chat/cancel', token, { session_id: sess.id });
  check(typeof cancel?.cancelled === 'boolean', 'chat.cancel returns a cancelled flag');

  const stop = await v2('POST', '/api/v2/ops/session/stop', token, { session_id: sess.id });
  check(typeof stop?.cancelled === 'boolean', 'session.stop returns a cancelled flag');

  // ── session.delete (destructive) ───────────────────────────────────────────
  const del = await v2('DELETE', '/api/v2/ops/session/delete', token, { session_id: sess.id });
  check(del?.deleted === true && del?.id === sess.id, 'session.delete soft-removes the session');

  const rawViewRes = await fetch(`${BASE}/api/v2/ops/session/view${qs({ session_id: sess.id })}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const rawView = await rawViewRes.json();
  check(rawViewRes.status === 404 && rawView?.ok === false && rawView?.error?.type === 'resource.not_found', 'session.view after delete returns resource_not_found');

  await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  console.log(`\nP4 chat smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
