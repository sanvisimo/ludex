CREATE TYPE "public"."wishlist_error" AS ENUM('not_visible', 'reauth', 'failed');--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "wishlist_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "wishlist_error" "wishlist_error";