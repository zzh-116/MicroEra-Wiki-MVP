CREATE TABLE "knowledge_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"index" integer NOT NULL,
	"text" text NOT NULL,
	"strategy" text NOT NULL DEFAULT 'markdown',
	"heading" text,
	"start_char" integer NOT NULL DEFAULT 0,
	"end_char" integer NOT NULL DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_doc_idx" ON "knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE TABLE "knowledge_vectors" (
	"chunk_id" text PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"embedding" vector(1024),
	"store" text NOT NULL DEFAULT 'pgvector',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_vectors" ADD CONSTRAINT "knowledge_vectors_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_vectors_doc_idx" ON "knowledge_vectors" USING btree ("document_id");
