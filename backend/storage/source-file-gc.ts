// Controlled source-file garbage collection (TB-3) — deferred physical deletion
// of `DATA_DIR/sources/*` files whose owning source/document/KB has been soft
// deleted (or that are entirely unreferenced orphans).
//
// Safety model (requirement 3/4/5): soft-delete already revokes *access*
// immediately (every read path filters `deleted_at`), but the bytes stay on disk
// so a restore within the retention window is possible. Physical deletion here
// is the slow, conservative second step and is gated on ALL of:
//
//   1. NO live reference — no `sources` row (with an active parent KB) points at
//      the file's `sources/<name>` uri. A file is only a candidate once every
//      referencing source is soft-deleted or its parent KB is soft-deleted, or
//      no source row exists at all (orphan).
//   2. NO active parse job — no `parse_jobs` row in `pending`/`running` whose
//      document owns any referencing source (a retry could still need the file).
//   3. NO deadletter pending replay — no `parse_deadletters` row with
//      `replayed_at IS NULL` whose document owns any referencing source.
//   4. Retention elapsed — the file has been unreferenced/deleted for at least
//      `retentionMs` (anchored on the latest soft-delete timestamp, or on file
//      mtime for orphans), so a restore is still possible inside the window.
//
// The module is dry-run-first: `run(true)` computes the exact candidate set and
// returns a non-sensitive report (names/sizes/mtimes/reasons — never file
// bodies) without touching disk; `run(false)` deletes the same candidates.
import fs from 'node:fs';
import path from 'node:path';
import { isNull, and, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { sources, knowledgeBases, documents, parseJobs, parseDeadletters } from '../db/schema.js';
import { db } from '../db/connection.js';
import { removeSourceFile } from './source-files.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('source-file-gc');

/** Default retention: a soft-deleted/orphan source file is kept for 24h before
 *  physical deletion, so a restore stays possible inside the window. */
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type DbClient = NodePgDatabase<typeof schema>;

export interface SourceFileGcOptions {
  /** DATA_DIR root (defaults to `config.dataDir`). */
  dataDir: string;
  /** Minimum age since a file became unreferenced/deleted before it is eligible. */
  retentionMs?: number;
  /** Clock override (tests). */
  now?: Date;
  /** Injectable DB client (tests); defaults to the shared connection. */
  db?: DbClient;
}

export interface SourceFileGcCandidate {
  storedName: string;
  uri: string;
  size: number;
  mtimeMs: number;
  /** Why the file is a deletion candidate. */
  reason: 'orphan' | 'soft_deleted_source' | 'soft_deleted_kb';
  /** A live (active-KB) source row still references this file → never deleted. */
  activeSourceRef: boolean;
  /** A pending/running parse job still needs this file → never deleted. */
  activeJobRef: boolean;
  /** A non-replayed deadletter still references this file → never deleted. */
  deadletterRef: boolean;
  eligible: boolean;
  skippedReason?: 'retained' | 'active_source' | 'active_job' | 'deadletter';
}

export interface SourceFileGcReport {
  dryRun: boolean;
  scanned: number;
  /** Files that passed every gate and would be / were removed. */
  eligible: number;
  removed: number;
  skipped: number;
  failures: number;
  candidates: SourceFileGcCandidate[];
}

interface SourceRef {
  id: number;
  kbId: number;
  deletedAt: string | null;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Controlled source-file GC. Read-only classification is separated from the
 * deletion step so `dryRun` can be trusted to describe exactly what `run(false)`
 * would remove — no file is touched unless it also cleared every gate in the
 * candidate list.
 */
export class SourceFileGc {
  private readonly dataDir: string;
  private readonly retentionMs: number;
  private readonly now: Date;
  private readonly client: DbClient;

  constructor(options: SourceFileGcOptions) {
    this.dataDir = options.dataDir;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    this.now = options.now ?? new Date();
    this.client = options.db ?? (db as unknown as DbClient);
  }

  /** Compute the candidate set and (unless dryRun) delete eligible files. */
  async run(dryRun: boolean): Promise<SourceFileGcReport> {
    const sourcesDir = path.resolve(this.dataDir, 'sources');
    const files = this.listSourceFiles(sourcesDir);
    if (files.length === 0) {
      return { dryRun, scanned: 0, eligible: 0, removed: 0, skipped: 0, failures: 0, candidates: [] };
    }

    const refs = await this.loadReferences(files.map((f) => f.uri));

    const candidates: SourceFileGcCandidate[] = [];
    for (const file of files) {
      candidates.push(this.classify(file, refs));
    }

    const eligible = candidates.filter((c) => c.eligible);
    let removed = 0;
    let failures = 0;

    if (!dryRun) {
      for (const c of eligible) {
        // Re-resolve via the shared, traversal-guarded helper before removing.
        const ok = removeSourceFile(this.dataDir, c.storedName);
        if (ok) removed += 1;
        else failures += 1;
      }
    }

    const report: SourceFileGcReport = {
      dryRun,
      scanned: files.length,
      eligible: eligible.length,
      removed,
      skipped: candidates.length - eligible.length,
      failures,
      candidates,
    };

    logger.info(
      `source-file GC ${dryRun ? 'dry-run' : 'run'}: scanned=${report.scanned} eligible=${report.eligible} ` +
        `removed=${report.removed} skipped=${report.skipped} failures=${report.failures}`,
      { dataDir: this.dataDir },
    );

    return report;
  }

  private listSourceFiles(sourcesDir: string): Array<{ storedName: string; uri: string; absolutePath: string; size: number; mtimeMs: number }> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(sourcesDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: Array<{ storedName: string; uri: string; absolutePath: string; size: number; mtimeMs: number }> = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const abs = path.join(sourcesDir, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue; // raced away between readdir and stat — skip
      }
      out.push({
        storedName: entry.name,
        uri: `sources/${entry.name}`,
        absolutePath: abs,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
    return out;
  }

  /** Load all DB reference data needed to classify every on-disk file in one pass. */
  private async loadReferences(uris: string[]): Promise<{
    byUri: Map<string, SourceRef[]>;
    kbDeleted: Map<number, string | null>;
    docsBySource: Map<number, number[]>;
    activeJobDocIds: Set<number>;
    deadletterDocIds: Set<number>;
  }> {
    const uriList = [...new Set(uris)];

    const sourceRows = uriList.length
      ? await this.client.select().from(sources).where(inArray(sources.uri, uriList))
      : [];
    const byUri = new Map<string, SourceRef[]>();
    const sourceIds: number[] = [];
    for (const r of sourceRows) {
      if (!r.uri) continue;
      const list = byUri.get(r.uri) ?? [];
      list.push({ id: r.id, kbId: r.kbId, deletedAt: toIso(r.deletedAt) });
      byUri.set(r.uri, list);
      sourceIds.push(r.id);
    }

    // Parent-KB liveness for every referencing source (a source is "active"
    // only while its KB is not soft-deleted).
    const kbIds = [...new Set(sourceRows.map((r) => r.kbId))];
    const kbRows = kbIds.length ? await this.client.select().from(knowledgeBases).where(inArray(knowledgeBases.id, kbIds)) : [];
    const kbDeleted = new Map<number, string | null>();
    for (const r of kbRows) kbDeleted.set(r.id, toIso(r.deletedAt));

    // Documents owned by each referencing source (any soft-delete state).
    const docRows = sourceIds.length ? await this.client.select().from(documents).where(inArray(documents.sourceId, sourceIds)) : [];
    const docsBySource = new Map<number, number[]>();
    const docIds: number[] = [];
    for (const r of docRows) {
      if (r.sourceId == null) continue;
      const list = docsBySource.get(r.sourceId) ?? [];
      list.push(r.id);
      docsBySource.set(r.sourceId, list);
      docIds.push(r.id);
    }

    // Active parse jobs (pending/running) still reference these documents → keep.
    const activeJobDocIds = new Set<number>();
    if (docIds.length) {
      const jobRows = await this.client
        .select({ documentId: parseJobs.documentId })
        .from(parseJobs)
        .where(and(inArray(parseJobs.documentId, docIds), inArray(parseJobs.status, ['pending', 'running'])));
      for (const r of jobRows) if (r.documentId != null) activeJobDocIds.add(r.documentId);
    }

    // Non-replayed deadletters still reference these documents → keep (a replay
    // later would need the source file again).
    const deadletterDocIds = new Set<number>();
    if (docIds.length) {
      const dlRows = await this.client
        .select({ documentId: parseDeadletters.documentId })
        .from(parseDeadletters)
        .where(and(inArray(parseDeadletters.documentId, docIds), isNull(parseDeadletters.replayedAt)));
      for (const r of dlRows) if (r.documentId != null) deadletterDocIds.add(r.documentId);
    }

    return { byUri, kbDeleted, docsBySource, activeJobDocIds, deadletterDocIds };
  }

  private classify(
    file: { storedName: string; uri: string; size: number; mtimeMs: number },
    refs: {
      byUri: Map<string, SourceRef[]>;
      kbDeleted: Map<number, string | null>;
      docsBySource: Map<number, number[]>;
      activeJobDocIds: Set<number>;
      deadletterDocIds: Set<number>;
    },
  ): SourceFileGcCandidate {
    const sourceRefs = refs.byUri.get(file.uri) ?? [];

    // Referenced documents (for the active-job / deadletter re-check).
    let referencedDocIds: number[] = [];
    for (const ref of sourceRefs) {
      const ids = refs.docsBySource.get(ref.id);
      if (ids) referencedDocIds = referencedDocIds.concat(ids);
    }

    const activeJobRef = referencedDocIds.some((id) => refs.activeJobDocIds.has(id));
    const deadletterRef = referencedDocIds.some((id) => refs.deadletterDocIds.has(id));

    // A live reference = a source row whose own deleted_at is null AND whose
    // parent KB is not soft-deleted.
    const activeSourceRef = sourceRefs.some(
      (ref) => ref.deletedAt === null && refs.kbDeleted.get(ref.kbId) === null,
    );

    let reason: SourceFileGcCandidate['reason'];
    let deletedAnchorMs = 0;
    if (sourceRefs.length === 0) {
      reason = 'orphan';
    } else if (activeSourceRef) {
      reason = 'orphan'; // placeholder; not eligible regardless of reason
    } else {
      // All referencing sources are soft-deleted or their KB is soft-deleted.
      const kbDeletedSome = sourceRefs.some((ref) => refs.kbDeleted.get(ref.kbId) !== null);
      reason = kbDeletedSome ? 'soft_deleted_kb' : 'soft_deleted_source';
      for (const ref of sourceRefs) {
        const refDeleted = ref.deletedAt ? new Date(ref.deletedAt).getTime() : 0;
        const kbDel = refs.kbDeleted.get(ref.kbId);
        const kbDelMs = kbDel ? new Date(kbDel).getTime() : 0;
        deletedAnchorMs = Math.max(deletedAnchorMs, refDeleted, kbDelMs);
      }
    }

    // Retention anchor: soft-delete timestamp when known, else file mtime
    // (orphans and any edge case without a deletion timestamp).
    const anchorMs = deletedAnchorMs > 0 ? deletedAnchorMs : file.mtimeMs;
    const retained = this.now.getTime() - anchorMs < this.retentionMs;

    let skippedReason: SourceFileGcCandidate['skippedReason'];
    if (activeSourceRef) skippedReason = 'active_source';
    else if (activeJobRef) skippedReason = 'active_job';
    else if (deadletterRef) skippedReason = 'deadletter';
    else if (retained) skippedReason = 'retained';

    const eligible = !activeSourceRef && !activeJobRef && !deadletterRef && !retained;

    return {
      storedName: file.storedName,
      uri: file.uri,
      size: file.size,
      mtimeMs: file.mtimeMs,
      reason,
      activeSourceRef,
      activeJobRef,
      deadletterRef,
      eligible,
      skippedReason,
    };
  }
}
