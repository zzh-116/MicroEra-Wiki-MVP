CREATE TABLE "eval_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kb_id" integer,
	"description" text DEFAULT '' NOT NULL,
	"method" text DEFAULT 'hybrid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "eval_datasets_kb_idx" ON "eval_datasets" USING btree ("kb_id");--> statement-breakpoint
CREATE INDEX "eval_datasets_deleted_at_idx" ON "eval_datasets" USING btree ("deleted_at");--> statement-breakpoint
CREATE TABLE "eval_dataset_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"query" text NOT NULL,
	"relevant_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eval_dataset_items_dataset_idx" ON "eval_dataset_items" USING btree ("dataset_id");--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"method" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"per_query" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eval_runs_dataset_idx" ON "eval_runs" USING btree ("dataset_id");
