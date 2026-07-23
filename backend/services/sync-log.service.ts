// Connector Sync Log — idempotency guard for auto-sync.
// Before importing a document, check if it was already imported (by connector + sourceId).
// After importing, record it so the next restart skips it.

import { pool } from '../db/connection.js';

export interface SyncLogEntry {
  id: number;
  connector: string;
  source_id: string;
  entry_id: number;
  title: string | null;
  synced_at: string;
}

/**
 * Check whether a source document has already been imported by a given connector.
 * Returns the entry_id if found, null otherwise.
 */
export async function findSyncedEntry(
  connector: string,
  sourceId: string,
): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT entry_id FROM connector_sync_log
     WHERE connector = $1 AND source_id = $2
     LIMIT 1`,
    [connector, sourceId],
  );
  return rows.length > 0 ? Number(rows[0].entry_id) : null;
}

/**
 * Record a successful import so it won't be imported again.
 */
export async function recordSync(
  connector: string,
  sourceId: string,
  entryId: number,
  title?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO connector_sync_log (connector, source_id, entry_id, title)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (connector, source_id) DO UPDATE
       SET entry_id = $3, title = $4, synced_at = NOW()`,
    [connector, sourceId, entryId, title || null],
  );
}

/**
 * Get count of documents imported from a connector (for diagnostics).
 */
export async function countSynced(connector: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM connector_sync_log WHERE connector = $1`,
    [connector],
  );
  return Number(rows[0]?.count || 0);
}
