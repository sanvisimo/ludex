CREATE TABLE "game_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"store" "store",
	"source" "data_source",
	"suggested_igdb_id" integer,
	"suggested_name" text,
	"note" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_reports_one_target" CHECK (("game_reports"."store" is null) <> ("game_reports"."source" is null))
);
--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_reports_open_store_idx" ON "game_reports" USING btree ("user_id","game_id","store") WHERE "game_reports"."resolved_at" is null and "game_reports"."store" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "game_reports_open_source_idx" ON "game_reports" USING btree ("user_id","game_id","source") WHERE "game_reports"."resolved_at" is null and "game_reports"."source" is not null;--> statement-breakpoint
CREATE INDEX "game_reports_game_id_idx" ON "game_reports" USING btree ("game_id");