CREATE TYPE "public"."related_kind" AS ENUM('remake', 'remaster', 'similar');--> statement-breakpoint
CREATE TABLE "game_related" (
	"game_id" uuid NOT NULL,
	"kind" "related_kind" NOT NULL,
	"igdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"cover_image_id" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_related_game_id_kind_igdb_id_pk" PRIMARY KEY("game_id","kind","igdb_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "artwork_image_ids" text[];--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "screenshot_image_ids" text[];--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "videos" jsonb;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "developers" text[];--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "publishers" text[];--> statement-breakpoint
ALTER TABLE "game_related" ADD CONSTRAINT "game_related_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;