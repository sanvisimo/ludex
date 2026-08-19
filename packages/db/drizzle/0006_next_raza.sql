CREATE TABLE "store_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"store" "store" NOT NULL,
	"external_account_id" text NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_accounts_user_id_store_key" UNIQUE("user_id","store")
);
--> statement-breakpoint
CREATE TABLE "unresolved_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"store" "store" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"playtime_minutes" integer,
	"last_played_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unresolved_imports_user_store_external_key" UNIQUE("user_id","store","external_id")
);
--> statement-breakpoint
ALTER TABLE "ownerships" ADD COLUMN "playtime_minutes" integer;--> statement-breakpoint
ALTER TABLE "ownerships" ADD COLUMN "last_played_at" timestamp;--> statement-breakpoint
ALTER TABLE "store_accounts" ADD CONSTRAINT "store_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD CONSTRAINT "unresolved_imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_accounts_user_id_idx" ON "store_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unresolved_imports_user_id_idx" ON "unresolved_imports" USING btree ("user_id");