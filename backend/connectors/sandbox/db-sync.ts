// Sandbox DB Sync — replaces HTTP crawling with direct SQL queries.
//
// Architecture:
//   asset_version (latest per asset_id) + project + project_wiki + sys_user
//   → parsed JSON snapshot → KnowledgeDocument → Document → Import Service
//
// Benefits over HTTP connector:
//   1. One SQL query vs. N+1 HTTP requests (list + detail per asset)
//   2. Access to project_wiki, project_task, sys_user — data previously unreachable
//   3. Accurate incremental sync via update_time indexes
//   4. No JSON serialization/deserialization overhead for transit

import { query, testConnection } from './db-client.js';
import type { Document, DocumentSummary, SyncResult } from '../types.js';
import type { ListParams } from '../types.js';
import { parseSandboxDetail, toEmbeddingMarkdown } from './knowledge/index.js';
import type { KnowledgeDocument } from './knowledge/types.js';

// ---- Types for raw DB rows ----

interface AssetVersionRow {
  id: number;
  asset_id: string;
  document_id: string | null;
  version: string;
  snapshot: string;        // JSON string
  create_time: string;
  modifier_id: number | null;
  project_id?: number;
  project_title?: string;
  project_description?: string;
  project_status?: string;
  wiki_content?: string;
  author_name?: string;
  author_username?: string;
}

interface ProjectRow {
  id: number;
  title: string;
  description: string | null;
  project_status: string | null;
  create_time: string;
  update_time: string | null;
}

interface WikiRow {
  id: number;
  project_id: number;
  wiki: string;
  update_time: string;
}

interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: string | null;
  task_level: string | null;
  task_type: string | null;
  create_time: string;
  update_time: string | null;
}

// ---- SQL queries ----

/**
 * Build the main asset query — latest version per asset, joined with project/wiki/author.
 * The asset data lives in asset_version.snapshot (JSON column).
 */
function buildAssetQuery(params?: ListParams): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  // Don't filter by project del_flag — we want ALL sandbox assets regardless
  // of project status. Project info is still joined for display when available.
  const conditions: string[] = [];

  // Incremental sync: only assets updated after the given timestamp
  if (params?.since) {
    conditions.push('latest.avg_update_time >= ?');
    values.push(params.since);
  }

  // Filter by project
  if (params?.projectId) {
    conditions.push('latest.project_id = ?');
    values.push(Number(params.projectId));
  }

  // Filter by type (from JSON snapshot)
  if (params?.type) {
    conditions.push('latest.snapshot_type = ?');
    values.push(params.type);
  }

  // Filter by status
  if (params?.status) {
    conditions.push('latest.snapshot_status = ?');
    values.push(params.status);
  }

  const extraWhere = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

  return {
    sql: `
      SELECT
        latest.asset_id,
        latest.snapshot,
        latest.version,
        latest.create_time,
        latest.modifier_id,
        latest.project_id,
        latest.snapshot_type,
        latest.snapshot_status,
        latest.avg_update_time,
        p.title AS project_title,
        p.description AS project_description,
        p.project_status,
        pw.wiki AS wiki_content,
        u.user_name AS author_name,
        u.user_name AS author_username
      FROM (
        SELECT
          av.asset_id,
          av.snapshot,
          av.version,
          av.create_time,
          av.modifier_id,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(av.snapshot, '$.projectId')) AS UNSIGNED) AS project_id,
          JSON_UNQUOTE(JSON_EXTRACT(av.snapshot, '$.type')) AS snapshot_type,
          JSON_UNQUOTE(JSON_EXTRACT(av.snapshot, '$.status')) AS snapshot_status,
          FROM_UNIXTIME(
            GREATEST(
              COALESCE(JSON_EXTRACT(av.snapshot, '$.updateTime') / 1000, 0),
              COALESCE(JSON_EXTRACT(av.snapshot, '$.createTime') / 1000, 0),
              UNIX_TIMESTAMP(av.create_time)
            )
          ) AS avg_update_time,
          ROW_NUMBER() OVER (PARTITION BY av.asset_id ORDER BY av.version DESC) AS rn
        FROM asset_version av
      ) latest
      LEFT JOIN project p ON latest.project_id = p.id
      LEFT JOIN (
        SELECT project_id, wiki,
          ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY update_time DESC) AS rn
        FROM project_wiki
      ) pw ON p.id = pw.project_id AND pw.rn = 1
      LEFT JOIN sys_user u ON JSON_EXTRACT(latest.snapshot, '$.authorId') = u.id
      WHERE latest.rn = 1${extraWhere}
      ORDER BY latest.avg_update_time DESC
    `,
    values,
  };
}

/**
 * List all projects from the sandbox.
 */
export async function listProjects(): Promise<ProjectRow[]> {
  return query<ProjectRow>(
    `SELECT id, title, description, project_status, create_time, update_time
     FROM project WHERE del_flag = 0 ORDER BY create_time DESC`
  );
}

/**
 * List document summaries (lightweight, no full content) — for browsing/filtering.
 * Suitable for the AdminImportPage and SandboxProjectPage.
 */
export async function listDocuments(params?: ListParams): Promise<DocumentSummary[]> {
  const { sql, values } = buildAssetQuery(params);
  const rows = await query<AssetVersionRow>(sql, values);

  return rows.map((row) => {
    const snapshot = parseSnapshot(row.snapshot);

    const id = snapshot.id || row.asset_id;
    const title = snapshot.name || snapshot.originalName || `Asset ${row.asset_id}`;
    const type = snapshot.type || 'unknown';
    const updateTime = row.avg_update_time || row.create_time || '';

    return {
      id,
      title,
      type,
      updatedAt: typeof updateTime === 'string' ? updateTime : new Date(updateTime).toISOString(),
      description: snapshot.description?.slice(0, 200),
      metadata: {
        projectId: snapshot.projectId || row.project_id,
        projectTitle: row.project_title,
        status: snapshot.status || row.snapshot_status,
        author: row.author_name || snapshot.author,
        assetSuffix: snapshot.assetSuffix,
        version: row.version,
        methodDomain: snapshot.methodDomain,
        objectDomain: snapshot.objectDomain,
      },
    };
  });
}

/**
 * Fetch a single document by its snapshot ObjectId (the 24-char hex id).
 */
export async function fetchDocument(snapshotId: string): Promise<Document | null> {
  const rows = await query<AssetVersionRow>(
    `SELECT
       av.asset_id, av.snapshot, av.version, av.create_time, av.modifier_id,
       p.title AS project_title, p.description AS project_description, p.project_status,
       pw.wiki AS wiki_content,
       u.user_name AS author_name
     FROM asset_version av
     LEFT JOIN project p ON CAST(JSON_UNQUOTE(JSON_EXTRACT(av.snapshot, '$.projectId')) AS UNSIGNED) = p.id
     LEFT JOIN (
       SELECT project_id, wiki,
         ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY update_time DESC) AS rn
       FROM project_wiki
     ) pw ON p.id = pw.project_id AND pw.rn = 1
     LEFT JOIN sys_user u ON JSON_EXTRACT(av.snapshot, '$.authorId') = u.id
     WHERE JSON_UNQUOTE(JSON_EXTRACT(av.snapshot, '$.id')) = ?
     ORDER BY av.version DESC
     LIMIT 1`,
    [snapshotId]
  );

  if (rows.length === 0) return null;
  return rowToDocument(rows[0]);
}

/**
 * Fetch documents by numeric asset_id (different from snapshot ObjectId).
 */
export async function fetchDocumentByAssetId(assetId: string): Promise<Document | null> {
  const rows = await query<AssetVersionRow>(
    `SELECT
       av.asset_id, av.snapshot, av.version, av.create_time, av.modifier_id,
       p.title AS project_title, p.description AS project_description, p.project_status,
       pw.wiki AS wiki_content,
       u.user_name AS author_name
     FROM asset_version av
     LEFT JOIN project p ON CAST(JSON_UNQUOTE(JSON_EXTRACT(av.snapshot, '$.projectId')) AS UNSIGNED) = p.id
     LEFT JOIN (
       SELECT project_id, wiki,
         ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY update_time DESC) AS rn
       FROM project_wiki
     ) pw ON p.id = pw.project_id AND pw.rn = 1
     LEFT JOIN sys_user u ON JSON_EXTRACT(av.snapshot, '$.authorId') = u.id
     WHERE av.asset_id = ?
     ORDER BY av.version DESC
     LIMIT 1`,
    [assetId]
  );

  if (rows.length === 0) return null;
  return rowToDocument(rows[0]);
}

/** Safely parse snapshot — mysql2 may auto-parse JSON columns */
function parseSnapshot(raw: unknown): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;        // mysql2 auto-parsed
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

/**
 * Convert a DB row into a unified Document.
 * Parses the JSON snapshot as a SandboxDetail and runs through the Knowledge Layer.
 */
function rowToDocument(row: AssetVersionRow): Document {
  const snapshot = parseSnapshot(row.snapshot);

  // Enrich snapshot with joined data (not in original API response)
  if (row.project_title && !snapshot.project) {
    snapshot.project = {
      projectId: snapshot.projectId,
      projectTitle: row.project_title,
    };
  }
  if (row.author_name && !snapshot.author) {
    snapshot.author = row.author_name;
  }
  // Attach wiki content as an extra field for the knowledge parser
  if (row.wiki_content) {
    snapshot._wikiContent = row.wiki_content;
  }

  const knowledge = parseSandboxDetail(snapshot, row.project_title || undefined);
  const markdown = toEmbeddingMarkdown(knowledge);

  // If wiki content exists, append it to the markdown
  const fullContent = row.wiki_content
    ? markdown + `\n\n## 项目 Wiki\n\n${row.wiki_content}\n`
    : markdown;

  return {
    id: knowledge.metadata.sourceId,  // snapshot ObjectId
    title: knowledge.title,
    type: snapshot.type || 'unknown',
    updatedAt: knowledge.updatedAt || row.create_time || '',
    content: fullContent,
    attachments: knowledge.attachments,
    source: 'sandbox',
    tags: knowledge.tags,
    description: knowledge.abstract,
    author: knowledge.author || row.author_name,
    metadata: {
      projectId: snapshot.projectId,
      projectTitle: row.project_title,
      knowledgeType: knowledge.type,
      assetId: row.asset_id,
      version: row.version,
      wikiContent: !!row.wiki_content,
      unresolvedIds: knowledge.metadata.unresolvedIds,
    },
  };
}

/**
 * List project wikis as independent documents.
 * Project wikis contain rich documentation that was previously inaccessible via the HTTP API.
 */
export async function listProjectWikis(params?: ListParams): Promise<DocumentSummary[]> {
  let sql = `
    SELECT pw.id, pw.project_id, pw.wiki, pw.update_time,
           p.title AS project_title
    FROM (
      SELECT id, project_id, wiki, update_time,
        ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY update_time DESC) AS rn
      FROM project_wiki
    ) pw
    JOIN project p ON pw.project_id = p.id
    WHERE pw.rn = 1 AND p.del_flag = 0
  `;
  const values: unknown[] = [];

  if (params?.since) {
    sql += ' AND pw.update_time >= ?';
    values.push(params.since);
  }
  if (params?.projectId) {
    sql += ' AND pw.project_id = ?';
    values.push(Number(params.projectId));
  }

  sql += ' ORDER BY pw.update_time DESC';

  const rows = await query<WikiRow>(sql, values);
  return rows.map((row) => ({
    id: `wiki:${row.project_id}`,
    title: `Wiki: ${row.project_title}`,
    type: 'wiki',
    updatedAt: row.update_time,
    description: `项目 Wiki 文档 — ${row.project_title}`,
    metadata: { projectId: row.project_id, projectTitle: row.project_title },
  }));
}

/**
 * Fetch a single project wiki as a Document.
 */
export async function fetchProjectWiki(projectId: string): Promise<Document | null> {
  const rows = await query<WikiRow & { project_title: string; project_description: string | null }>(
    `SELECT pw.id, pw.project_id, pw.wiki, pw.update_time,
            p.title AS project_title, p.description AS project_description
     FROM project_wiki pw
     JOIN project p ON pw.project_id = p.id
     WHERE pw.project_id = ?
     LIMIT 1`,
    [Number(projectId)]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: `wiki:${row.project_id}`,
    title: `Wiki: ${row.project_title}`,
    type: 'wiki',
    updatedAt: row.update_time,
    content: `# ${row.project_title} — 项目 Wiki\n\n${row.wiki}`,
    attachments: [],
    source: 'sandbox',
    tags: ['wiki', '项目文档'],
    description: row.project_description?.slice(0, 200) || `项目 Wiki — ${row.project_title}`,
    author: undefined,
    metadata: {
      projectId: row.project_id,
      projectTitle: row.project_title,
      knowledgeType: 'project',
    },
  };
}

/**
 * List project tasks as independent documents.
 */
export async function listProjectTasks(params?: ListParams): Promise<DocumentSummary[]> {
  let sql = `
    SELECT pt.id, pt.project_id, pt.title, pt.description, pt.status,
           pt.task_level, pt.task_type, pt.create_time, pt.update_time,
           p.title AS project_title
    FROM project_task pt
    JOIN project p ON pt.project_id = p.id
    WHERE pt.del_flag = 0 AND p.del_flag = 0
  `;
  const values: unknown[] = [];

  if (params?.since) {
    sql += ' AND pt.update_time >= ?';
    values.push(params.since);
  }
  if (params?.projectId) {
    sql += ' AND pt.project_id = ?';
    values.push(Number(params.projectId));
  }

  sql += ' ORDER BY pt.update_time DESC';

  const rows = await query<TaskRow & { project_title: string }>(sql, values);
  return rows.map((row) => ({
    id: `task:${row.id}`,
    title: row.title,
    type: 'task',
    updatedAt: row.update_time || row.create_time,
    description: row.description?.slice(0, 200),
    metadata: {
      projectId: row.project_id,
      projectTitle: row.project_title,
      taskStatus: row.status,
      taskLevel: row.task_level,
      taskType: row.task_type,
    },
  }));
}

/**
 * Fetch a single project task as a Document.
 */
export async function fetchProjectTask(taskId: string): Promise<Document | null> {
  const rows = await query<TaskRow & { project_title: string; project_description: string | null }>(
    `SELECT pt.*, p.title AS project_title, p.description AS project_description
     FROM project_task pt
     JOIN project p ON pt.project_id = p.id
     WHERE pt.id = ? AND pt.del_flag = 0`,
    [Number(taskId)]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  const content = [
    `# ${row.title}`,
    '',
    `> **项目:** ${row.project_title} | **状态:** ${row.status || '未知'} | **等级:** ${row.task_level || 'informal'}`,
    '',
    row.description || '',
    '',
    `---`,
    `*任务 ID: ${row.id} • 项目 ID: ${row.project_id}*`,
  ].join('\n');

  return {
    id: `task:${row.id}`,
    title: row.title,
    type: 'task',
    updatedAt: row.update_time || row.create_time,
    content,
    attachments: [],
    source: 'sandbox',
    tags: ['任务', row.task_level, row.task_type].filter(Boolean) as string[],
    description: row.description?.slice(0, 200),
    author: undefined,
    metadata: {
      projectId: row.project_id,
      projectTitle: row.project_title,
      taskStatus: row.status,
      taskLevel: row.task_level,
      taskType: row.task_type,
    },
  };
}

/**
 * Validate all assets — fetches rows, parses JSON snapshots, and reports stats.
 *
 * This is a **dry-run / validation** pass. It does NOT import documents into the
 * Wiki knowledge base. Actual import is driven by the generic sync route handler
 * (POST /connectors/:name/sync), which iterates over list() + detail() results
 * and calls importService.importFromConnector() for each document.
 *
 * Use this function to:
 *   - Verify data quality before a full import
 *   - Count how many assets will be imported/skipped
 *   - Catch malformed JSON snapshots early
 */
export async function syncAll(
  params?: ListParams,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();

  console.log('[Sandbox:DB] Starting full DB sync...');

  const { sql, values } = buildAssetQuery(params);
  const rows = await query<AssetVersionRow>(sql, values);

  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      onProgress?.(i + 1, rows.length);
      // Validate: ensure the JSON snapshot parses and produces a valid document
      const doc = rowToDocument(row);
      if (doc && doc.title) {
        created++;
      } else {
        skipped++;
        errors.push(`[${row.asset_id}] Empty or invalid document`);
      }
    } catch (err: any) {
      errors.push(`[${row.asset_id}] ${err.message}`);
      skipped++;
    }
  }

  const finishedAt = new Date().toISOString();
  console.log(`[Sandbox:DB] Sync complete: ${created} created, ${skipped} skipped, ${errors.length} errors`);

  return {
    connector: 'sandbox-db',
    total: rows.length,
    created,
    updated: 0,
    skipped,
    errors,
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
  };
}

/**
 * Get count of assets updated since a given timestamp.
 */
export async function countUpdatedSince(since: string): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT av.asset_id) as count
     FROM asset_version av
     INNER JOIN (
       SELECT asset_id, MAX(version) as max_version
       FROM asset_version
       GROUP BY asset_id
     ) latest ON av.asset_id = latest.asset_id AND av.version = latest.max_version
     WHERE av.create_time >= ?`,
    [since]
  );
  return rows[0]?.count || 0;
}

/**
 * Bulk fetch all asset documents in a single query — eliminates N+1 detail() calls.
 *
 * Use this for bulk import instead of list() + detail() loop:
 *   const docs = await fetchAllDocuments({ projectId: '155' });
 *   for (const doc of docs) {
 *     await importService.importFromConnector(doc);
 *   }
 *
 * This reuses the same asset query as syncAll but returns parsed Documents
 * instead of just counting stats.
 */
export async function fetchAllDocuments(params?: ListParams): Promise<Document[]> {
  const { sql, values } = buildAssetQuery(params);
  const rows = await query<AssetVersionRow>(sql, values);

  console.log(`[Sandbox:DB] fetchAllDocuments: ${rows.length} rows from asset_version (latest per asset_id)`);

  const docs: Document[] = [];
  let parseFailures = 0;
  let emptyTitle = 0;

  for (const row of rows) {
    try {
      const doc = rowToDocument(row);
      if (doc && doc.title) {
        docs.push(doc);
      } else {
        emptyTitle++;
        console.warn(`[Sandbox:DB] Skipping asset ${row.asset_id}: empty title after parsing`);
      }
    } catch (err: any) {
      parseFailures++;
      console.error(`[Sandbox:DB] Skipping asset ${row.asset_id}: ${err.message}`);
    }
  }

  console.log(`[Sandbox:DB] Fetched ${docs.length} documents (${rows.length} rows, ${parseFailures} parse failures, ${emptyTitle} empty titles)`);
  return docs;
}

// Re-export for convenience
export { testConnection };
