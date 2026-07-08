// Run database migrations — auto-creates the database if needed
// Usage: npx tsx backend/db/migrate.ts
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { config } from '../config.js';

const { Pool } = pg;

/** Parse database name from connection URL */
function parseDbName(url: string): string {
  const match = url.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : 'microera_wiki';
}

/** Get connection URL without the database name (for creating DB) */
function adminUrl(url: string): string {
  return url.replace(/\/[^/?#]+(\?|$)/, '/postgres$1');
}

async function main() {
  const dbName = parseDbName(config.databaseUrl);

  // 1. Ensure database exists
  console.log(`[Migrate] Ensuring database "${dbName}" exists...`);
  const adminPool = new Pool({ connectionString: adminUrl(config.databaseUrl) });
  try {
    const result = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (result.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[Migrate] Created database "${dbName}"`);
    } else {
      console.log(`[Migrate] Database "${dbName}" already exists`);
    }
  } finally {
    await adminPool.end();
  }

  // 2. Run migrations
  console.log('[Migrate] Running migrations...');
  const { db, closePool } = await import('./connection.js');
  const migrationsPath = path.resolve(import.meta.dirname, 'migrations');
  await migrate(db, { migrationsFolder: migrationsPath });
  console.log('[Migrate] Migrations complete');
  await closePool();
}

main().catch((err) => {
  console.error('[Migrate] Failed:', err);
  process.exit(1);
});
