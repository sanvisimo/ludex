CREATE TYPE "public"."attribute_kind" AS ENUM('genre', 'theme', 'game_mode', 'player_perspective');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('igdb', 'opencritic', 'hltb', 'steamgriddb');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('pending', 'ok', 'failed');--> statement-breakpoint
CREATE TABLE "game_attributes" (
	"game_id" uuid NOT NULL,
	"attribute_id" integer NOT NULL,
	CONSTRAINT "game_attributes_game_id_attribute_id_pk" PRIMARY KEY("game_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "igdb_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "attribute_kind" NOT NULL,
	"igdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sources" (
	"game_id" uuid NOT NULL,
	"source" "data_source" NOT NULL,
	"status" "source_status" DEFAULT 'pending' NOT NULL,
	"synced_at" timestamp,
	"attempted_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_sources_game_id_source_pk" PRIMARY KEY("game_id","source")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "first_release_date" timestamp;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "cover_image_id" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "cover_width" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "cover_height" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "aggregated_rating" real;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "aggregated_rating_count" integer;--> statement-breakpoint
ALTER TABLE "game_attributes" ADD CONSTRAINT "game_attributes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attributes" ADD CONSTRAINT "game_attributes_attribute_id_igdb_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."igdb_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sources" ADD CONSTRAINT "game_sources_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_attributes_attribute_id_idx" ON "game_attributes" USING btree ("attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "igdb_attributes_kind_igdb_id_idx" ON "igdb_attributes" USING btree ("kind","igdb_id");