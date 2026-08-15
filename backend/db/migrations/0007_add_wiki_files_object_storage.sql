-- Add object storage metadata columns to wiki_files (MinIO / S3 migration).
-- storage_path is intentionally kept for backward compatibility with legacy
-- local filesystem records; object_key/bucket become the primary location.
ALTER TABLE "wiki_files" ADD COLUMN "object_key" text;
--> statement-breakpoint
ALTER TABLE "wiki_files" ADD COLUMN "object_bucket" text;
--> statement-breakpoint
ALTER TABLE "wiki_files" ADD COLUMN "sha256" text;
--> statement-breakpoint
ALTER TABLE "wiki_files" ADD COLUMN "content_type" text;
