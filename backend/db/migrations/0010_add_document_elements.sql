CREATE TABLE "document_elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"element_type" text NOT NULL,
	"position" integer NOT NULL DEFAULT 0,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_char" integer,
	"end_char" integer,
	"start_line" integer,
	"end_line" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_elements" ADD CONSTRAINT "document_elements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_elements_doc_idx" ON "document_elements" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_elements_type_idx" ON "document_elements" USING btree ("element_type");
