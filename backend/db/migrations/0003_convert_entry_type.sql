-- Convert entry_type from old 5-type enum to new 8-type system
ALTER TABLE "entries" DROP CONSTRAINT IF EXISTS "entries_entry_type_check";
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'sandbox_project' WHERE entry_type = 'product';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'academic_paper'  WHERE entry_type = 'tech';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'patent'          WHERE entry_type = 'patent';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'data_standard'   WHERE entry_type = 'data_item';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'template'        WHERE entry_type = 'asset';
