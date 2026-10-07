CREATE TYPE "public"."playlist_kind" AS ENUM('filter', 'wishlist');--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"list_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_list_id_game_id_pk" PRIMARY KEY("list_id","game_id")
);
--> statement-breakpoint
DROP INDEX "playlists_user_name_idx";--> statement-breakpoint
ALTER TABLE "playlists" ALTER COLUMN "query" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "kind" "playlist_kind" DEFAULT 'filter' NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_list_id_playlists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishlist_items_game_id_idx" ON "wishlist_items" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_user_kind_name_idx" ON "playlists" USING btree ("user_id","kind",lower("name"));--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_kind_query_check" CHECK (("playlists"."kind" = 'filter') = ("playlists"."query" is not null));