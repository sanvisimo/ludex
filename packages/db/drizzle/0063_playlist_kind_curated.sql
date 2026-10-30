ALTER TYPE "public"."playlist_kind" ADD VALUE 'curated';--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "position" integer;