-- Add run_logs table — persistent runtime log storage
-- Required by: backend/utils/logger.ts,
--              backend/repositories/log.repository.ts,
--              backend/db/schema.ts (runLogs export).
-- Stores error/warn/info/debug events from the backend for
-- troubleshooting and auditing purposes.

CREATE TABLE "run_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"module" text DEFAULT 'app' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_logs_level_idx" ON "run_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "run_logs_module_idx" ON "run_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "run_logs_created_at_idx" ON "run_logs" USING btree ("created_at" DESC);
