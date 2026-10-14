CREATE TABLE "platform_mismatch_dismissals" (
	"game_id" uuid NOT NULL,
	"platform_slug" text NOT NULL,
	"dismissed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_mismatch_dismissals_game_id_platform_slug_pk" PRIMARY KEY("game_id","platform_slug")
);
--> statement-breakpoint
ALTER TABLE "platform_mismatch_dismissals" ADD CONSTRAINT "platform_mismatch_dismissals_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_mismatch_dismissals" ADD CONSTRAINT "platform_mismatch_dismissals_platform_slug_platforms_slug_fk" FOREIGN KEY ("platform_slug") REFERENCES "public"."platforms"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_mismatch_dismissals" ADD CONSTRAINT "platform_mismatch_dismissals_dismissed_by_user_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;