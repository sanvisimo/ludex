CREATE TYPE "public"."medium" AS ENUM('digital', 'physical');--> statement-breakpoint
ALTER TABLE "ownerships" ADD COLUMN "medium" "medium";