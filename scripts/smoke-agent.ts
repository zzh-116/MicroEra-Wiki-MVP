// P6 live smoke — proves agent.* / skills.* / session.agent_ask end-to-end over
// the real REST surface and real Postgres: login → seed a KB + document → create
// an agent → list/view/update/check → run (grounded) → tools/tool_call/
// tool_result → mcp_list/mcp_test/mcp_call → skills (install/list/read/validate)
// → sandbox (status/run/artifact_list) → status/stop/resume → session.agent_ask
// → trace → delete.
// Asserts: a run grounds on the seeded content, tools + sandbox tasks execute,
// and the agent is soft-deleted at the end.
//
// Run: npm run smoke:agent   (server must already be up, e.g. `npm run server`)
import { parseApiService } from '../backend/services/parse-api.service.js';
import { ingestService } from '../backend/services/ingest.service.js';

const BASE = (process.env.MICROERA_HOST || 'http://localhost:3001').replace(/\/$/, '');

const CONTENT = 'This document discusses zeolite catalysis for sustainable materials synthesis and green chemistry applications.';

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
  const login = await raw('POST', '/api/auth/login', undefined, { username: 'admin', password: 'admin123' });
  const token = login?.token ?? login?.data?.token;
  check(!!token, 'auth: admin login returns a token');
  if (!token) { console.error('Cannot continue without a token.'); process.exit(1); }

  const stamp = Date.now();
  const kb = await v2('POST', '/api/v2/ops/kb/create', token, { name: `Agent KB ${stamp}`, visibility: 'internal' });
  check(!!kb?.id, 'kb.create returns an id');

  const doc = await parseApiService.upload({ kb_id: kb.id, title: 'Zeolite catalysis paper', content: CONTENT, visibility: 'internal' });
  const ing = await ingestService.ingest(doc.document_id);
  check(!!doc.document_id && ing.chunks > 0, 'upload + ingest seed ≥1 chunk');
  if (!doc.document_id || ing.chunks === 0) { console.error('No chunks to retrieve — aborting.'); process.exit(1); }

  // ── A01: create / list / view / update ────────────────────────────────────
  const created = await v2('POST', '/api/v2/ops/agent/create', token, {
    name: `Research Agent ${stamp}`, instructions: 'Gather evidence and cite sources.', tools: ['retrieve', 'echo'], mcp_servers: [{ name: 'local', url: 'http://localhost:9000' }],
  });
  check(!!created?.id && created.status === 'idle', 'agent.create returns an idle agent');
  const aid = created.id;

  const list = await v2('GET', '/api/v2/ops/agent/list', token);
  check(Array.isArray(list?.items) && list.items.some((a: any) => a.id === aid), 'agent.list includes the created agent');

  const view = await v2('GET', '/api/v2/ops/agent/view', token, { agent_id: aid });
  check(view?.id === aid && view.name.startsWith('Research Agent'), 'agent.view returns the agent');

  const updated = await v2('PATCH', '/api/v2/ops/agent/update', token, { agent_id: aid, instructions: 'Gather evidence, cite sources, and summarize.' });
  check(updated?.instructions?.includes('summarize'), 'agent.update patches instructions');

  const checkRes = await v2('GET', '/api/v2/ops/agent/check', token, { agent_id: aid });
  check(checkRes?.ok === true, 'agent.check reports the agent ready');

  // ── A01: run (grounded) ───────────────────────────────────────────────────
  const run = await v2('POST', '/api/v2/ops/agent/run', token, { agent_id: aid, goal: 'zeolite catalysis', method: 'hybrid', top_k: 4 });
  check(run?.status === 'succeeded' && !!run.run_id, 'agent.run returns a succeeded run');
  check(run.answer.includes('zeolite') || run.answer.includes('Findings'), 'agent.run answer is grounded');
  check(Array.isArray(run.steps) && run.steps.length >= 2, 'agent.run records ≥2 steps');
  const runId = run.run_id;

  // ── A02: tools ────────────────────────────────────────────────────────────
  const tools = await v2('GET', '/api/v2/ops/agent/tools', token, { agent_id: aid });
  check(Array.isArray(tools?.tools) && tools.tools.length === 5, 'agent.tools returns the 5-tool catalog');

  const tc = await v2('POST', '/api/v2/ops/agent/tool_call', token, { agent_id: aid, tool: 'echo', input: { value: 'hi' } });
  check(tc?.result?.value === 'hi' && !!tc.run_id, 'agent.tool_call executes echo');

  const tr = await v2('POST', '/api/v2/ops/agent/tool_result', token, { run_id: tc.run_id, step_index: 0 });
  check(tr?.tool === 'echo' && tr?.result?.value === 'hi', 'agent.tool_result returns the echo step');

  // ── A03: MCP ──────────────────────────────────────────────────────────────
  const mcpList = await v2('GET', '/api/v2/ops/agent/mcp_list', token, { agent_id: aid });
  check(Array.isArray(mcpList?.servers) && mcpList.servers.length === 1, 'agent.mcp_list returns the configured server');

  const mcpTest = await v2('POST', '/api/v2/ops/agent/mcp_test', token, { name: 'local', url: 'http://localhost:9000' });
  check(mcpTest?.reachable === true, 'agent.mcp_test validates the config');

  const mcpCall = await v2('POST', '/api/v2/ops/agent/mcp_call', token, { agent_id: aid, tool: 'echo', arguments: { value: 'mcp' } });
  check(mcpCall?.result?.value === 'mcp', 'agent.mcp_call routes the echo tool');

  // ── A04: skills ───────────────────────────────────────────────────────────
  const skill = await v2('POST', '/api/v2/ops/skills/install', token, { name: `research-${stamp}`, description: 'd', manifest: { name: 'research', version: '1.0.0' } });
  check(skill?.installed === true, 'skills.install upserts an installed skill');

  const skillList = await v2('GET', '/api/v2/ops/skills/list', token);
  check(Array.isArray(skillList?.items) && skillList.items.some((s: any) => s.name === `research-${stamp}`), 'skills.list includes the installed skill');

  const skillRead = await v2('GET', '/api/v2/ops/skills/read', token, { name: `research-${stamp}` });
  check(skillRead?.name === `research-${stamp}`, 'skills.read returns the skill');

  const skillVal = await v2('POST', '/api/v2/ops/skills/validate', token, { manifest: { description: 'missing fields' } });
  check(skillVal?.valid === false && skillVal.errors.length >= 2, 'skills.validate flags an invalid manifest');

  // ── A05: sandbox + artifacts ──────────────────────────────────────────────
  const sandboxStatus = await v2('GET', '/api/v2/ops/agent/sandbox_status', token);
  check(sandboxStatus?.available === true, 'agent.sandbox_status reports available');

  const sandboxRun = await v2('POST', '/api/v2/ops/agent/sandbox_run', token, { agent_id: aid, task: 'count_tokens', payload: { text: 'hello world' } });
  check(sandboxRun?.result?.tokens === 2 && !!sandboxRun.artifact_id, 'agent.sandbox_run executes count_tokens');

  const artifacts = await v2('GET', '/api/v2/ops/agent/artifact_list', token, { run_id: sandboxRun.run_id });
  check(Array.isArray(artifacts?.items) && artifacts.items.length === 1, 'agent.artifact_list returns the artifact');

  // ── A06: status / stop / resume / session.agent_ask / trace ───────────────
  const status = await v2('GET', '/api/v2/ops/agent/status', token, { agent_id: aid });
  check(status?.status === 'idle' && !!status.latest_run?.run_id, 'agent.status reports the latest run');

  const stopped = await v2('POST', '/api/v2/ops/agent/stop', token, { run_id: runId });
  check(stopped?.status === 'cancelled', 'agent.stop cancels the run');

  const resumed = await v2('POST', '/api/v2/ops/agent/resume', token, { run_id: runId });
  check(resumed?.status === 'succeeded' && resumed.run_id !== runId, 'agent.resume re-runs the goal as a fresh run');

  const sess = await v2('POST', '/api/v2/ops/session/create', token, { title: 'Agent session' });
  const agentAsk = await v2('POST', '/api/v2/ops/session/agent_ask', token, { agent_id: aid, session_id: sess.id, question: 'zeolite catalysis', method: 'hybrid', top_k: 4 });
  check(!!agentAsk?.answer && agentAsk.session_id === sess.id, 'session.agent_ask answers and binds to the session');

  const trace = await v2('GET', '/api/v2/ops/agent/trace', token, { run_id: agentAsk.run_id });
  check(Array.isArray(trace?.steps) && trace.steps.length >= 2 && trace.status === 'succeeded', 'agent.trace returns the step trace');

  // ── A01: delete (destructive) ─────────────────────────────────────────────
  const del = await v2('DELETE', '/api/v2/ops/agent/delete', token, { agent_id: aid });
  check(del?.deleted === true, 'agent.delete soft-removes the agent');

  const rawView = await fetch(`${BASE}/api/v2/ops/agent/view${qs({ agent_id: aid })}`, { headers: { authorization: `Bearer ${token}` } });
  const rawBody = await rawView.json();
  check(rawView.status === 404 && rawBody?.error?.type === 'resource.not_found', 'agent.view after delete returns resource_not_found');

  await v2('DELETE', '/api/v2/ops/kb/delete', token, { kb_id: kb.id });
  console.log(`\nP6 agent smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
