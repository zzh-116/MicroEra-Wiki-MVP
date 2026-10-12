// Agent service (P6) — the agent.* / skills.* / session.agent_ask operation
// layer. An agent is a configurable assistant (instructions + optional model +
// enabled tools + MCP servers + skills) that runs grounded multi-step "runs"
// over the retrieval + tool pipeline. Runs are deterministic where possible so
// behavior is reproducible without an external LLM; `session.agent_ask` ties a
// run to a chat session by persisting the Q&A as session messages.
import { randomUUID } from 'node:crypto';
import { agentRepository } from '../repositories/agent.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { retrievalService } from './retrieval.service.js';
import { wikiService } from './wiki.service.js';
import { knowledgeChunkRepository } from '../repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { sha256 } from '../utils/hash.js';
import { ServiceError } from './knowledge.service.js';
import { McpHttpClient, McpClientError, type McpServerRef } from './mcp-client.js';

export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Built-in agent tools — the same capabilities our MCP surface exposes. */
export const BUILTIN_TOOLS: AgentTool[] = [
  { name: 'retrieve', description: 'Retrieve the most relevant chunks for a query.', input_schema: { query: 'string', kb_id: 'integer', top_k: 'integer', method: 'vector|lexical|hybrid' } },
  { name: 'wiki_search', description: 'Search wiki pages by keyword.', input_schema: { q: 'string' } },
  { name: 'lookup', description: 'Resolve a chunk id to its text and document title.', input_schema: { chunk_id: 'string' } },
  { name: 'summarize', description: 'Produce a grounded summary from a passage.', input_schema: { text: 'string', max_chars: 'integer' } },
  { name: 'echo', description: 'Return the input unchanged (diagnostic).', input_schema: { value: 'any' } },
];

const MAX_TOP_K = 50;

function clampTopK(n: number): number {
  return Math.min(Math.max(n, 1), MAX_TOP_K);
}

function compactHit(h: any): Record<string, unknown> {
  return {
    chunk_id: h.chunk_id,
    document_id: h.document_id,
    title: h.title,
    text: String(h.text ?? '').slice(0, 300),
    score: h.score,
  };
}

export class AgentService {
  constructor(private readonly mcpClient: McpHttpClient = new McpHttpClient()) {}

  private synthesize(goal: string, hits: any[]): string {
    if (hits.length === 0) return `No supporting passages were found for: ${goal}`;
    const lines = hits.slice(0, 3).map((h, i) => `[${i + 1}] ${h.title}: ${String(h.text ?? '').trim()}`);
    return `Findings for "${goal}":\n\n${lines.join('\n\n')}`;
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'retrieve': {
        const hits = await retrievalService.filteredSearch({
          query: String(input.query ?? ''),
          method: (input.method as any) ?? 'hybrid',
          kb_id: input.kb_id != null ? Number(input.kb_id) : undefined,
          top_k: clampTopK(Number(input.top_k ?? 6)),
        });
        return { num_hits: hits.length, hits: hits.map(compactHit) };
      }
      case 'wiki_search': {
        const { items } = await wikiService.search({ q: String(input.q ?? '') });
        return { items };
      }
      case 'lookup': {
        const chunk = await knowledgeChunkRepository.findById(String(input.chunk_id ?? ''));
        if (!chunk) throw new ServiceError('resource_not_found', 'chunk not found');
        const doc = await knowledgeRepository.findDocumentById(chunk.document_id);
        return { chunk_id: chunk.id, document_id: chunk.document_id, title: doc?.title ?? '', text: chunk.text };
      }
      case 'summarize': {
        const text = String(input.text ?? '');
        const max = Math.min(Math.max(Number(input.max_chars ?? 500), 1), 2000);
        return { summary: text.slice(0, max) };
      }
      case 'echo':
        return { value: input.value ?? null };
      default:
        throw new ServiceError('validation_failed', `unknown tool: ${name}`);
    }
  }

  private async runSandboxTask(task: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (task) {
      case 'echo':
        return { value: payload.value ?? payload };
      case 'count_tokens':
        return { tokens: String(payload.text ?? '').trim().split(/\s+/).filter(Boolean).length };
      case 'checksum':
        return { sha256: sha256(String(payload.text ?? '')) };
      case 'sum':
        return { sum: Array.isArray(payload.numbers) ? (payload.numbers as any[]).reduce((a, b) => a + Number(b), 0) : 0 };
      default:
        throw new ServiceError('validation_failed', `unknown sandbox task: ${task}`);
    }
  }

  // ── A01: CRUD + run ────────────────────────────────────────────────────────
  async create(input: { name?: string; description?: string; instructions?: string; model?: string; tools?: unknown[]; mcp_servers?: unknown[]; skills?: unknown[]; created_by?: number }) {
    if (!input.name?.trim()) throw new ServiceError('validation_failed', 'name is required');
    return agentRepository.createAgent({
      name: input.name.trim(),
      description: input.description ?? '',
      instructions: input.instructions ?? '',
      model: input.model ?? '',
      tools: input.tools ?? [],
      mcpServers: input.mcp_servers ?? [],
      skills: input.skills ?? [],
      createdBy: input.created_by ?? null,
    });
  }

  async list(input: { page?: number; page_size?: number }) {
    const { items, total } = await agentRepository.listAgents({ page: input.page, pageSize: input.page_size });
    return { items, total };
  }

  async view(agentId: number) {
    const agent = await agentRepository.findAgentById(agentId);
    if (!agent) throw new ServiceError('resource_not_found', 'agent not found');
    return agent;
  }

  async update(agentId: number, patch: { name?: string; description?: string; instructions?: string; model?: string; tools?: unknown[]; mcp_servers?: unknown[]; skills?: unknown[] }) {
    await this.view(agentId);
    const updated = await agentRepository.updateAgent(agentId, {
      name: patch.name?.trim() || undefined,
      description: patch.description,
      instructions: patch.instructions,
      model: patch.model,
      tools: patch.tools,
      mcpServers: patch.mcp_servers,
      skills: patch.skills,
    });
    return updated;
  }

  async remove(agentId: number) {
    await this.view(agentId);
    await agentRepository.softDeleteAgent(agentId);
    return { deleted: true, id: agentId };
  }

  async run(input: { agent_id: number; goal?: string; kb_id?: number; top_k?: number; method?: 'vector' | 'lexical' | 'hybrid' }) {
    const agent = await this.view(input.agent_id);
    const goal = (input.goal ?? '').trim();
    if (!goal) throw new ServiceError('validation_failed', 'goal is required');

    const runId = `run_${randomUUID()}`;
    await agentRepository.createRun({ id: runId, agentId: agent.id, goal, status: 'running' });
    const steps: unknown[] = [];
    const t0 = Date.now();
    try {
      const method = input.method ?? 'hybrid';
      const topK = clampTopK(input.top_k ?? 6);
      const hits = await retrievalService.filteredSearch({ query: goal, method, kb_id: input.kb_id, top_k: topK });
      steps.push({ step: 1, tool: 'retrieve', status: 'ok', result: { num_hits: hits.length, hits: hits.map(compactHit) } });

      const answer = this.synthesize(goal, hits);
      steps.push({ step: 2, tool: 'answer', status: 'ok', result: { answer } });

      const trace = { method, top_k: topK, num_chunks: hits.length, total_ms: Date.now() - t0 };
      await agentRepository.updateRun(runId, { status: 'succeeded', steps, answer, trace });
      return { run_id: runId, agent_id: agent.id, status: 'succeeded', answer, steps, trace };
    } catch (err: any) {
      await agentRepository.updateRun(runId, { status: 'failed', steps, trace: { error: err?.message ?? 'run failed' } });
      throw err;
    }
  }

  // ── A02: tools ─────────────────────────────────────────────────────────────
  async tools(agentId?: number) {
    let enabled = BUILTIN_TOOLS.map((t) => t.name);
    if (agentId !== undefined) {
      const agent = await this.view(agentId);
      const configured = agent.tools as string[];
      if (Array.isArray(configured) && configured.length > 0) enabled = configured;
    }
    const tools = BUILTIN_TOOLS.map((t) => ({ ...t, enabled: enabled.includes(t.name) }));
    return { tools, total: tools.length };
  }

  async toolCall(input: { agent_id: number; tool?: string; input?: Record<string, unknown>; run_id?: string }) {
    const agent = await this.view(input.agent_id);
    const tool = String(input.tool ?? '');
    if (!tool) throw new ServiceError('validation_failed', 'tool is required');
    if (!BUILTIN_TOOLS.some((t) => t.name === tool)) throw new ServiceError('validation_failed', `unknown tool: ${tool}`);

    const result = await this.executeTool(tool, input.input ?? {});

    const runId = input.run_id ?? `run_${randomUUID()}`;
    let run = await agentRepository.findRunById(runId);
    if (!run) {
      run = await agentRepository.createRun({ id: runId, agentId: agent.id, goal: String(input.input?.query ?? tool), status: 'running' });
    }
    const steps = [...(run.steps as unknown[]), { step: (run.steps as unknown[]).length + 1, tool, status: 'ok', result }];
    await agentRepository.updateRun(runId, { steps });
    return { run_id: runId, tool, result };
  }

  async toolResult(input: { run_id: string; step_index?: number }) {
    const run = await agentRepository.findRunById(input.run_id);
    if (!run) throw new ServiceError('resource_not_found', 'run not found');
    const steps = run.steps as unknown[];
    const idx = input.step_index ?? steps.length - 1;
    const step = steps[idx];
    if (!step) throw new ServiceError('resource_not_found', 'step not found');
    return { run_id: run.id, step_index: idx, ...(step as Record<string, unknown>) };
  }

  // ── A03: MCP ───────────────────────────────────────────────────────────────
  async mcpList(agentId?: number) {
    if (agentId !== undefined) {
      const agent = await this.view(agentId);
      const servers = agent.mcp_servers as unknown[];
      return { servers, total: servers.length };
    }
    return { servers: [], total: 0 };
  }

  async mcpTest(input: { name?: string; url?: string }) {
    const url = (input.url ?? '').trim();
    if (!url) throw new ServiceError('validation_failed', 'url is required to test an MCP server');
    const label = (input.name ?? '').trim() || url;
    const ref: McpServerRef = { url, name: label };
    const started = Date.now();
    try {
      // Real connection + protocol handshake, then optionally enumerate tools to
      // prove the server is a live MCP endpoint (not just any HTTP host).
      const info = await this.mcpClient.initialize(ref);
      let toolsCount: number | null = null;
      try {
        toolsCount = (await this.mcpClient.listTools(ref)).length;
      } catch {
        /* tools/list is optional for a reachable server */
      }
      return {
        server: label,
        reachable: true,
        protocol_version: info.protocolVersion,
        server_info: info.serverInfo,
        tools_count: toolsCount,
        latency_ms: Date.now() - started,
        checked_at: new Date().toISOString(),
      };
    } catch (err: any) {
      const e = err instanceof McpClientError ? err : new McpClientError('connection_failed', err?.message ?? String(err));
      return {
        server: label,
        reachable: false,
        error: { kind: e.kind, message: e.message },
        latency_ms: Date.now() - started,
        checked_at: new Date().toISOString(),
      };
    }
  }

  async mcpCall(input: { agent_id: number; server?: string; tool?: string; arguments?: Record<string, unknown> }) {
    const agent = await this.view(input.agent_id);
    const tool = String(input.tool ?? '').trim();
    if (!tool) throw new ServiceError('validation_failed', 'tool is required');
    const serverName = (input.server ?? '').trim();

    // Local builtin dispatch — only when no remote server is named, and only for
    // the built-in tool catalog. Local execution is always labeled `builtin` and
    // never presented as a remote call.
    if (!serverName) {
      if (!BUILTIN_TOOLS.some((t) => t.name === tool)) throw new ServiceError('validation_failed', `unknown tool: ${tool}`);
      const result = await this.executeTool(tool, input.arguments ?? {});
      return { server: 'builtin', tool, result, remote: false };
    }

    // Remote MCP dispatch — the named server must be configured on the agent, and
    // the call goes over the wire to that server (no local fallback).
    const ref = this.resolveServerRef(agent, serverName);
    try {
      const result = await this.mcpClient.callTool(ref, tool, input.arguments ?? {});
      return { server: serverName, tool, result, remote: true };
    } catch (err: any) {
      throw this.toServiceError(err);
    }
  }

  private resolveServerRef(agent: { mcp_servers?: unknown }, serverName: string): McpServerRef {
    const servers = Array.isArray(agent.mcp_servers) ? (agent.mcp_servers as Array<Record<string, unknown>>) : [];
    const found = servers.find((s) => (s?.name ?? s?.url) === serverName);
    if (!found) throw new ServiceError('resource_not_found', `MCP server '${serverName}' is not configured on this agent`);
    const url = String(found.url ?? '').trim();
    if (!url) throw new ServiceError('validation_failed', `MCP server '${serverName}' has no url`);
    return {
      name: serverName,
      url,
      token: typeof found.token === 'string' ? found.token : undefined,
      headers: found.headers && typeof found.headers === 'object' ? (found.headers as Record<string, string>) : undefined,
    };
  }

  private toServiceError(err: any): ServiceError {
    if (err instanceof ServiceError) return err;
    const e = err instanceof McpClientError ? err : new McpClientError('connection_failed', err?.message ?? String(err));
    switch (e.kind) {
      case 'tool_not_found':
        return new ServiceError('resource_not_found', e.message);
      case 'unsupported_scheme':
      case 'invalid_url':
      case 'ssrf_blocked':
      case 'invalid_response':
        return new ServiceError('validation_failed', e.message);
      default: // connection_failed, timeout, unauthorized, http_error, remote_error
        return new ServiceError('internal', e.message);
    }
  }

  // ── A04: skills ────────────────────────────────────────────────────────────
  async skillsList(input: { page?: number; page_size?: number }) {
    return agentRepository.listSkills({ page: input.page, pageSize: input.page_size });
  }

  async skillsInstall(input: { name?: string; description?: string; manifest?: Record<string, unknown> }) {
    if (!input.name?.trim()) throw new ServiceError('validation_failed', 'name is required');
    return agentRepository.upsertSkill({ name: input.name.trim(), description: input.description ?? '', manifest: input.manifest ?? {}, installed: true });
  }

  async skillsValidate(input: { name?: string; manifest?: Record<string, unknown> }) {
    let manifest = input.manifest;
    if (manifest === undefined && input.name) {
      const skill = await agentRepository.findSkillByName(input.name);
      manifest = skill?.manifest;
    }
    const errors: string[] = [];
    if (typeof manifest !== 'object' || manifest === null) errors.push('manifest must be an object');
    else {
      if (!manifest.name) errors.push('manifest.name is required');
      if (!manifest.version) errors.push('manifest.version is required');
    }
    return { valid: errors.length === 0, errors };
  }

  async skillsRead(input: { name?: string }) {
    const name = (input.name ?? '').trim();
    if (!name) throw new ServiceError('validation_failed', 'name is required');
    const skill = await agentRepository.findSkillByName(name);
    if (!skill) throw new ServiceError('resource_not_found', 'skill not found');
    return skill;
  }

  // ── A05: sandbox + artifacts ───────────────────────────────────────────────
  async sandboxStatus() {
    return { available: true, mode: 'in-process', description: 'deterministic in-process sandbox runner', checked_at: new Date().toISOString() };
  }

  async sandboxRun(input: { agent_id?: number; task?: string; payload?: Record<string, unknown> }) {
    const task = (input.task ?? 'echo').trim();
    const payload = input.payload ?? {};
    const result = await this.runSandboxTask(task, payload);
    const runId = `run_${randomUUID()}`;
    if (input.agent_id !== undefined) {
      await this.view(input.agent_id);
      await agentRepository.createRun({
        id: runId,
        agentId: input.agent_id,
        goal: `sandbox:${task}`,
        status: 'succeeded',
        steps: [{ step: 1, tool: `sandbox:${task}`, status: 'ok', result }],
        trace: {},
      });
    }
    const artifact = await agentRepository.createArtifact({ runId, name: task, data: result });
    return { run_id: runId, task, artifact_id: artifact.id, result };
  }

  async artifactList(input: { run_id?: string; agent_id?: number }) {
    if (input.run_id) {
      const items = await agentRepository.listArtifacts(input.run_id);
      return { items, total: items.length };
    }
    if (input.agent_id !== undefined) {
      const runs = await agentRepository.listRunsByAgent(input.agent_id);
      const items = await agentRepository.listArtifactsByRunIds(runs.map((r) => r.id));
      return { items, total: items.length };
    }
    return { items: [], total: 0 };
  }

  // ── A06: runtime control + trace ───────────────────────────────────────────
  async status(agentId: number) {
    const agent = await this.view(agentId);
    const latest = await agentRepository.findLatestRunByAgent(agentId);
    return {
      agent_id: agent.id,
      status: agent.status,
      latest_run: latest ? { run_id: latest.id, status: latest.status, goal: latest.goal } : null,
    };
  }

  async check(agentId: number) {
    const agent = await this.view(agentId);
    const checks = [
      { field: 'name', ok: !!agent.name.trim() },
      { field: 'instructions', ok: !!agent.instructions.trim() },
      { field: 'tools', ok: Array.isArray(agent.tools) },
    ];
    return { agent_id: agent.id, ok: checks.every((c) => c.ok), checks };
  }

  async stop(input: { agent_id?: number; run_id?: string }) {
    if (input.run_id) {
      const run = await agentRepository.findRunById(input.run_id);
      if (!run) throw new ServiceError('resource_not_found', 'run not found');
      await agentRepository.updateRun(input.run_id, { status: 'cancelled' });
      return { run_id: input.run_id, status: 'cancelled' };
    }
    if (input.agent_id !== undefined) {
      await this.view(input.agent_id);
      await agentRepository.updateAgent(input.agent_id, { status: 'stopped' });
      return { agent_id: input.agent_id, status: 'stopped' };
    }
    throw new ServiceError('validation_failed', 'agent_id or run_id is required');
  }

  async resume(input: { run_id: string }) {
    const run = await agentRepository.findRunById(input.run_id);
    if (!run) throw new ServiceError('resource_not_found', 'run not found');
    return this.run({ agent_id: run.agent_id, goal: run.goal });
  }

  async agentAsk(input: { agent_id: number; session_id?: string; question?: string; top_k?: number; method?: 'vector' | 'lexical' | 'hybrid'; user_id?: number }) {
    const question = (input.question ?? '').trim();
    if (!question) throw new ServiceError('validation_failed', 'question is required');
    const result = await this.run({ agent_id: input.agent_id, goal: question, top_k: input.top_k, method: input.method });

    if (input.session_id) {
      const session = await chatRepository.findSessionById(input.session_id);
      if (!session) throw new ServiceError('resource_not_found', 'session not found');
      if (input.user_id != null && session.user_id !== input.user_id) throw new ServiceError('resource_not_found', 'session not found');
      await chatRepository.createMessage({ id: `msg_${randomUUID()}`, sessionId: session.id, role: 'user', content: question });
      await chatRepository.createMessage({ id: `msg_${randomUUID()}`, sessionId: session.id, role: 'assistant', content: result.answer, citations: [], trace: result.trace });
      await chatRepository.touchSession(session.id);
    }
    return { ...result, session_id: input.session_id ?? null };
  }

  async trace(input: { run_id: string }) {
    const run = await agentRepository.findRunById(input.run_id);
    if (!run) throw new ServiceError('resource_not_found', 'run not found');
    return { run_id: run.id, agent_id: run.agent_id, goal: run.goal, status: run.status, steps: run.steps, trace: run.trace };
  }
}

export const agentService = new AgentService();
