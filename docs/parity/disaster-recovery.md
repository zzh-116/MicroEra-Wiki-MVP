# Migration Disaster Recovery

> P10-02. Verified against the live dev database
> (`postgresql://postgres:postgres@localhost:5433/microera_wiki`, container
> `microera-postgres`). No real business data is modified; the clean-deploy
> drill runs against a throwaway database that is dropped afterwards.

## Migration mechanism

Migrations are forward-only `.sql` files under `backend/db/migrations/`, applied
in filename order by `runMigrations()` (see `backend/app.ts`) on server
bootstrap. Each file is split on `--> statement-breakpoint` and each statement is
executed inside the same connection. Applied files are recorded in the
`_migrations` ledger table so re-running is a no-op.

```
backend/db/migrations/
  0000_puzzling_thunderbird.sql
  0001_glorious_radioactive_man.sql
  0002_calm_connector_sync.sql
  ... 0003 .. 0018_add_model_registry.sql
```

## 1. Unknown-schema check

The drill cross-references the ledger against the migration directory:

- **19/19** repo migration files are recorded in the ledger. ✓
- **1 orphan** ledger entry: `0002_layered_context.sql` — a historical rename
  whose file was later removed from the repo. Benign: it does not affect
  forward migrations (the current `0002_calm_connector_sync.sql` is recorded and
  applies correctly).
- Dev database has **42 public tables** plus the `_migrations` ledger.

## 2. Clean-deploy migration smoke

A throwaway database is created, migrated from zero, idempotency-checked, and
dropped. This proves a fresh deployment reconstructs the full schema.

- All **19 migrations applied cleanly from zero**. ✓
- Idempotency guard holds: a re-run applies **0 new** migrations. ✓
- Core tables materialized (users, parse_jobs, models, knowledge_bases,
  datasources, documents, conversations, chat_messages, sessions, wikis,
  agents). ✓

**Fix applied in this phase:** `runMigrations()` now runs
`CREATE EXTENSION IF NOT EXISTS vector` *before* the migration loop. The
`vectors`/`knowledge_vectors` columns are typed `vector(1024)` and previously
relied on the extension having been created out-of-band — which made a truly
clean deploy fail at migration `0001`. The extension is now a first-class
bootstrap prerequisite.

## 3. Backups

```
docker exec microera-postgres pg_dump -U postgres -d microera_wiki > microera-wiki-backup-<ts>.sql
```

A backup was taken during this phase (12,083 lines, 43 `CREATE TABLE`
statements). Restore with:

```
docker exec -i microera-postgres psql -U postgres -d microera_wiki < microera-wiki-backup-<ts>.sql
```

## 4. Rollback drill

Migrations are forward-only (no down-migrations). The supported rollback path
is point-in-time restore from the `pg_dump` backup above:

1. Stop the app server.
2. Restore the backup into a scratch database and verify row counts.
3. Point `DATABASE_URL` at the restored database, or restore in place.

Because every migration is recorded in `_migrations`, a restored backup plus a
bootstrap re-run is idempotent (zero new migrations applied).

## Reproduce

```
npx tsx scripts/p10-migration-drill.ts
```
