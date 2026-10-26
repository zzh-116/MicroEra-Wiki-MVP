// P6 — agent service: agent CRUD + grounded run, tool execution, skills, the
// in-process sandbox, and session-bound agent ask, with the repository and
// retrieval mocked out for determinism. All object-scoped operations pass the
// authenticated user id (7) as the first argument; ownership enforcement is
// covered separately in agent-auth.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { agentService } from '../../backend/services/agent.service.js';
import { agentRepository } from '../../backend/repositories/agent.repository.js';
import { chatRepository } from '../../backend/repositories/chat.repository.js';
import { retrievalService } from '../../backend/services/retrieval.service.js';
import { knowledgeChunkRepository } from '../../backend/repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../../backend/repositories/knowledge.repository.js';

const UID = 7;

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
    created_by: UID,
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

    const r: any = await agentService.run(UID, { agent_id: 1, goal: 'zeolite', method: 'hybrid', top_k: 4 });

    expect(r.status).toBe('succeeded');
    expect(r.answer).toContain('Doc 2');
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ agentId: 1, goal: 'zeolite', status: 'running' }));
    expect(updateRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'succeeded', answer: expect.stringContaining('Doc 2') }));
  });

  it('run rejects an empty goal', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    await expect(agentService.run(UID, { agent_id: 1, goal: '  ' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });
});

describe('P6 agent service — tools + MCP', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('toolCall rejects an unknown tool', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    await expect(agentService.toolCall(UID, { agent_id: 1, tool: 'nope' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('toolCall executes the retrieve tool and records a step', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(2)]);
    vi.spyOn(agentRepository, 'findRunById').mockResolvedValue(undefined);
    vi.spyOn(agentRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id, agent_id: r.agentId, goal: r.goal, status: 'running', steps: [], answer: '', trace: {}, created_at: '', updated_at: '',
    }));
    const updateRun = vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);

    const r: any = await agentService.toolCall(UID, { agent_id: 1, tool: 'retrieve', input: { query: 'zeolite' } });

    expect(r.tool).toBe('retrieve');
    expect(r.result.num_hits).toBe(1);
    expect(updateRun).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ steps: expect.arrayContaining([expect.objectContaining({ tool: 'retrieve' })]) }));
  });

  it('mcpCall routes a known tool through the executor', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(1)]);
    const r: any = await agentService.mcpCall(UID, { agent_id: 1, tool: 'retrieve', arguments: { query: 'x' } });
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
    const r: any = await agentService.sandboxRun(UID, { task: 'count_tokens', payload: { text: 'hello world' } });
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
    vi.spyOn(chatRepository, 'findSessionById').mockResolvedValue({ id: 'sess_1', user_id: UID, title: 't', kb_ids: [], scope: {}, created_at: '', updated_at: '', deleted_at: null } as any);
    const createMessage = vi.spyOn(chatRepository, 'createMessage').mockResolvedValue(undefined);
    const touch = vi.spyOn(chatRepository, 'touchSession').mockResolvedValue(undefined);

    const r: any = await agentService.agentAsk(UID, { agent_id: 1, session_id: 'sess_1', question: 'zeolite' });

    expect(r.session_id).toBe('sess_1');
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenCalledWith('sess_1');
  });
});

describe('P6 agent service — E1/E4/E5 config honesty + resume semantics', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function runMocks() {
    const createRun = vi.spyOn(agentRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id, agent_id: r.agentId, goal: r.goal, status: r.status, steps: r.steps ?? [], answer: r.answer ?? '', trace: r.trace ?? {}, created_at: '', updated_at: '',
    }));
    const updateRun = vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);
    vi.spyOn(retrievalService, 'filteredSearch').mockResolvedValue([hit(2)]);
    return { createRun, updateRun };
  }

  // E1 — tools whitelist is honored and unknown names are rejected.
  it('run rejects when retrieve is not in the agent tool whitelist', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { tools: ['wiki_search'] }));
    await expect(agentService.run(UID, { agent_id: 1, goal: 'zeolite' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('run rejects an unknown tool name in the agent config', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { tools: ['retrieve', 'bogus'] }));
    await expect(agentService.run(UID, { agent_id: 1, goal: 'zeolite' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('toolCall rejects a builtin tool that is not whitelisted', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { tools: ['retrieve'] }));
    await expect(agentService.toolCall(UID, { agent_id: 1, tool: 'wiki_search' })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('mcpCall (local builtin) rejects a tool that is not whitelisted', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { tools: ['echo'] }));
    await expect(agentService.mcpCall(UID, { agent_id: 1, tool: 'retrieve', arguments: { query: 'x' } })).rejects.toMatchObject({ kind: 'validation_failed' });
  });

  it('mcpCall (local builtin) allows a whitelisted tool', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { tools: ['echo'] }));
    const r: any = await agentService.mcpCall(UID, { agent_id: 1, tool: 'echo', arguments: { value: 'hi' } });
    expect(r.remote).toBe(false);
    expect(r.result.value).toBe('hi');
  });

  // E1 — model + instructions capability honesty.
  it('run surfaces a capability limit when agent.model is configured', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { model: 'gpt-4', instructions: '' }));
    runMocks();
    const r: any = await agentService.run(UID, { agent_id: 1, goal: 'zeolite' });
    expect(r.capability_limits).toEqual(expect.arrayContaining([expect.stringContaining('model-driven synthesis')]));
  });

  it('run passes instructions as context and records the limitation', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { instructions: 'Answer in bullet points' }));
    runMocks();
    const r: any = await agentService.run(UID, { agent_id: 1, goal: 'zeolite' });
    expect(r.answer).toContain('Answer in bullet points');
    expect(r.capability_limits).toEqual(expect.arrayContaining([expect.stringContaining('cannot guarantee')]));
  });

  it('run reports no capability limits when model and instructions are empty', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent(1, { model: '', instructions: '' }));
    runMocks();
    const r: any = await agentService.run(UID, { agent_id: 1, goal: 'zeolite' });
    expect(r.capability_limits).toBeUndefined();
  });

  // E4 — resume (Option A) reads a completed result; never re-runs.
  it('resume returns the saved result of a succeeded run without re-running', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue({ id: 'run_1', agent_id: 1, goal: 'zeolite', status: 'succeeded', steps: [{ step: 1, tool: 'retrieve' }], answer: 'saved answer', trace: {}, created_at: '', updated_at: '', created_by: UID });
    const createRun = vi.spyOn(agentRepository, 'createRun');
    const updateRun = vi.spyOn(agentRepository, 'updateRun');
    const r: any = await agentService.resume(UID, { run_id: 'run_1' });
    expect(r.run_id).toBe('run_1');
    expect(r.status).toBe('succeeded');
    expect(r.answer).toBe('saved answer');
    expect(createRun).not.toHaveBeenCalled();
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('resume rejects a failed run without re-running', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue({ id: 'run_1', agent_id: 1, goal: 'zeolite', status: 'failed', steps: [], answer: '', trace: {}, created_at: '', updated_at: '', created_by: UID });
    const createRun = vi.spyOn(agentRepository, 'createRun');
    await expect(agentService.resume(UID, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'conflict' });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('resume rejects a cancelled run', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue({ id: 'run_1', agent_id: 1, goal: 'zeolite', status: 'cancelled', steps: [], answer: '', trace: {}, created_at: '', updated_at: '', created_by: UID });
    await expect(agentService.resume(UID, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('resume rejects a running run', async () => {
    vi.spyOn(agentRepository, 'findRunWithOwnerById').mockResolvedValue({ id: 'run_1', agent_id: 1, goal: 'zeolite', status: 'running', steps: [], answer: '', trace: {}, created_at: '', updated_at: '', created_by: UID });
    await expect(agentService.resume(UID, { run_id: 'run_1' })).rejects.toMatchObject({ kind: 'conflict' });
  });

  // E5 — sandbox status honesty.
  it('sandboxStatus honestly reports no isolation and lists capabilities', async () => {
    const s: any = await agentService.sandboxStatus();
    expect(s.available).toBe(true);
    expect(s.mode).toBe('in-process');
    expect(s.isolated).toBe(false);
    expect(s.isolation).toBe('none');
    expect(s.capabilities).toEqual(['echo', 'count_tokens', 'checksum', 'sum']);
  });
});

describe('P6 agent service — lookup access control (P1-1)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function chunk(document_id: number, id = 'chunk_1'): any {
    return { id, document_id, index: 0, text: 'SECRET chunk text', strategy: 'markdown', heading: 'H', start_char: 0, end_char: 10, metadata: {}, created_at: '', updated_at: '' };
  }

  it('lookup returns chunk text when the parent document is reachable', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue(chunk(2));
    vi.spyOn(knowledgeRepository, 'findDocumentById').mockResolvedValue({ id: 2, title: 'Doc 2' } as any);
    // `toolCall` persists a run after the tool executes — mock all three so the
    // test never reaches the real repository (and thus the dev database).
    vi.spyOn(agentRepository, 'findRunById').mockResolvedValue(undefined);
    vi.spyOn(agentRepository, 'createRun').mockImplementation(async (r: any) => ({
      id: r.id, agent_id: r.agentId, goal: r.goal, status: 'running', steps: [], answer: '', trace: {}, created_at: '', updated_at: '',
    }));
    vi.spyOn(agentRepository, 'updateRun').mockResolvedValue(undefined);

    const r: any = await agentService.toolCall(UID, { agent_id: 1, tool: 'lookup', input: { chunk_id: 'chunk_1' } });
    expect(r.result.text).toBe('SECRET chunk text');
    expect(r.result.title).toBe('Doc 2');
  });

  it('lookup throws resource_not_found (no leak) when the parent doc is in a deleted KB', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue(chunk(2));
    // KB-aware finder returns undefined → the chunk text must never be exposed.
    vi.spyOn(knowledgeRepository, 'findDocumentById').mockResolvedValue(undefined);

    await expect(agentService.toolCall(UID, { agent_id: 1, tool: 'lookup', input: { chunk_id: 'chunk_1' } }))
      .rejects.toMatchObject({ kind: 'resource_not_found' });
  });

  it('mcpCall builtin lookup also blocks a deleted-KB chunk (no leak)', async () => {
    vi.spyOn(agentRepository, 'findAgentById').mockResolvedValue(agent());
    vi.spyOn(knowledgeChunkRepository, 'findById').mockResolvedValue(chunk(2));
    vi.spyOn(knowledgeRepository, 'findDocumentById').mockResolvedValue(undefined);

    await expect(agentService.mcpCall(UID, { agent_id: 1, tool: 'lookup', arguments: { chunk_id: 'chunk_1' } }))
      .rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
