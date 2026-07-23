-- Track which external documents have already been imported,
-- so auto-sync on server restart doesn't duplicate entries.
CREATE TABLE "connector_sync_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "connector" text NOT NULL,
  "source_id" text NOT NULL,
  "entry_id" integer NOT NULL,
  "title" text,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "connector_sync_log_unique" UNIQUE("connector", "source_id")
);
--> statement-breakpoint
CREATE INDEX "connector_sync_log_connector_idx" ON "connector_sync_log" USING btree ("connector");
--> statement-breakpoint
CREATE INDEX "connector_sync_log_entry_idx" ON "connector_sync_log" USING btree ("entry_id");
