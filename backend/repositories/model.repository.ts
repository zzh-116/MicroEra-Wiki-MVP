// Model repository (P8 M01/M03) — persistence for the LLM/embedding/rerank model
// registry. Models are soft-deleted; `setDefault` keeps at most one default per
// kind by clearing the previous default before flagging the new one.
import { BaseRepository } from './base.js';
import { models } from '../db/schema.js';
import { eq, and, isNull, desc, count, asc } from 'drizzle-orm';

export type ModelKind = 'llm' | 'embedding' | 'rerank';

export interface ModelRow {
  id: number;
  name: string;
  kind: ModelKind;
  provider: string;
  model_name: string;
  base_url: string | null;
  config: Record<string, unknown>;
  is_default: boolean;
  status: 'active' | 'disabled';
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function modelToRow(r: any): ModelRow {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    provider: r.provider,
    model_name: r.modelName,
    base_url: r.baseUrl,
    config: r.config,
    is_default: r.isDefault,
    status: r.status,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

export interface CreateModelInput {
  name: string;
  kind: ModelKind;
  provider?: string;
  modelName: string;
  baseUrl?: string | null;
  config?: Record<string, unknown>;
  isDefault?: boolean;
  createdBy?: number | null;
}

export class ModelRepository extends BaseRepository {
  async createModel(input: CreateModelInput): Promise<ModelRow> {
    const [row] = await this.db
      .insert(models)
      .values({
        name: input.name,
        kind: input.kind,
        provider: input.provider ?? 'ollama',
        modelName: input.modelName,
        baseUrl: input.baseUrl ?? null,
        config: input.config ?? {},
        isDefault: input.isDefault ?? false,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return modelToRow(row);
  }

  async findModelById(id: number): Promise<ModelRow | undefined> {
    const rows = await this.db
      .select()
      .from(models)
      .where(and(eq(models.id, id), isNull(models.deletedAt)))
      .limit(1);
    return rows[0] ? modelToRow(rows[0]) : undefined;
  }

  async listModels(params?: { kind?: string; page?: number; pageSize?: number }): Promise<{ items: ModelRow[]; total: number }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = params?.kind ? and(isNull(models.deletedAt), eq(models.kind, params.kind)) : isNull(models.deletedAt);
    const [{ value: total }] = await this.db.select({ value: count() }).from(models).where(where);
    const rows = await this.db
      .select()
      .from(models)
      .where(where)
      .orderBy(desc(models.updatedAt))
      .limit(ps)
      .offset((pg - 1) * ps);
    return { items: rows.map(modelToRow), total: Number(total) };
  }

  async listByKind(kind: ModelKind): Promise<ModelRow[]> {
    const rows = await this.db
      .select()
      .from(models)
      .where(and(isNull(models.deletedAt), eq(models.kind, kind)))
      .orderBy(asc(models.id));
    return rows.map(modelToRow);
  }

  async updateModel(
    id: number,
    patch: {
      name?: string;
      kind?: ModelKind;
      provider?: string;
      modelName?: string;
      baseUrl?: string | null;
      config?: Record<string, unknown>;
      status?: string;
    },
  ): Promise<ModelRow | undefined> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.kind !== undefined) data.kind = patch.kind;
    if (patch.provider !== undefined) data.provider = patch.provider;
    if (patch.modelName !== undefined) data.modelName = patch.modelName;
    if (patch.baseUrl !== undefined) data.baseUrl = patch.baseUrl;
    if (patch.config !== undefined) data.config = patch.config;
    if (patch.status !== undefined) data.status = patch.status;
    const [row] = await this.db.update(models).set(data).where(eq(models.id, id)).returning();
    return row ? modelToRow(row) : undefined;
  }

  async softDeleteModel(id: number): Promise<boolean> {
    const [row] = await this.db
      .update(models)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(models.id, id), isNull(models.deletedAt)))
      .returning({ id: models.id });
    return !!row;
  }

  /** Make `id` the sole default model of its kind (clear prior default first). */
  async setDefault(id: number): Promise<ModelRow | undefined> {
    const target = await this.findModelById(id);
    if (!target) return undefined;
    await this.db
      .update(models)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(models.kind, target.kind), isNull(models.deletedAt), eq(models.isDefault, true)));
    const [row] = await this.db
      .update(models)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(models.id, id))
      .returning();
    return row ? modelToRow(row) : undefined;
  }
}

export const modelRepository = new ModelRepository();
