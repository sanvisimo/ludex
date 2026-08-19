ALTER TABLE "games" ADD COLUMN "hltb_main_minutes" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_plus_minutes" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_completionist_minutes" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_all_styles_minutes" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_main_count" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_plus_count" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_completionist_count" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_all_styles_count" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_has_solo" boolean;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_has_coop" boolean;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "hltb_has_versus" boolean;--> statement-breakpoint
ALTER TABLE "game_sources" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "game_sources_source_external_id_idx" ON "game_sources" USING btree ("source","external_id") WHERE "game_sources"."external_id" is not null;