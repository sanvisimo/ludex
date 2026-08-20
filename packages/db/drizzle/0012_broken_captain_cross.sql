CREATE TYPE "public"."store_account_status" AS ENUM('ok', 'needs_reauth');--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "credentials" "bytea";--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "credentials_expire_at" timestamp;--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "status" "store_account_status" DEFAULT 'ok' NOT NULL;