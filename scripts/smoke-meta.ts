// P9 live smoke — proves the 11 introspection ops (api.*/mcp.*/cli.*) over the
// real REST surface: login → enumerate operations/tools/resources/prompts →
// versions → doctor. All read-only discovery; no writes.
//
// Run: npm run smoke:meta   (server must already be up, e.g. `npm run server`)
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

  // ── X01: api.* ──────────────────────────────────────────────────────────
  const ops = await v2('GET', '/api/v2/ops/api/operations', token);
  check(Array.isArray(ops?.items) && ops.total > 0 && ops.items.some((o: any) => o.id === 'api.operations'), 'api.operations lists the operations');

  const manifest = await v2('GET', '/api/v2/ops/api/schema', token);
  check(manifest?.operationRegistryVersion === '1' && Array.isArray(manifest.operations) && manifest.operations.length > 0, 'api.schema returns the manifest');

  const oneSchema = await v2('GET', '/api/v2/ops/api/schema', token, { operation_id: 'kb.create' });
  check(oneSchema?.id === 'kb.create' && oneSchema.inputSchema && oneSchema.outputSchema, 'api.schema?operation_id returns one contract');

  const version = await v2('GET', '/api/v2/ops/api/version', token);
  check(version?.api_version === '0.2.0' && version.registered_operations > 0, 'api.version reports versions');

  // ── X02: mcp.* ──────────────────────────────────────────────────────────
  const tools = await v2('GET', '/api/v2/ops/mcp/tools', token);
  check(Array.isArray(tools?.tools) && tools.total > 0, 'mcp.tools lists tools');

  const resources = await v2('POST', '/api/v2/ops/mcp/resources', token, {});
  check(Array.isArray(resources?.resources) && resources.total > 0, 'mcp.resources lists resources');

  const prompts = await v2('POST', '/api/v2/ops/mcp/prompts', token, {});
  check(Array.isArray(prompts?.prompts) && prompts.total > 0, 'mcp.prompts lists prompts');

  const mcpHealth = await v2('GET', '/api/v2/ops/mcp/health', token);
  check(mcpHealth?.ok === true && mcpHealth.tools > 0, 'mcp.health reports liveness');

  // ── X03: cli.* ──────────────────────────────────────────────────────────
  const commands = await v2('POST', '/api/v2/ops/cli/commands', token, {});
  check(Array.isArray(commands?.commands) && commands.commands.some((c: any) => c.command === 'microera cli commands'), 'cli.commands lists commands');

  const cliVersion = await v2('GET', '/api/v2/ops/cli/version', token);
  check(cliVersion?.version === '0.1.0' && Array.isArray(cliVersion.supported_transports), 'cli.version reports versions');

  const doctor = await v2('POST', '/api/v2/ops/cli/doctor', token, {});
  check(doctor?.server === 'connected' && doctor.database === 'connected' && doctor.registry_valid === true, 'cli.doctor reports a healthy system');

  const cliSchema = await v2('GET', '/api/v2/ops/cli/schema', token);
  check(cliSchema?.operationRegistryVersion === '1' && Array.isArray(cliSchema.operations), 'cli.schema returns the manifest');

  console.log(`\nP9 meta smoke: ${pass} passed, ${fail} failed`);
  if (fail) { console.error(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((err) => { console.error('Smoke aborted:', err?.message ?? err); process.exit(1); });
