CREATE TABLE "one_time_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"manage_token_hash" text NOT NULL,
	"label" text,
	"ciphertext" text,
	"nonce" text,
	"auth_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "one_time_secrets_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "one_time_secrets_manage_token_hash_unique" UNIQUE("manage_token_hash")
);
--> statement-breakpoint
CREATE INDEX "one_time_secrets_expiry_idx" ON "one_time_secrets" USING btree ("expires_at","consumed_at");