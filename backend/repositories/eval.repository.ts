// Eval repository (P3-05) — persistence for retrieval evaluation datasets,
// their relevance-judgement items, and recorded runs. The dataset list returns
// a per-dataset item count without pulling the full item arrays; the detail
// load (findDatasetById) returns items so `eval.run` can score against them.
import { BaseRepository } from './base.js';
import { evalDatasets, evalDatasetItems, evalRuns } from '../db/schema.js';
import { eq, and, isNull, inArray, desc, count, sql } from 'drizzle-orm';

export interface EvalDatasetItemRow {
  id: number;
  dataset_id: number;
  query: string;
  relevant_document_ids: number[];
}

export interface EvalDatasetRow {
  id: number;
  name: string;
  kb_id: number | null;
  description: string;
  method: 'vector' | 'lexical' | 'hybrid';
  created_at: string;
  deleted_at: string | null;
  items: EvalDatasetItemRow[];
}

export interface EvalRunRow {
  id: string;
  dataset_id: number;
  method: string;
  params: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  metrics: Record<string, number>;
  per_query: unknown[];
  created_at: string;
}

function datasetToRow(r: any): Omit<EvalDatasetRow, 'items'> {
  return {
    id: r.id,
    name: r.name,
    kb_id: r.kbId ?? null,
    description: r.description,
    method: r.method,
    created_at: r.createdAt.toISOString(),
    deleted_at: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

function itemToRow(r: any): EvalDatasetItemRow {
  return {
    id: r.id,
    dataset_id: r.datasetId,
    query: r.query,
    relevant_document_ids: Array.isArray(r.relevantDocumentIds) ? r.relevantDocumentIds : [],
  };
}

function runToRow(r: any): EvalRunRow {
  return {
    id: r.id,
    dataset_id: r.datasetId,
    method: r.method,
    params: r.params ?? {},
    status: r.status,
    metrics: r.metrics ?? {},
    per_query: Array.isArray(r.perQuery) ? r.perQuery : [],
    created_at: r.createdAt.toISOString(),
  };
}

export class EvalRepository extends BaseRepository {
  async createDataset(input: {
    name: string;
    kbId?: number;
    description?: string;
    method?: 'vector' | 'lexical' | 'hybrid';
    queries: Array<{ query: string; relevant_document_ids: number[] }>;
  }): Promise<EvalDatasetRow> {
    const [ds] = await this.db
      .insert(evalDatasets)
      .values({
        name: input.name,
        kbId: input.kbId ?? null,
        description: input.description ?? '',
        method: input.method ?? 'hybrid',
      })
      .returning();

    const items: EvalDatasetItemRow[] = [];
    if (input.queries.length > 0) {
      const rows = await this.db
        .insert(evalDatasetItems)
        .values(
          input.queries.map((q) => ({
            datasetId: ds.id,
            query: q.query,
            relevantDocumentIds: q.relevant_document_ids ?? [],
          })),
        )
        .returning();
      items.push(...rows.map(itemToRow));
    }

    return { ...datasetToRow(ds), items };
  }

  async listDatasets(params?: { page?: number; pageSize?: number }): Promise<{
    items: Array<Omit<EvalDatasetRow, 'items'> & { item_count: number }>;
    total: number;
  }> {
    const pg = params?.page ?? 1;
    const ps = params?.pageSize ?? 50;
    const where = isNull(evalDatasets.deletedAt);
    const itemCount = sql<number>`(select count(*)::int from eval_dataset_items where dataset_id = eval_datasets.id)`;

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(evalDatasets)
      .where(where);
    const rows = await this.db
      .select({
        id: evalDatasets.id,
        name: evalDatasets.name,
        kbId: evalDatasets.kbId,
        description: evalDatasets.description,
        method: evalDatasets.method,
        createdAt: evalDatasets.createdAt,
        deletedAt: evalDatasets.deletedAt,
        item_count: itemCount,
      })
      .from(evalDatasets)
      .where(where)
      .orderBy(desc(evalDatasets.createdAt))
      .limit(ps)
      .offset((pg - 1) * ps);

    return {
      items: rows.map((r) => ({ ...datasetToRow(r), item_count: Number(r.item_count) })),
      total: Number(total),
    };
  }

  async findDatasetById(id: number): Promise<EvalDatasetRow | undefined> {
    const rows = await this.db
      .select()
      .from(evalDatasets)
      .where(and(eq(evalDatasets.id, id), isNull(evalDatasets.deletedAt)))
      .limit(1);
    if (!rows[0]) return undefined;

    const itemRows = await this.db
      .select()
      .from(evalDatasetItems)
      .where(eq(evalDatasetItems.datasetId, id))
      .orderBy(evalDatasetItems.id);
    return { ...datasetToRow(rows[0]), items: itemRows.map(itemToRow) };
  }

  async createRun(run: {
    id: string;
    datasetId: number;
    method: string;
    params?: Record<string, unknown>;
    metrics?: Record<string, number>;
    perQuery?: unknown[];
    status?: 'running' | 'completed' | 'failed';
  }): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(evalRuns)
      .values({
        id: run.id,
        datasetId: run.datasetId,
        method: run.method as any,
        params: run.params ?? {},
        metrics: run.metrics ?? {},
        perQuery: run.perQuery ?? [],
        status: run.status ?? 'completed',
      })
      .returning();
    return runToRow(row);
  }

  async findRunById(id: string): Promise<EvalRunRow | undefined> {
    const rows = await this.db.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
    return rows[0] ? runToRow(rows[0]) : undefined;
  }

  async listRunsByDataset(datasetId: number): Promise<EvalRunRow[]> {
    const rows = await this.db
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.datasetId, datasetId))
      .orderBy(desc(evalRuns.createdAt));
    return rows.map(runToRow);
  }

  async listRunsByIds(ids: string[]): Promise<EvalRunRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(evalRuns).where(inArray(evalRuns.id, ids));
    return rows.map(runToRow);
  }
}

export const evalRepository = new EvalRepository();
