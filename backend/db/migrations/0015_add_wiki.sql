CREATE TABLE "wikis" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"kb_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision_no" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "wikis_kb_idx" ON "wikis" USING btree ("kb_id");--> statement-breakpoint
CREATE INDEX "wikis_deleted_at_idx" ON "wikis" USING btree ("deleted_at");--> statement-breakpoint
CREATE TABLE "wiki_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wiki_id" integer NOT NULL,
	"revision_no" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wiki_revisions_wiki_idx" ON "wiki_revisions" USING btree ("wiki_id");--> statement-breakpoint
CREATE TABLE "wiki_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"wiki_id" integer NOT NULL,
	"chunk_id" text NOT NULL,
	"document_id" integer NOT NULL,
	"index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wiki_sources_wiki_idx" ON "wiki_sources" USING btree ("wiki_id");--> statement-breakpoint
CREATE INDEX "wiki_sources_chunk_idx" ON "wiki_sources" USING btree ("chunk_id");--> statement-breakpoint
CREATE TABLE "wiki_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_wiki_id" integer NOT NULL,
	"target_wiki_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_links_src_tgt_idx" ON "wiki_links" USING btree ("source_wiki_id","target_wiki_id");--> statement-breakpoint
CREATE INDEX "wiki_links_target_idx" ON "wiki_links" USING btree ("target_wiki_id");
