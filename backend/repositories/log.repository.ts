// Log Repository — database operations for run_logs table
// Provides insert, query, cleanup, and statistics methods.
import { BaseRepository } from './base.js';
import { runLogs } from '../db/schema.js';
import { eq, like, and, desc, lt, sql, inArray } from 'drizzle-orm';
import type { LogEntry as LoggerLogEntry } from '../utils/logger.js';

export interface InsertLogEntry {
  level: string;
  module: string;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
  timestamp: string;
}

export interface LogQueryParams {
  level?: string;
  module?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface LogQueryResult {
  logs: Array<{
    id: number;
    level: string;
    module: string;
    message: string;
    stack: string | null;
    context: Record<string, unknown> | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  levels: string[];
  modules: string[];
}

export class LogRepository extends BaseRepository {
  /** Insert a single log entry */
  async insert(entry: InsertLogEntry): Promise<void> {
    try {
      await this.db.insert(runLogs).values({
        level: entry.level,
        module: entry.module,
        message: entry.message,
        stack: entry.stack ?? null,
        context: entry.context ?? {},
        createdAt: new Date(entry.timestamp),
      });
    } catch (err: any) {
      console.error(`[LogRepo] Insert failed: ${err.message}`);
    }
  }

  /** Batch insert log entries — used by the flush queue for efficiency */
  async insertBatch(entries: LoggerLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.db.insert(runLogs).values(
        entries.map((e) => ({
          level: e.level,
          module: e.module,
          message: e.message,
          stack: e.stack ?? null,
          context: e.context ?? {},
          createdAt: new Date(e.timestamp),
        })),
      );
    } catch (err: any) {
      console.error(`[LogRepo] Batch insert failed (${entries.length} entries): ${err.message}`);
      throw err; // Re-throw so logger can retry
    }
  }

  /** Paginated, filtered log query */
  async query(params: LogQueryParams = {}): Promise<LogQueryResult> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (params.level && params.level !== 'all') {
      conditions.push(eq(runLogs.level, params.level));
    }
    if (params.module && params.module !== 'all') {
      conditions.push(eq(runLogs.module, params.module));
    }
    if (params.search) {
      const kw = `%${params.search.toLowerCase()}%`;
      conditions.push(like(sql`lower(${runLogs.message})`, kw));
    }
    if (params.startDate) {
      conditions.push(sql`${runLogs.createdAt} >= ${params.startDate}::timestamptz`);
    }
    if (params.endDate) {
      conditions.push(sql`${runLogs.createdAt} <= ${params.endDate}::timestamptz`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const countResult = where
      ? await this.db.select({ count: sql<number>`count(*)` }).from(runLogs).where(where)
      : await this.db.select({ count: sql<number>`count(*)` }).from(runLogs);
    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const pg = Math.max(1, params.page || 1);
    const ps = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (pg - 1) * ps;
    const totalPages = Math.max(1, Math.ceil(total / ps));

    // Data
    const rows = where
      ? await this.db.select().from(runLogs).where(where).orderBy(desc(runLogs.createdAt)).limit(ps).offset(offset)
      : await this.db.select().from(runLogs).orderBy(desc(runLogs.createdAt)).limit(ps).offset(offset);

    // Distinct levels and modules for filter dropdowns
    const [levelRows, moduleRows] = await Promise.all([
      this.db.selectDistinct({ level: runLogs.level }).from(runLogs).orderBy(runLogs.level),
      this.db.selectDistinct({ module: runLogs.module }).from(runLogs).orderBy(runLogs.module),
    ]);

    return {
      logs: rows,
      total,
      page: pg,
      pageSize: ps,
      totalPages,
      levels: levelRows.map((r) => r.level),
      modules: moduleRows.map((r) => r.module),
    };
  }

  /** Delete logs older than the specified number of days */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.db
      .delete(runLogs)
      .where(lt(runLogs.createdAt, cutoff));
    return result.rowCount ?? 0;
  }

  /** Delete all logs */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(runLogs);
    return result.rowCount ?? 0;
  }

  /** Auto-cleanup: keep only last maxLogs entries or last maxDays days */
  async cleanup(maxLogs: number = 10000, maxDays: number = 30): Promise<number> {
    let deleted = 0;

    // 1. Delete by age
    deleted += await this.deleteOlderThan(maxDays);

    // 2. Delete excess by count (keep newest maxLogs)
    try {
      const { logs } = await this.query({ page: 1, pageSize: 1 });
      const total = logs.length > 0 ? await this.count() : 0;
      if (total > maxLogs) {
        const excess = total - maxLogs;
        // Delete oldest entries beyond the maxLogs window
        const oldestToKeep = await this.db
          .select({ id: runLogs.id })
          .from(runLogs)
          .orderBy(desc(runLogs.createdAt))
          .limit(maxLogs)
          .offset(0);
        const keepIds = oldestToKeep.map((r) => r.id);
        if (keepIds.length > 0) {
          const deleteResult = await this.db
            .delete(runLogs)
            .where(sql`${runLogs.id} NOT IN (${keepIds.join(',')})`);
          deleted += deleteResult.rowCount ?? 0;
        }
      }
    } catch {
      // Non-critical — skip count-based cleanup on error
    }

    return deleted;
  }

  /** Total number of log entries */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(runLogs);
    return Number(result[0]?.count ?? 0);
  }
}

export const logRepository = new LogRepository();
