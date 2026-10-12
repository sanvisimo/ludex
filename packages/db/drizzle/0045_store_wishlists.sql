CREATE TABLE "wishlist_unresolved" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"store_account_id" uuid NOT NULL,
	"store" "store" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"store_page" text,
	"added_at" timestamp,
	"hidden_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_unresolved_account_external_key" UNIQUE("store_account_id","external_id")
);
--> statement-breakpoint
DROP INDEX "playlists_user_kind_name_idx";--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "store_account_id" uuid;--> statement-breakpoint
ALTER TABLE "wishlist_unresolved" ADD CONSTRAINT "wishlist_unresolved_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_unresolved" ADD CONSTRAINT "wishlist_unresolved_store_account_id_store_accounts_id_fk" FOREIGN KEY ("store_account_id") REFERENCES "public"."store_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishlist_unresolved_user_id_idx" ON "wishlist_unresolved" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_store_account_id_store_accounts_id_fk" FOREIGN KEY ("store_account_id") REFERENCES "public"."store_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_store_account_idx" ON "playlists" USING btree ("store_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_user_kind_name_idx" ON "playlists" USING btree ("user_id","kind",lower("name")) WHERE "playlists"."store_account_id" is null;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_kind_store_account_check" CHECK (("playlists"."kind"::text = 'store_wishlist') = ("playlists"."store_account_id" is not null));