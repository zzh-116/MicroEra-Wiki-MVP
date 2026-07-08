// Database connection singleton — one Pool + Drizzle instance for the app
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10, // max connections in pool
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
