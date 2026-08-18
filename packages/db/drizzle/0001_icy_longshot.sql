CREATE TYPE "public"."store" AS ENUM('steam', 'gog', 'epic', 'ea', 'battlenet', 'amazon', 'psn', 'xbox', 'nintendo');--> statement-breakpoint
CREATE TYPE "public"."backlog_status" AS ENUM('backlog', 'playing', 'played', 'dropped', 'excluded');--> statement-breakpoint
CREATE TABLE "platforms" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"igdb_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_igdb_id_unique" UNIQUE("igdb_id")
);
--> statement-breakpoint
CREATE TABLE "external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"source" "store" NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"igdb_id" integer,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "games_igdb_id_unique" UNIQUE("igdb_id")
);
--> statement-breakpoint
CREATE TABLE "backlog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"status" "backlog_status" DEFAULT 'backlog' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_user_id_game_id_key" UNIQUE("user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"platform_slug" text NOT NULL,
	"store" "store",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ownerships_backlog_platform_store_key" UNIQUE NULLS NOT DISTINCT("backlog_id","platform_slug","store")
);
--> statement-breakpoint
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog" ADD CONSTRAINT "backlog_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog" ADD CONSTRAINT "backlog_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_platform_slug_platforms_slug_fk" FOREIGN KEY ("platform_slug") REFERENCES "public"."platforms"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_ids_source_external_id_idx" ON "external_ids" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "external_ids_game_id_idx" ON "external_ids" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "games_created_at_idx" ON "games" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "backlog_user_id_idx" ON "backlog" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ownerships_backlog_id_idx" ON "ownerships" USING btree ("backlog_id");