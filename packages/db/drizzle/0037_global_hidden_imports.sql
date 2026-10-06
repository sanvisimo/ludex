CREATE TABLE "global_hidden_imports" (
	"store" "store" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"hidden_kind" "hidden_kind" NOT NULL,
	"decided_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "global_hidden_imports_store_external_id_pk" PRIMARY KEY("store","external_id"),
	CONSTRAINT "global_hidden_imports_not_unwanted" CHECK ("global_hidden_imports"."hidden_kind" <> 'unwanted')
);
--> statement-breakpoint
ALTER TABLE "global_hidden_imports" ADD CONSTRAINT "global_hidden_imports_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;