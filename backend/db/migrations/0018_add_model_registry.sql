CREATE TABLE "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text DEFAULT 'ollama' NOT NULL,
	"model_name" text NOT NULL,
	"base_url" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "models_kind_idx" ON "models" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "models_provider_idx" ON "models" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "models_deleted_at_idx" ON "models" USING btree ("deleted_at");
