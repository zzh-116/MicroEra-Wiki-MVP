-- Add bookmarks table. The journal already referenced this migration but the
-- SQL file was missing from the repository. Idempotent statements keep the
-- current database (where the table already exists) safe on next boot.
CREATE TABLE IF NOT EXISTS "bookmarks" (
	"user_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_user_id_users_id_fk') THEN
		ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_entry_id_entries_id_fk') THEN
		ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_user_idx" ON "bookmarks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_entry_idx" ON "bookmarks" USING btree ("entry_id");
