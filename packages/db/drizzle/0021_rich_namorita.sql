CREATE TABLE "ownership_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"platform_slug" text NOT NULL,
	"store" "store",
	"store_account_id" uuid,
	"medium" "medium",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_rejections_key" UNIQUE NULLS NOT DISTINCT("backlog_id","platform_slug","store","store_account_id","medium")
);
--> statement-breakpoint
ALTER TABLE "ownership_rejections" ADD CONSTRAINT "ownership_rejections_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_rejections" ADD CONSTRAINT "ownership_rejections_platform_slug_platforms_slug_fk" FOREIGN KEY ("platform_slug") REFERENCES "public"."platforms"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_rejections" ADD CONSTRAINT "ownership_rejections_store_account_id_store_accounts_id_fk" FOREIGN KEY ("store_account_id") REFERENCES "public"."store_accounts"("id") ON DELETE cascade ON UPDATE no action;