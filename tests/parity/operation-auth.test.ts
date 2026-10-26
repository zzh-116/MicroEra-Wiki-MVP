// Operation-level authorization (B-1) — proves the viewer/editor/admin role
// matrix is enforced at the shared REST /api/v2/ops boundary that the CLI, the
// HTTP MCP, the stdio MCP, and raw REST all funnel through.
//
// No real database is touched: the app is built with bootstrap:false and the
// services under test are mocked, so no dev/demo data is read, written or
// deleted. The MCP transport filter (finding #4) is covered separately.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';

import { createApp } from '../../backend/app.js';
import { signToken } from '../../server/middleware/auth.js';
import { requiredRoleForPath } from '../../server/middleware/operation-auth.js';
import { requiredRoleFor, roleSatisfies } from '../../packages/operation-registry/src/authorization.js';
import { operationRegistry } from '../../packages/operation-registry/src/registry.js';
import { ApiClient } from '../../packages/operation-registry/src/http-client.js';
import { runHttpServer } from '../../packages/mcp/src/http.js';
import { listTools, callTool } from '../../packages/mcp/src/mcp-core.js';
import { knowledgeService } from '../../backend/services/knowledge.service.js';
import { modelService } from '../../backend/services/model.service.js';

function listen(app: any): Promise<{ server: any; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

async function close(server: any): Promise<void> {
  await new Promise((resolve) => server.close(resolve));
}

describe('operation-level authorization (B-1)', () => {
  let base: string;
  let server: any;
  let mcpBase: string;
  let mcpServer: any;
  let viewerToken: string;
  let editorToken: string;
  let adminToken: string;

  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const app = await createApp({ bootstrap: false, serveStatic: false, cors: false });
    const l = await listen(app);
    server = l.server;
    base = l.base;

    viewerToken = signToken({ userId: 1, username: 'viewer', role: 'viewer' });
    editorToken = signToken({ userId: 2, username: 'editor', role: 'editor' });
    adminToken = signToken({ userId: 3, username: 'admin', role: 'admin' });

    // Point the HTTP MCP at the real app and start it FIRST so it is the first
    // to populate the operation registry with the correct backend base URL.
    // A developer shell may export MICROERA_HOST/MICROERA_TOKEN; strip them so
    // resolveBaseUrl() honors our test base instead of the default local server.
    for (const k of ['MICROERA_HOST', 'MICROERA_API_URL', 'MICROERA_TOKEN', 'MCP_HOST', 'MCP_HTTP_ENABLED']) {
      savedEnv[k] = process.env[k];
    }
    delete process.env.MICROERA_HOST;
    delete process.env.MCP_HOST;
    delete process.env.MICROERA_TOKEN;
    process.env.MCP_HTTP_ENABLED = 'true';
    process.env.MICROERA_API_URL = base;
    mcpServer = await runHttpServer(0, { host: '127.0.0.1' });
    mcpBase = `http://127.0.0.1:${(mcpServer.address() as AddressInfo).port}`;

    // Mock the services that would otherwise hit the (absent) database, so the
    // positive cases return a clean 200 without touching any real data.
    vi.spyOn(knowledgeService, 'listKbs').mockResolvedValue({ items: [], total: 0 } as any);
    vi.spyOn(knowledgeService, 'createKb').mockResolvedValue({ id: 1 } as any);
    vi.spyOn(knowledgeService, 'deleteKb').mockResolvedValue({ deleted: true } as any);
    vi.spyOn(modelService, 'create').mockResolvedValue({ id: 1 } as any);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (mcpServer) await close(mcpServer);
    if (server) await close(server);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe('policy (pure functions)', () => {
    it('requiredRoleFor derives viewer/editor/admin from risk + scopes', () => {
      expect(requiredRoleFor({ risk: 'read', scopes: [] })).toBe('viewer');
      expect(requiredRoleFor({ risk: 'read', scopes: ['kb:read'] })).toBe('viewer');
      expect(requiredRoleFor({ risk: 'write', scopes: ['kb:write'] })).toBe('editor');
      expect(requiredRoleFor({ risk: 'write', scopes: ['doc:write'] })).toBe('editor');
      expect(requiredRoleFor({ risk: 'destructive', scopes: ['kb:write'] })).toBe('admin');
      expect(requiredRoleFor({ risk: 'write', scopes: ['model:write'] })).toBe('admin');
      expect(requiredRoleFor({ risk: 'write', scopes: ['datasource:write'] })).toBe('admin');
      expect(requiredRoleFor({ risk: 'write', scopes: ['agent:write'] })).toBe('admin');
      expect(requiredRoleFor({ risk: 'write', scopes: ['skill:write'] })).toBe('admin');
    });

    it('roleSatisfies enforces rank and denies unknown/absent roles', () => {
      expect(roleSatisfies('viewer', 'viewer')).toBe(true);
      expect(roleSatisfies('viewer', 'editor')).toBe(false);
      expect(roleSatisfies('editor', 'viewer')).toBe(true);
      expect(roleSatisfies('editor', 'editor')).toBe(true);
      expect(roleSatisfies('editor', 'admin')).toBe(false);
      expect(roleSatisfies('admin', 'admin')).toBe(true);
      expect(roleSatisfies('admin', 'editor')).toBe(true);
      expect(roleSatisfies('admin', 'viewer')).toBe(true);
      expect(roleSatisfies(undefined, 'viewer')).toBe(false);
      expect(roleSatisfies('superuser', 'viewer')).toBe(false);
    });
  });

  describe('registry → role index (no gaps)', () => {
    it('every /api/v2/ops registry route has a derived role', () => {
      for (const def of operationRegistry.list()) {
        if (!def.http || !def.http.path.startsWith('/api/v2/ops/')) continue;
        const role = requiredRoleForPath(def.http.method, def.http.path);
        expect(role, `${def.id} → ${def.http.method} ${def.http.path}`).toBeDefined();
      }
      // Explicit gap: the multipart upload route is REST-only (no registry http entry).
      expect(requiredRoleForPath('POST', '/api/v2/ops/doc/upload-file')).toBe('editor');
    });

    it('maps representative operations to the expected role', () => {
      expect(requiredRoleForPath('GET', '/api/v2/ops/kb/list')).toBe('viewer');
      expect(requiredRoleForPath('POST', '/api/v2/ops/kb/create')).toBe('editor');
      expect(requiredRoleForPath('DELETE', '/api/v2/ops/kb/delete')).toBe('admin');
      expect(requiredRoleForPath('POST', '/api/v2/ops/model/create')).toBe('admin');
    });
  });

  describe('REST boundary matrix (raw HTTP)', () => {
    async function req(method: string, path: string, token: string, body?: object): Promise<number> {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return res.status;
    }

    it('enforces viewer/editor/admin roles, including default-deny', async () => {
      const cases: Array<{ label: string; method: string; path: string; body?: object; expect: Record<'viewer' | 'editor' | 'admin', number> }> = [
        { label: 'kb.list (read)', method: 'GET', path: '/api/v2/ops/kb/list', expect: { viewer: 200, editor: 200, admin: 200 } },
        { label: 'kb.create (content write)', method: 'POST', path: '/api/v2/ops/kb/create', body: { name: 'Test KB' }, expect: { viewer: 403, editor: 200, admin: 200 } },
        { label: 'kb.delete (destructive)', method: 'DELETE', path: '/api/v2/ops/kb/delete?kb_id=1', expect: { viewer: 403, editor: 403, admin: 200 } },
        { label: 'model.create (admin-config write)', method: 'POST', path: '/api/v2/ops/model/create', body: { name: 'm', kind: 'llm', model_name: 'qwen' }, expect: { viewer: 403, editor: 403, admin: 200 } },
        { label: 'doc.upload-file (REST-only route)', method: 'POST', path: '/api/v2/ops/doc/upload-file', body: { kb_id: 1 }, expect: { viewer: 403, editor: 400, admin: 400 } },
        { label: 'unknown operation (default-deny)', method: 'GET', path: '/api/v2/ops/does/not/exist', expect: { viewer: 403, editor: 403, admin: 403 } },
      ];

      const tokens = { viewer: viewerToken, editor: editorToken, admin: adminToken };
      for (const c of cases) {
        for (const role of ['viewer', 'editor', 'admin'] as const) {
          const status = await req(c.method, c.path, tokens[role], c.body);
          expect(status, `${c.label} as ${role}`).toBe(c.expect[role]);
        }
      }
    });
  });

  describe('HTTP MCP (tools/call through the same gate)', () => {
    async function mcpCall(name: string, args: object, token: string): Promise<any> {
      const res = await fetch(`${mcpBase}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      return res.json();
    }

    it('blocks a viewer and allows an admin on a destructive tool', async () => {
      const viewer = await mcpCall('kb_delete', { kb_id: 1 }, viewerToken);
      expect(viewer.result.isError).toBe(true);
      expect(viewer.result.content[0].text).toContain('auth.forbidden');

      const admin = await mcpCall('kb_delete', { kb_id: 1 }, adminToken);
      expect(admin.result.isError).toBe(false);
    });
  });

  describe('MCP transport:local filter consistency (finding #4)', () => {
    it('listTools hides local tools and callTool does not expose them', async () => {
      const names = listTools().map((t: any) => t.name);
      expect(names).not.toContain('auth_whoami');

      // auth.whoami is transport:local — callTool must treat it as unknown now.
      const result = await callTool('auth_whoami', {}, new ApiClient({ baseUrl: 'http://localhost:1' }));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });
});
