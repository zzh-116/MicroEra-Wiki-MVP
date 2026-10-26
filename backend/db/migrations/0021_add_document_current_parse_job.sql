-- Phase 1 pure-text worker: record the latest enqueued parse job on each
-- document so a fenced parse commit can reject a stale (superseded) worker
-- without needing a monotonic document version. NULL means "no ownership
-- constraint" (legacy documents created before this column existed).
ALTER TABLE "documents" ADD COLUMN "current_parse_job_id" text;
