CREATE TYPE "public"."source_reason" AS ENUM('too_old', 'no_results', 'ambiguous', 'year_mismatch', 'taken', 'gone');--> statement-breakpoint
DROP INDEX "game_sources_source_external_id_idx";--> statement-breakpoint
ALTER TABLE "game_sources" ADD COLUMN "reason" "source_reason";--> statement-breakpoint
ALTER TABLE "game_sources" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "game_sources_source_external_id_idx" ON "game_sources" USING btree ("source","external_id") WHERE "game_sources"."external_id" is not null and not "game_sources"."manual";