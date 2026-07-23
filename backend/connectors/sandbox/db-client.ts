// Sandbox MySQL Client — direct read-only connection to the Sandbox database.
// Uses mysql2/promise for async/await. No writes, SELECT only.
// This replaces the HTTP crawling approach with a single SQL JOIN.

import mysql from 'mysql2/promise';
import { config } from '../../config.js';

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    const dbConfig = config.sandboxDB;
    console.log(`[Sandbox:DB] Connecting to MySQL at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    pool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      waitForConnections: true,
      connectionLimit: 5,       // Read-only, keep it low
      maxIdle: 3,
      idleTimeout: 60000,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[Sandbox:DB] Connection pool closed');
  }
}

/**
 * Execute a read-only query against the sandbox database.
 * All queries are run on the miqroproject schema.
 */
export async function query<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows as T[];
}

/**
 * Test connectivity and return table stats for diagnostics.
 */
export async function testConnection(): Promise<{
  connected: boolean;
  assetCount: number;
  projectCount: number;
  wikiCount: number;
  error?: string;
}> {
  try {
    const p = getPool();
    const [assetRows] = await p.execute(
      `SELECT COUNT(DISTINCT asset_id) as count FROM asset_version`
    );
    const [projRows] = await p.execute(
      `SELECT COUNT(*) as count FROM project WHERE del_flag = 0`
    );
    const [wikiRows] = await p.execute(
      `SELECT COUNT(*) as count FROM project_wiki`
    );
    const counts = (assetRows as any[])[0];
    const projCount = (projRows as any[])[0];
    const wikiCount = (wikiRows as any[])[0];
    return {
      connected: true,
      assetCount: Number(counts?.count || 0),
      projectCount: Number(projCount?.count || 0),
      wikiCount: Number(wikiCount?.count || 0),
    };
  } catch (err: any) {
    return { connected: false, assetCount: 0, projectCount: 0, wikiCount: 0, error: err.message };
  }
}
