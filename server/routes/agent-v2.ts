// Agent v2 operations — REST surface for the agent.* / skills.* /
// session.agent_ask verbs (P6). Mirrors the other v2 routers: handlers resolve
// a ServiceError onto the wire contract so CLI/MCP clients see identical JSON.
//
// Object-level authorization: every agent/run operation is scoped to the
// authenticated user (`uid(req)` from the verified JWT). The service enforces
// ownership and returns `resource_not_found` for resources owned by another user
// (or with no owner), so resource existence is never disclosed. Skills are a
// shared, ownerless catalog and remain unscoped.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { agentService } from '../../backend/services/agent.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const agentV2Router = Router();

agentV2Router.use(requireAuth);

function toInt(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const ERROR_STATUS: Record<ServiceError['kind'], number> = {
  resource_not_found: 404,
  validation_failed: 400,
  conflict: 409,
  internal: 500,
};

async function handle(
  op: string,
  req: Request,
  res: Response,
  fn: () => Promise<unknown>,
): Promise<void> {
  const trace = newTraceId();
  try {
    const data = await fn();
    res.json(ok(op, data, trace));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      const status = ERROR_STATUS[err.kind];
      res.status(status).json(fail(op, err.kind as ErrorKindKey, err.message, trace));
      return;
    }
    res.status(500).json(fail(op, 'internal', err?.message ?? 'internal error', trace));
  }
}

function uid(req: Request): number {
  return req.user!.userId;
}

function idFrom(req: Request, key: string): any {
  return req.query?.[key] ?? req.body?.[key];
}

// ── A01: agent CRUD + run ────────────────────────────────────────────────────
agentV2Router.post('/agent/create', (req, res) =>
  handle('agent.create', req, res, () =>
    agentService.create({
      name: req.body?.name,
      description: req.body?.description,
      instructions: req.body?.instructions,
      model: req.body?.model,
      tools: req.body?.tools,
      mcp_servers: req.body?.mcp_servers,
      skills: req.body?.skills,
      created_by: uid(req),
    })));

agentV2Router.get('/agent/list', (req, res) =>
  handle('agent.list', req, res, () =>
    agentService.list(uid(req), { page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

agentV2Router.get('/agent/view', (req, res) =>
  handle('agent.view', req, res, () => agentService.view(uid(req), Number(idFrom(req, 'agent_id')))));

agentV2Router.patch('/agent/update', (req, res) =>
  handle('agent.update', req, res, () =>
    agentService.update(uid(req), Number(req.body?.agent_id), {
      name: req.body?.name,
      description: req.body?.description,
      instructions: req.body?.instructions,
      model: req.body?.model,
      tools: req.body?.tools,
      mcp_servers: req.body?.mcp_servers,
      skills: req.body?.skills,
    })));

agentV2Router.delete('/agent/delete', (req, res) =>
  handle('agent.delete', req, res, () => agentService.remove(uid(req), Number(idFrom(req, 'agent_id')))));

agentV2Router.post('/agent/run', (req, res) =>
  handle('agent.run', req, res, () =>
    agentService.run(uid(req), {
      agent_id: Number(req.body?.agent_id),
      goal: req.body?.goal,
      kb_id: toInt(req.body?.kb_id),
      top_k: toInt(req.body?.top_k),
      method: req.body?.method,
    })));

// ── A02: tools ───────────────────────────────────────────────────────────────
agentV2Router.get('/agent/tools', (req, res) =>
  handle('agent.tools', req, res, () => agentService.tools(uid(req), toInt(req.query.agent_id))));

agentV2Router.post('/agent/tool_call', (req, res) =>
  handle('agent.tool_call', req, res, () =>
    agentService.toolCall(uid(req), {
      agent_id: Number(req.body?.agent_id),
      tool: req.body?.tool,
      input: req.body?.input,
      run_id: req.body?.run_id,
    })));

agentV2Router.post('/agent/tool_result', (req, res) =>
  handle('agent.tool_result', req, res, () =>
    agentService.toolResult(uid(req), { run_id: String(req.body?.run_id ?? ''), step_index: toInt(req.body?.step_index) })));

// ── A03: MCP ─────────────────────────────────────────────────────────────────
agentV2Router.get('/agent/mcp_list', (req, res) =>
  handle('agent.mcp_list', req, res, () => agentService.mcpList(uid(req), toInt(req.query.agent_id))));

agentV2Router.post('/agent/mcp_test', (req, res) =>
  handle('agent.mcp_test', req, res, () =>
    agentService.mcpTest({ name: req.body?.name, url: req.body?.url })));

agentV2Router.post('/agent/mcp_call', (req, res) =>
  handle('agent.mcp_call', req, res, () =>
    agentService.mcpCall(uid(req), {
      agent_id: Number(req.body?.agent_id),
      server: req.body?.server,
      tool: req.body?.tool,
      arguments: req.body?.arguments,
    })));

// ── A04: skills ──────────────────────────────────────────────────────────────
agentV2Router.get('/skills/list', (req, res) =>
  handle('skills.list', req, res, () =>
    agentService.skillsList({ page: toInt(req.query.page), page_size: toInt(req.query.page_size) })));

agentV2Router.post('/skills/install', (req, res) =>
  handle('skills.install', req, res, () =>
    agentService.skillsInstall({ name: req.body?.name, description: req.body?.description, manifest: req.body?.manifest })));

agentV2Router.post('/skills/validate', (req, res) =>
  handle('skills.validate', req, res, () =>
    agentService.skillsValidate({ name: req.body?.name, manifest: req.body?.manifest })));

agentV2Router.get('/skills/read', (req, res) =>
  handle('skills.read', req, res, () => agentService.skillsRead({ name: String(idFrom(req, 'name') ?? '') })));

// ── A05: sandbox + artifacts ─────────────────────────────────────────────────
agentV2Router.get('/agent/sandbox_status', (req, res) =>
  handle('agent.sandbox_status', req, res, () => agentService.sandboxStatus()));

agentV2Router.post('/agent/sandbox_run', (req, res) =>
  handle('agent.sandbox_run', req, res, () =>
    agentService.sandboxRun(uid(req), { agent_id: toInt(req.body?.agent_id), task: req.body?.task, payload: req.body?.payload })));

agentV2Router.get('/agent/artifact_list', (req, res) =>
  handle('agent.artifact_list', req, res, () =>
    agentService.artifactList(uid(req), { run_id: req.query.run_id ? String(req.query.run_id) : undefined, agent_id: toInt(req.query.agent_id) })));

// ── A06: runtime control + trace ─────────────────────────────────────────────
agentV2Router.get('/agent/status', (req, res) =>
  handle('agent.status', req, res, () => agentService.status(uid(req), Number(idFrom(req, 'agent_id')))));

agentV2Router.get('/agent/check', (req, res) =>
  handle('agent.check', req, res, () => agentService.check(uid(req), Number(idFrom(req, 'agent_id')))));

agentV2Router.post('/agent/stop', (req, res) =>
  handle('agent.stop', req, res, () =>
    agentService.stop(uid(req), { agent_id: toInt(req.body?.agent_id), run_id: req.body?.run_id })));

agentV2Router.post('/agent/resume', (req, res) =>
  handle('agent.resume', req, res, () => agentService.resume(uid(req), { run_id: String(req.body?.run_id ?? '') })));

agentV2Router.post('/session/agent_ask', (req, res) =>
  handle('session.agent_ask', req, res, () =>
    agentService.agentAsk(uid(req), {
      agent_id: Number(req.body?.agent_id),
      session_id: req.body?.session_id,
      question: req.body?.question,
      top_k: toInt(req.body?.top_k),
      method: req.body?.method,
    })));

agentV2Router.get('/agent/trace', (req, res) =>
  handle('agent.trace', req, res, () => agentService.trace(uid(req), { run_id: String(idFrom(req, 'run_id') ?? '') })));
