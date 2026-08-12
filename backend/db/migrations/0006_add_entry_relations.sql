-- Add entry_relations table: persisted knowledge graph edges.
-- source_entry_id < target_entry_id keeps each undirected semantic pair
-- stored once, and the unique constraint prevents A->B + B->A duplicates.
CREATE TABLE "entry_relations" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_entry_id" integer NOT NULL,
  "target_entry_id" integer NOT NULL,
  "relation_type" text DEFAULT 'semantic_related' NOT NULL,
  "similarity" double precision,
  "relation_source" text DEFAULT 'embedding' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "entry_relations_source_entry_id_entries_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "entry_relations_target_entry_id_entries_id_fk" FOREIGN KEY ("target_entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "entry_relations_source_target_type_unique" UNIQUE("source_entry_id", "target_entry_id", "relation_type")
);
--> statement-breakpoint
CREATE INDEX "entry_relations_source_idx" ON "entry_relations" USING btree ("source_entry_id");
--> statement-breakpoint
CREATE INDEX "entry_relations_target_idx" ON "entry_relations" USING btree ("target_entry_id");
