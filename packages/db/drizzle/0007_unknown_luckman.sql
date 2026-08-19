CREATE TYPE "public"."user_tag_kind" AS ENUM('tag', 'category');--> statement-breakpoint
CREATE TABLE "backlog_tags" (
	"backlog_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "backlog_tags_backlog_id_tag_id_pk" PRIMARY KEY("backlog_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "user_tag_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlog" ADD COLUMN "rating" real;--> statement-breakpoint
ALTER TABLE "backlog" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "backlog_tags" ADD CONSTRAINT "backlog_tags_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_tags" ADD CONSTRAINT "backlog_tags_tag_id_user_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."user_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_tags_tag_id_idx" ON "backlog_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tags_user_kind_name_idx" ON "user_tags" USING btree ("user_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "user_tags_user_id_idx" ON "user_tags" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "backlog" ADD CONSTRAINT "backlog_rating_scale" CHECK ("backlog"."rating" is null or ("backlog"."rating" >= 0.5 and "backlog"."rating" <= 5 and ("backlog"."rating" * 2) = floor("backlog"."rating" * 2)));