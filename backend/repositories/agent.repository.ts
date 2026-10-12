// Agent repository (P6) — persistence for agents, their runs, installable
// skills, and sandbox artifacts. Mirrors the wiki/document domain: agents are
// soft-deleted, runs record ordered tool-call steps (never overwritten), and
// skills are upserted idempotently by name.
import { BaseRepository } from './base.js';
import { agents, agentRuns, agentSkills, agentArtifacts } from '../db/schema.js';
import { eq, and, isNull, desc, count, inArray } from 'drizzle-orm';

export interface AgentRow {
  id: number;
  name: string;
  description: string;
  instructions: string;
  model: string;
  tools: unknown[];
  mcp_servers: unknown[];
  skills: unknown[];
  status: 'idle' | 'running' | 'stopped' | 'error';
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AgentRunRow {
  id: string;
  agent_id: number;
  goal: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  steps: unknown[];
  answer: string;
  trace: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentSkillRow {
  id: number;
  name: string;
  description: string;
  manifest: Record<string, unknown>;
  installed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentArtifactRow {
  id: number;
  run_id: string;
  name: string;
  content_type: string;
  data: Record<string, unknown>;
  created_at: string;
}

function agentToRow(r: any): AgentRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    model: r.model,
    tools: r.tools,
    mcp_servers: r.mcpServers,
    skills: r.skills,
    status: r.status,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function runToRow(r: any): AgentRunRow {
  return {
    id: r.id,
    agent_id: r.agentId,
    goal: r.goal,
    status: r.status,
    steps: r.steps,
    answer: r.answer,
    trace: r.trace,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

function skillToRow(r: any): AgentSkillRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    manifest: r.manifest,
    installed: r.installed,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

function artifactToRow(r: any): AgentArtifactRow {
  return {
    id: r.id,
    run_id: r.runId,
    name: r.name,
    content_type: r.contentType,
    data: r.data,
    created_at: r.createdAt.toISOString(),
  };
}

export class AgentRepository extends BaseRepository {
  // ── Agents ────────────────────────────────────────────────────────────────
  async createAgent(input: {
    name: string;
    description?: string;
    instructions?: string;
    model?: string;
    tools?: unknown[];
    mcpServers?: unknown[];
    skills?: unknown[];
    createdBy?: number | null;
  }): Promise<AgentRow> {
    const [row] = await this.db
      .insert(agents)
      .values({
        name: input.name,
        description: input.description ?? '',
        instructions: input.instructions ?? '',
        model: input.model ?? '',
        tools: input.tools ?? [],
        mcpServers: input.mcpServers ?? [],
        skills: input.skills ?? [],
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return agentToRow(row);
  }

  async findAgentById(id: number): Promise<AgentRow | undefined> {
    const rows = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), isNull(agents.deletedAt)))
      .limit(1);
    return rows[0] ? agentToRow(rows[0]) : undefined;
  }

  async listAgents(userId: number, params?: { page?: number; pageSize?: number }): Promise<{ items: AgentRow[]; total: number }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = and(eq(agents.createdBy, userId), isNull(agents.deletedAt));
    const [{ value: total }] = await this.db.select({ value: count() }).from(agents).where(where);
    const rows = await this.db
      .select()
      .from(agents)
      .where(where)
      .orderBy(desc(agents.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(agentToRow), total: Number(total) };
  }

  async updateAgent(
    id: number,
    patch: { name?: string; description?: string; instructions?: string; model?: string; tools?: unknown[]; mcpServers?: unknown[]; skills?: unknown[]; status?: string },
  ): Promise<AgentRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.instructions !== undefined) data.instructions = patch.instructions;
    if (patch.model !== undefined) data.model = patch.model;
    if (patch.tools !== undefined) data.tools = patch.tools;
    if (patch.mcpServers !== undefined) data.mcpServers = patch.mcpServers;
    if (patch.skills !== undefined) data.skills = patch.skills;
    if (patch.status !== undefined) data.status = patch.status;
    const [row] = await this.db.update(agents).set(data).where(eq(agents.id, id)).returning();
    return row ? agentToRow(row) : undefined;
  }

  async softDeleteAgent(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(agents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agents.id, id), isNull(agents.deletedAt)))
      .returning({ id: agents.id });
    return !!row;
  }

  // ── Runs ──────────────────────────────────────────────────────────────────
  async createRun(input: { id: string; agentId: number; goal: string; status?: string; steps?: unknown[]; answer?: string; trace?: Record<string, unknown> }): Promise<AgentRunRow> {
    const [row] = await this.db
      .insert(agentRuns)
      .values({
        id: input.id,
        agentId: input.agentId,
        goal: input.goal,
        status: (input.status as any) ?? 'running',
        steps: input.steps ?? [],
        answer: input.answer ?? '',
        trace: input.trace ?? {},
      })
      .returning();
    return runToRow(row);
  }

  async findRunById(id: string): Promise<AgentRunRow | undefined> {
    const rows = await this.db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
    return rows[0] ? runToRow(rows[0]) : undefined;
  }

  /** Resolve a run together with its owning user (`agents.created_by`) via a
   *  join, so object-level authorization can be enforced for run_id-addressed
   *  operations (resume/trace/stop/tool_result/artifact_list) that carry no
   *  agent_id. Returns `undefined` when the run does not exist; a NULL owner
   *  (user deleted → created_by set null) is returned as `created_by: null` and
   *  must be default-denied by the caller. */
  async findRunWithOwnerById(id: string): Promise<(AgentRunRow & { created_by: number | null }) | undefined> {
    const rows = await this.db
      .select({
        id: agentRuns.id,
        agentId: agentRuns.agentId,
        goal: agentRuns.goal,
        status: agentRuns.status,
        steps: agentRuns.steps,
        answer: agentRuns.answer,
        trace: agentRuns.trace,
        createdAt: agentRuns.createdAt,
        updatedAt: agentRuns.updatedAt,
        createdBy: agents.createdBy,
      })
      .from(agentRuns)
      .innerJoin(agents, eq(agentRuns.agentId, agents.id))
      .where(eq(agentRuns.id, id))
      .limit(1);
    if (!rows[0]) return undefined;
    return { ...runToRow(rows[0]), created_by: rows[0].createdBy };
  }

  async listRunsByAgent(agentId: number, params?: { limit?: number }): Promise<AgentRunRow[]> {
    const rows = await this.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agentId))
      .orderBy(desc(agentRuns.createdAt))
      .limit(params?.limit ?? 50);
    return rows.map(runToRow);
  }

  async findLatestRunByAgent(agentId: number): Promise<AgentRunRow | undefined> {
    const rows = await this.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agentId))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    return rows[0] ? runToRow(rows[0]) : undefined;
  }

  async updateRun(
    id: string,
    patch: { status?: string; steps?: unknown[]; answer?: string; trace?: Record<string, unknown> },
  ): Promise<AgentRunRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.steps !== undefined) data.steps = patch.steps;
    if (patch.answer !== undefined) data.answer = patch.answer;
    if (patch.trace !== undefined) data.trace = patch.trace;
    const [row] = await this.db.update(agentRuns).set(data).where(eq(agentRuns.id, id)).returning();
    return row ? runToRow(row) : undefined;
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  async listSkills(params?: { page?: number; pageSize?: number }): Promise<{ items: AgentSkillRow[]; total: number }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const [{ value: total }] = await this.db.select({ value: count() }).from(agentSkills);
    const rows = await this.db
      .select()
      .from(agentSkills)
      .orderBy(desc(agentSkills.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(skillToRow), total: Number(total) };
  }

  async findSkillByName(name: string): Promise<AgentSkillRow | undefined> {
    const rows = await this.db.select().from(agentSkills).where(eq(agentSkills.name, name)).limit(1);
    return rows[0] ? skillToRow(rows[0]) : undefined;
  }

  async upsertSkill(input: { name: string; description?: string; manifest?: Record<string, unknown>; installed?: boolean }): Promise<AgentSkillRow> {
    const [row] = await this.db
      .insert(agentSkills)
      .values({
        name: input.name,
        description: input.description ?? '',
        manifest: input.manifest ?? {},
        installed: input.installed ?? false,
      })
      .onConflictDoUpdate({
        target: agentSkills.name,
        set: {
          description: input.description ?? '',
          manifest: input.manifest ?? {},
          installed: input.installed ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();
    return skillToRow(row);
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────
  async createArtifact(input: { runId: string; name: string; contentType?: string; data?: Record<string, unknown> }): Promise<AgentArtifactRow> {
    const [row] = await this.db
      .insert(agentArtifacts)
      .values({ runId: input.runId, name: input.name, contentType: input.contentType ?? 'application/json', data: input.data ?? {} })
      .returning();
    return artifactToRow(row);
  }

  async listArtifacts(runId?: string): Promise<AgentArtifactRow[]> {
    const rows = runId
      ? await this.db.select().from(agentArtifacts).where(eq(agentArtifacts.runId, runId)).orderBy(agentArtifacts.id)
      : await this.db.select().from(agentArtifacts).orderBy(agentArtifacts.id);
    return rows.map(artifactToRow);
  }

  async listArtifactsByRunIds(runIds: string[]): Promise<AgentArtifactRow[]> {
    if (runIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(agentArtifacts)
      .where(inArray(agentArtifacts.runId, runIds))
      .orderBy(agentArtifacts.id);
    return rows.map(artifactToRow);
  }
}

export const agentRepository = new AgentRepository();
