CREATE TYPE "public"."score_source" AS ENUM('igdb', 'opencritic', 'metacritic');--> statement-breakpoint
ALTER TYPE "public"."data_source" ADD VALUE 'metacritic';--> statement-breakpoint
CREATE TABLE "game_scores" (
	"game_id" uuid NOT NULL,
	"source" "score_source" NOT NULL,
	"platform_slug" text,
	"score" real NOT NULL,
	"review_count" integer,
	"median_score" real,
	"percent_recommended" real,
	"tier" text,
	"positive_count" integer,
	"neutral_count" integer,
	"negative_count" integer,
	"sentiment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_scores_game_source_platform_key" UNIQUE NULLS NOT DISTINCT("game_id","source","platform_slug")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "critic_score" real;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "critic_score_source" "score_source";--> statement-breakpoint
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_platform_slug_platforms_slug_fk" FOREIGN KEY ("platform_slug") REFERENCES "public"."platforms"("slug") ON DELETE no action ON UPDATE no action;