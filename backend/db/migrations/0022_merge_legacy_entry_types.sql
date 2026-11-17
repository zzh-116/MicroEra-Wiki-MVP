-- Merge legacy entry_type values into their canonical new values.
UPDATE "entries" SET entry_type = 'sandbox_project'    WHERE entry_type = 'product';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'tech_doc'           WHERE entry_type = 'tech';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'business_material'  WHERE entry_type = 'asset';
--> statement-breakpoint
UPDATE "entries" SET entry_type = 'data_standard'      WHERE entry_type = 'data_item';
