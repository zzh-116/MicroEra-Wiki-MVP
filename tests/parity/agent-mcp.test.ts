// Batch C (E2/E3) — agent.mcp_test / agent.mcp_call realness + dispatch.
//
// Two tiers are covered here:
//   1. a real loopback JSON-RPC 2.0 stub driven by the REAL McpHttpClient, so a
//      `tools/call` request is proven to leave the process and return the target's
//      actual result (no local fallback masquerading as remote);
//   2. the singleton agentService with the client stubbed, to pin the dispatch
//      split (builtin vs remote) and the error mapping (tool_not_found → 404,
//      remote_error → 500, unknown server → 404).
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';
import { agentService, AgentService } from '../../backend/services/agent.service.js';
import { agentRepository } from '../../backend/repositories/agent.repository.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';
import { McpHttpClient, McpClientError } from '../../backend/services/mcp-client.js';

function agent(id = 1, overrides: Record<string, unknown> = {}): any {
  return {
    id, name: 'R', description: '', instructions: '', model: '', tools: [],
    mcp_servers: [], skills: [], status: 'idle', created_by: 7,
    created_at: '', updated_at: '', deleted_at: null, ...overrides,
  };
}

describe('agent.mcp — real remote MCP (loopback stub)', () => {
  let server: Server;
  let url: string;
  const received: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let payload: any;
        try { payload = JSON.parse(body); } catch { payload = {}; }
        received.push(payload.method ?? '');
        const id = payload.id ?? null;
        res.writeHead(200, { 'content-type': 'application/json' });
        if (payload.method === 'initialize') {
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'stub', version: '1.0.0' } } }));
        }
        if (payload.method === 'tools/list') {
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: [{ name: 'echo' }] } }));
        }
        if (payload.method === 'tools/call') {
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `echo:${payload.params?.arguments?.value ?? ''}` }], isError: false } }));
        }
        return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => { await new Promise<void>((r) => server?.close(() => r())); });

  it('mcpTest performs a real handshake and reports reachable:true', async () => {
    const svc = new AgentService(new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] }));
    const r: any = await svc.mcpTest({ name: 'stub', url });
    expect(r.reachable).toBe(true);
    expect(r.protocol_version).toBe('2025-03-26');
    expect(r.tools_count).toBe(1);
    expect(received).toContain('initialize');
  });

  it('mcpCall reaches the remote server and returns the target result', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { mcp_servers: [{ name: 'stub', url }] }));
    const svc = new AgentService(new McpHttpClient({ timeoutMs: 2000, trustedHosts: ['127.0.0.1'] }));
    const r: any = await svc.mcpCall(7, { agent_id: 1, server: 'stub', tool: 'echo', arguments: { value: 'hi' } });
    expect(r.remote).toBe(true);
    expect(r.server).toBe('stub');
    expect(r.result.content[0].text).toBe('echo:hi');
    expect(received).toContain('tools/call');
  });
});

describe('agent.mcp — dispatch + error mapping (stubbed client)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('mcpTest requires a url', async () => {
    await expect(agentService.mcpTest({ name: 'x' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('mcpTest reports reachable:false with a typed error on connection failure', async () => {
    vi.spyOn((agentService as any).mcpClient, 'initialize').mockRejectedValue(new McpClientError('connection_failed', 'boom'));
    const r: any = await agentService.mcpTest({ name: 'x', url: 'http://127.0.0.1:1' });
    expect(r.reachable).toBe(false);
    expect(r.error.kind).toBe('connection_failed');
  });

  it('mcpCall executes a builtin tool locally and labels it remote:false', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([{ chunk_id: 'c1', document_id: 1, title: 'D', text: 't', score: 0.9 }] as any);
    const r: any = await agentService.mcpCall(7, { agent_id: 1, tool: 'retrieve', arguments: { query: 'x' } });
    expect(r.remote).toBe(false);
    expect(r.server).toBe('builtin');
    expect(r.result.num_hits).toBe(1);
  });

  it('mcpCall rejects an unknown local tool', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    await expect(agentService.mcpCall(7, { agent_id: 1, tool: 'nope' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('mcpCall maps remote tool_not_found to resource_not_found', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { mcp_servers: [{ name: 'ext', url: 'http://127.0.0.1:1' }] }));
    vi.spyOn((agentService as any).mcpClient, 'callTool').mockRejectedValue(new McpClientError('tool_not_found', 'missing', -32601));
    await expect(agentService.mcpCall(7, { agent_id: 1, server: 'ext', tool: 'missing' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('mcpCall maps remote_error to internal', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { mcp_servers: [{ name: 'ext', url: 'http://127.0.0.1:1' }] }));
    vi.spyOn((agentService as any).mcpClient, 'callTool').mockRejectedValue(new McpClientError('remote_error', 'boom', -32000));
    await expect(agentService.mcpCall(7, { agent_id: 1, server: 'ext', tool: 'x' })).rejects.toMatchObject({ kind: 'internal' });
  });

  it('mcpCall rejects a server not configured on the agent', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    await expect(agentService.mcpCall(7, { agent_id: 1, server: 'ghost', tool: 'echo' })).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
