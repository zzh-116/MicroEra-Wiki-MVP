// Runtime guard for DB-backed tests. A test must never run destructive or
// mutating SQL (TRUNCATE / DELETE / INSERT) against the development database.
// Before any query that changes state, the suite asserts the connected database
// name is the dedicated isolated test database and aborts otherwise.
import type { Pool } from 'pg';

export async function assertTestDatabase(pool: Pool, expectedName: string): Promise<void> {
  const { rows } = await pool.query<{ db: string }>('SELECT current_database() AS db');
  const actual = rows[0]?.db;
  if (actual !== expectedName) {
    throw new Error(
      `Refusing to run DB test against "${actual}" — expected the isolated test database ` +
        `"${expectedName}". Point DATABASE_URL at the test database before running this suite.`,
    );
  }
}
