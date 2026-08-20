CREATE TYPE "public"."subscription" AS ENUM('ps_plus');--> statement-breakpoint
ALTER TABLE "ownerships" ADD COLUMN "subscription" "subscription";--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD COLUMN "platform_slug" text;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD CONSTRAINT "unresolved_imports_platform_slug_platforms_slug_fk" FOREIGN KEY ("platform_slug") REFERENCES "public"."platforms"("slug") ON DELETE no action ON UPDATE no action;