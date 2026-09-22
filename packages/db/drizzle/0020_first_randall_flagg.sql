CREATE TYPE "public"."game_type" AS ENUM('main_game', 'dlc', 'expansion', 'standalone_expansion', 'bundle', 'pack', 'episode', 'season', 'remake', 'remaster', 'expanded_game', 'port', 'mod', 'fork', 'update');--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "game_type" "game_type";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "parent_igdb_id" integer;