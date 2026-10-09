CREATE TABLE "parse_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL DEFAULT 'parse',
	"document_id" integer,
	"kb_id" integer,
	"status" text NOT NULL DEFAULT 'pending',
	"attempt" integer NOT NULL DEFAULT 0,
	"max_attempts" integer NOT NULL DEFAULT 3,
	"stage" text,
	"progress" integer NOT NULL DEFAULT 0,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"error_code" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "parse_jobs_status_idx" ON "parse_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parse_jobs_document_idx" ON "parse_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "parse_jobs_lease_idx" ON "parse_jobs" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE TABLE "parse_deadletters" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"document_id" integer,
	"error" text,
	"error_code" text,
	"attempts" integer NOT NULL DEFAULT 0,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replayed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "parse_deadletters_job_idx" ON "parse_deadletters" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "parse_deadletters_document_idx" ON "parse_deadletters" USING btree ("document_id");
