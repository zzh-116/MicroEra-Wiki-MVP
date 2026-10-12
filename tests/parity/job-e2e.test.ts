// Batch B (F1) — real integration coverage for job.list / job.view.
//
// These two operations were previously marked "passed" with a test file that
// never exercised them (F1). This suite drives them end-to-end with NO mock of
// the service under test:
//   - a real Express app (createApp, bootstrap off → no migrations/seed/warmup)
//   - a real JWT through the real auth middleware
//   - a real job seeded into the real in-memory importJobService (empty upload
//     → the runner fails fast with EMPTY_BUFFER, so no DB write is performed)
//   - real HTTP for the API surface, a real CLI process for the CLI surface,
//     and the real operation handler (the exact code the MCP tool invokes).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createApp } from '../../backend/app.js';
import { signToken } from '../../server/middleware/auth.js';
import { importJobService } from '../../backend/services/import-job.service.js';
import { registerOperations } from '../../packages/operation-registry/src/operations.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cliEntry = path.join(repoRoot, 'cli', 'src', 'main.ts');

const VALID_STATUSES = ['pending', 'running', 'success', 'failed', 'cancelled'];

let server: Server;
let baseUrl: string;
let token: string;
let seededJobId: string;

beforeAll(async () => {
  const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
  token = signToken({ userId: 1, username: 'admin', role: 'admin' });

  // Seed a real job with an EMPTY file. The background runner reads 0 bytes and
  // `parseBuffer` throws a non-retryable EMPTY_BUFFER before any DB write, so the
  // job lands in 'failed' with no database/entry side effects. It stays visible to
  // list/view regardless, which is what we assert.
  const tmp = path.join(os.tmpdir(), `job-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`);
  fs.writeFileSync(tmp, '');
  const job = importJobService.createJob({ originalname: 'empty.bin', size: 0, path: tmp });
  seededJobId = job.id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

function runCli(args: string[], env: Record<string, string>): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, ...args], {
      cwd: repoRoot,
      env: { ...process.env, MICROERA_HOST: baseUrl, MICROERA_TOKEN: token, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

describe('job.list / job.view — real API surface', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/jobs`);
    expect(res.status).toBe(401);
  });

  it('job.list returns the seeded job over HTTP', async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/jobs`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: Array<{ id: string; status: string }> };
    expect(Array.isArray(body.jobs)).toBe(true);
    const found = body.jobs.find((j) => j.id === seededJobId);
    expect(found).toBeDefined();
    expect(VALID_STATUSES).toContain(found!.status);
  });

  it('job.view returns the seeded job over HTTP', async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/jobs/${seededJobId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; failed: boolean; job: { id: string; status: string } };
    expect(body.job.id).toBe(seededJobId);
    expect(VALID_STATUSES).toContain(body.job.status);
    expect(typeof body.success).toBe('boolean');
    expect(typeof body.failed).toBe('boolean');
  });

  it('job.view returns 404 for an unknown job', async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/jobs/does-not-exist`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('job.list / job.view — real CLI surface', () => {
  it('microera job list returns the seeded job', async () => {
    const { stdout, code } = await runCli(['job', 'list'], {});
    expect(code).toBe(0);
    const env = JSON.parse(stdout) as { ok: boolean; data: { jobs: Array<{ id: string }> } };
    expect(env.ok).toBe(true);
    expect(env.data.jobs.some((j) => j.id === seededJobId)).toBe(true);
  }, 30000);

  it('microera job view --job-id returns the job status', async () => {
    const { stdout, code } = await runCli(['job', 'view', '--job-id', seededJobId], {});
    expect(code).toBe(0);
    const env = JSON.parse(stdout) as { ok: boolean; data: { job_id: string; status: string } };
    expect(env.ok).toBe(true);
    expect(env.data.job_id).toBe(seededJobId);
    expect(VALID_STATUSES).toContain(env.data.status);
  }, 30000);

  it('microera job list without a token surfaces an auth error (not a crash)', async () => {
    const { stdout, code } = await runCli(['job', 'list'], { MICROERA_TOKEN: '' });
    const env = JSON.parse(stdout) as { ok: boolean; error?: { code?: string } };
    expect(env.ok).toBe(false);
    expect(code).not.toBe(0);
  }, 30000);
});

describe('job.list / job.view — real operation handler (MCP code path)', () => {
  it('the registered handler returns the seeded job over real HTTP', async () => {
    registerOperations(new ApiClient({ baseUrl, token }));
    const listDef = operationRegistry.get('job.list')!;
    const viewDef = operationRegistry.get('job.view')!;

    const listData = (await listDef.handler({}, { requestId: 'r', traceId: 't', dryRun: false })) as { jobs: Array<{ id: string }> };
    expect(listData.jobs.some((j) => j.id === seededJobId)).toBe(true);

    const viewData = (await viewDef.handler({ job_id: seededJobId }, { requestId: 'r', traceId: 't', dryRun: false })) as { job_id: string; status: string };
    expect(viewData.job_id).toBe(seededJobId);
    expect(VALID_STATUSES).toContain(viewData.status);
  });
});
