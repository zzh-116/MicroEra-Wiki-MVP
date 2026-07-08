// Abstract BaseRepository — provides common CRUD patterns
// All repositories extend this for consistency
import { db } from '../db/connection.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';

export type DbClient = NodePgDatabase<typeof schema>;

export abstract class BaseRepository {
  protected db: DbClient;

  constructor(database?: DbClient) {
    this.db = database ?? (db as unknown as DbClient);
  }
}
