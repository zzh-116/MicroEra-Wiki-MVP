// Agent object-level authorization (IDOR fix) — verifies that every
// agent_id- or run_id-addressed operation is scoped to the authenticated user,
// and that none of the REST, CLI, or MCP entry points can bypass server-side
// enforcement. The repository is mocked so the tests exercise the service
// authorization logic and the transport plumbing without a database.
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../../backend/app.js';
import { signToken } from '../../server/middleware/auth.js';
import { agentService } from '../../backend/services/agent.service.js';
import { agentRepository } from '../../backend/repositories/agent.repository.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';

const USER_A = 1;
const USER_B = 2;

function agentRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: 1, name: 'A', description: '', instructions: '', model: '', tools: [],
    mcp_servers: [], skills: [], status: 'idle', created_by: USER_A,
    created_at: '', updated_at: '', deleted_at: null, ...overrides,
  };
}

function runRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'run_1', agent_id: 1, goal: 'g', status: 'succeeded', steps: [{ step: 1, tool: 'retrieve' }],
    answer: 'a', trace: {}, created_at: '', updated_at: '', created_by: USER_A, ...overrides,
  };
}

describe('agent object-level authorization — service layer', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('view allows the owner', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    await expect(agentService.view(USER_A, 1)).resolves.toMatchObject({ id: 1 });
  });

  it('view denies a non-owner without disclosing existence', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    await expect(agentService.view(USER_B, 1)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('view default-denies an unowned agent (created_by null)', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow({ created_by: null }));
    await expect(agentService.view(USER_A, 1)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('list is scoped to the caller', async () => {
    const listAgents = vi.spyOn(agentRepository, 'listAgents').mockResolvedValue({ items: [], total: 0 });
    await agentService.list(USER_A, {});
    expect(listAgents).toHaveBeenCalledWith(USER_A, expect.anything());
  });

  it('update denies a non-owner', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    const updateAgent = vi.spyOn(agentRepository, 'updateAgent').mockResolvedValue(undefined);
    await expect(agentService.update(USER_B, 1, { name: 'stolen' })).rejects.toMatchObject({ kind: 'resource_not_found' });
    expect(updateAgent).not.toHaveBeenCalled();
  });

  it('remove denies a non-owner and does not delete', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    const del = vi.spyOn(agentRepository, 'softDeleteAgent').mockResolvedValue(true);
    await expect(agentService.remove(USER_B, 1)).rejects.toMatchObject({ kind: 'resource_not_found' });
    expect(del).not.toHaveBeenCalled();
  });

  it('run denies a non-owner agent and creates no run', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    const createRun = vi.spyOn(agentRepository, 'createRun');
    await expect(agentService.run(USER_B, { agent_id: 1, goal: 'x' })).rejects.toMatchObject({ kind: 'resource_not_found' });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('resume denies a run owned by another user', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue(runRow());
    await expect(agentService.resume(USER_B, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('trace denies a run owned by another user', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue(runRow());
    await expect(agentService.trace(USER_B, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('toolResult denies a run owned by another user', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue(runRow());
    await expect(agentService.toolResult(USER_B, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('stop denies a run owned by another user and does not cancel it', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue(runRow());
    const updateRun = vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);
    await expect(agentService.stop(USER_B, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'resource_not_found' });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('artifactList denies a run owned by another user', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue(runRow());
    const listArtifacts = vi.spyOn(agentRepository, 'listArtifacts').mockResolvedValue([]);
    await expect(agentService.artifactList(USER_B, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'resource_not_found' });
    expect(listArtifacts).not.toHaveBeenCalled();
  });

  it('toolCall refuses to append steps to a run of a different agent', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    vi.spyOn(agentRepository, 'findRunById').mockResolvedValue({ id: 'run_1', agent_id: 999, goal: 'g', status: 'running', steps: [], answer: '', trace: {}, created_at: '', updated_at: '' });
    await expect(agentService.toolCall(USER_A, { agent_id: 1, tool: 'echo', input: { value: 'x' }, run_id: 'run_1' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});

describe('agent object-level authorization — REST/CLI/MCP non-bypass', () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const cliEntry = path.join(repoRoot, 'cli', 'src', 'main.ts');

  let server: Server;
  let baseUrl: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    tokenA = signToken({ userId: USER_A, username: 'a', role: 'admin' });
    tokenB = signToken({ userId: USER_B, username: 'b', role: 'admin' });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => vi.restoreAllMocks());

  function runCli(args: string[], env: Record<string, string>): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, ...args], {
        cwd: repoRoot,
        env: { ...process.env, MICROERA_HOST: baseUrl, MICROERA_TOKEN: tokenB, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    });
  }

  it('rejects unauthenticated agent.view (401)', async () => {
    const res = await fetch(`${baseUrl}/api/v2/ops/agent/view?agent_id=1`);
    expect(res.status).toBe(401);
  });

  it('REST: owner can view, non-owner gets 404', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    const okRes = await fetch(`${baseUrl}/api/v2/ops/agent/view?agent_id=1`, { headers: { authorization: `Bearer ${tokenA}` } });
    expect(okRes.status).toBe(200);
    const denyRes = await fetch(`${baseUrl}/api/v2/ops/agent/view?agent_id=1`, { headers: { authorization: `Bearer ${tokenB}` } });
    expect(denyRes.status).toBe(404);
  });

  it('MCP: the registered handler forwards the token and cannot bypass', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    registerOperations(new ApiClient({ baseUrl, token: tokenB }));
    const def = operationRegistry.get('agent.view')!;
    await expect(def.handler!({ agent_id: 1 }, { requestId: 'r', traceId: 't', dryRun: false })).rejects.toMatchObject({ status: 404 });
  });

  it('CLI: non-owner cannot view another user agent', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agentRow());
    const { stdout, code } = await runCli(['agent', 'view', '--agent-id', '1'], {});
    expect(code).not.toBe(0);
    const env = JSON.parse(stdout) as { ok: boolean };
    expect(env.ok).toBe(false);
  }, 30000);
});
