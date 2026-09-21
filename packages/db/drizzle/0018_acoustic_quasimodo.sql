CREATE TYPE "public"."hidden_kind" AS ENUM('app', 'dlc', 'extra', 'prerelease', 'unwanted');--> statement-breakpoint
ALTER TABLE "backlog" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD COLUMN "hidden_kind" "hidden_kind";--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD CONSTRAINT "unresolved_imports_hidden_kind" CHECK (("unresolved_imports"."hidden_at" is null) = ("unresolved_imports"."hidden_kind" is null));