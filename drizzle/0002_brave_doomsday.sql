ALTER TYPE "public"."file_status" ADD VALUE 'consumed';--> statement-breakpoint
ALTER TABLE "transfer_files" ADD COLUMN "download_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transfer_files" ADD COLUMN "delete_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transfer_files" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "transfer_files_deletion_idx" ON "transfer_files" USING btree ("status","delete_after");