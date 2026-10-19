ALTER TYPE "public"."store" ADD VALUE 'ubisoft' BEFORE 'amazon';--> statement-breakpoint
ALTER TABLE "store_accounts" ADD COLUMN "from_file" boolean DEFAULT false NOT NULL;