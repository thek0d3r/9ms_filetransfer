ALTER TABLE "transfers" ADD COLUMN "retention_hours" integer DEFAULT 168 NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "scan_priority" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "first_downloaded_at" timestamp with time zone;