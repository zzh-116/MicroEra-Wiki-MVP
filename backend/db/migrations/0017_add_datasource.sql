CREATE TABLE "datasources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"connector" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cursor" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "datasources_connector_idx" ON "datasources" USING btree ("connector");--> statement-breakpoint
CREATE INDEX "datasources_deleted_at_idx" ON "datasources" USING btree ("deleted_at");--> statement-breakpoint
CREATE TABLE "datasource_sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"datasource_id" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "datasource_sync_logs_ds_idx" ON "datasource_sync_logs" USING btree ("datasource_id");--> statement-breakpoint
CREATE INDEX "datasource_sync_logs_status_idx" ON "datasource_sync_logs" USING btree ("status");
