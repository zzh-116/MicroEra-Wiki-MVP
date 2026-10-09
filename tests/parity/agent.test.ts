// P6 — agent service: agent CRUD + grounded run, tool execution, skills, the
// in-process sandbox, and session-bound agent ask, with the repository and
// retrieval mocked out for determinism.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { agentService } from '../../backend/services/agent.service.js';
import { agentRepository } from '../../backend/repositories/agent.repository.js';
import { chatRepository } from '../../backend/repositories/chat.repository.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';

function agent(id = 1, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    name: 'Research',
    description: '',
    instructions: 'Gather evidence',
    model: '',
    tools: [],
    mcp_servers: [],
    skills: [],
    status: 'idle',
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function hit(document_id: number, chunk_id = `c${document_id}`): any {
  return { chunk_id, document_id, title: `Doc ${document_id}`, text: `chunk text ${document_id}`, heading: `H${document_id}`, score: 0.9 };
}

describe('P6 agent service — CRUD + run', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('create rejects an empty name', async () => {
    await expect(agentService.create({})).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('create persists an agent', async () => {
    vi.spyOn(agentRepository, 'createAgent').mockResolvedValue(agent());
    const a: any = await agentService.create({ name: 'Research', instructions: 'Gather evidence' });
    expect(a.name).toBe('Research');
  });

  it('run retrieves + synthesizes a grounded answer and records steps', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    const createRun = vi.spyOn(agentRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id, agent_id: r.agentId, goal: r.goal, status: r.status, steps: r.steps ?? [], answer: r.answer ?? '', trace: r.trace ?? {}, created_at: '', updated_at: '',
    }));
    const updateRun = vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(2), hit(3)]);

    const r: any = await agentService.run({ agent_id: 1, goal: 'zeolite', method: 'hybrid', top_k: 4 });

    expect(r.status).toBe('succeeded');
    expect(r.answer).toContain('Doc 2');
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ agentId: 1, goal: 'zeolite', status: 'running' }));
    expect(updateRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'succeeded', answer: expect.stringContaining('Doc 2') }));
  });

  it('run rejects an empty goal', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    await expect(agentService.run({ agent_id: 1, goal: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});

describe('P6 agent service — tools + MCP', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('toolCall rejects an unknown tool', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    await expect(agentService.toolCall({ agent_id: 1, tool: 'nope' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('toolCall executes the retrieve tool and records a step', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(2)]);
    vi.spyOn(agentRepository, 'findRunById').mockResolvedValue(undefined);
    vi.spyOn(agentRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id, agent_id: r.agentId, goal: r.goal, status: 'running', steps: [], answer: '', trace: {}, created_at: '', updated_at: '',
    }));
    const updateRun = vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);

    const r: any = await agentService.toolCall({ agent_id: 1, tool: 'retrieve', input: { query: 'zeolite' } });

    expect(r.tool).toBe('retrieve');
    expect(r.result.num_hits).toBe(1);
    expect(updateRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ steps: expect.arrayContaining([expect.objectContaining({ tool: 'retrieve' })]) }));
  });

  it('mcpCall routes a known tool through the executor', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(1)]);
    const r: any = await agentService.mcpCall({ agent_id: 1, tool: 'retrieve', arguments: { query: 'x' } });
    expect(r.result.num_hits).toBe(1);
  });
});

describe('P6 agent service — skills + sandbox', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('skillsValidate flags a manifest missing name/version', async () => {
    const r: any = await agentService.skillsValidate({ manifest: { description: 'x' } });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('manifest.name is required');
    expect(r.errors).toContain('manifest.version is required');
  });

  it('skillsInstall upserts an installed skill', async () => {
    vi.spyOn(agentRepository, 'upsertSkill').mockResolvedValue({ id: 1, name: 'research', description: '', manifest: {}, installed: true, created_at: '', updated_at: '' });
    const s: any = await agentService.skillsInstall({ name: 'research' });
    expect(s.installed).toBe(true);
  });

  it('sandboxRun executes a safe task and stores an artifact', async () => {
    const createArtifact = vi.spyOn(agentRepository, 'createArtifact').mockResolvedValue({ id: 9, run_id: 'run_x', name: 'count_tokens', content_type: 'application/json', data: { tokens: 2 }, created_at: '' });
    const r: any = await agentService.sandboxRun({ task: 'count_tokens', payload: { text: 'hello world' } });
    expect(r.result.tokens).toBe(2);
    expect(createArtifact).toHaveBeenCalledWith(expect.objectContaining({ name: 'count_tokens', data: { tokens: 2 } }));
  });
});

describe('P6 agent service — session-bound ask', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('agentAsk runs the agent and persists the Q&A into the session', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(agentRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id, agent_id: r.agentId, goal: r.goal, status: 'succeeded', steps: [], answer: 'answer', trace: {}, created_at: '', updated_at: '',
    }));
    vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(2)]);
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue({ id: 'sess_1', user_id: 7, title: 't', kb_ids: [], scope: {}, created_at: '', updated_at: '', deleted_at: null } as any);
    const createMessage = vi.spyOn(chatRepository, 'createMessage').mockResolvedValue(undefined);
    const touch = vi.spyOn(chatRepository, 'touchSession').mockResolvedValue(undefined);

    const r: any = await agentService.agentAsk({ agent_id: 1, session_id: 'sess_1', question: 'zeolite', user_id: 7 });

    expect(r.session_id).toBe('sess_1');
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenCalledWith('sess_1');
  });
});
