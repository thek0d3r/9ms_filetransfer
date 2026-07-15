CREATE TYPE "public"."file_status" AS ENUM('pending', 'uploading', 'uploaded', 'clean', 'infected');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('uploading', 'scanning', 'ready', 'quarantined', 'expired', 'deleted');--> statement-breakpoint
CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"reporter_hash" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"transfer_id" uuid,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"checksum" text,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"upload_id" text,
	"scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_files_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_token_hash" text NOT NULL,
	"manage_token_hash" text NOT NULL,
	"title" text,
	"message" text,
	"password_hash" text,
	"status" "transfer_status" DEFAULT 'uploading' NOT NULL,
	"total_size" bigint NOT NULL,
	"file_count" integer NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transfers_share_token_hash_unique" UNIQUE("share_token_hash"),
	CONSTRAINT "transfers_manage_token_hash_unique" UNIQUE("manage_token_hash")
);
--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_files" ADD CONSTRAINT "transfer_files_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_reports_status_idx" ON "abuse_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "transfer_files_transfer_idx" ON "transfer_files" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "transfers_status_expires_idx" ON "transfers" USING btree ("status","expires_at");