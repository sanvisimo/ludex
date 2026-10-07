ALTER TABLE "playlists" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_share_token_unique" UNIQUE("share_token");