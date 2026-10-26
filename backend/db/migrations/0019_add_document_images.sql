CREATE TABLE "document_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"image_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_image_name_unique" UNIQUE ("document_id","image_name");--> statement-breakpoint
CREATE INDEX "document_images_document_idx" ON "document_images" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_images_image_name_idx" ON "document_images" USING btree ("image_name");
