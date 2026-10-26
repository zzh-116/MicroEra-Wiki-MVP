// Shared, concurrency-safe migration applier for DB-backed test suites.
//
// Every DB-backed suite provisions the SAME isolated test database
// (`microera_wiki_test`) from the additive migration chain. Vitest runs test
// files in parallel, so two suites could both see a migration as "not applied"
// and race to CREATE the same table. `pg_advisory_lock` serializes application
// across those processes. The lock is session-scoped, so it is acquired and
// released on a single dedicated connection (not a pool).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Arbitrary but stable bigint key shared by all DB-backed suites.
const MIGRATION_LOCK_KEY = '4200000019';

export async function applyMigrations(connectionString: string, migrationsDir: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_KEY]);
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(
        'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())',
      );
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const { rows } = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
        if (rows.length > 0) continue;
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
        for (const stmt of statements) await client.query(stmt);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}
