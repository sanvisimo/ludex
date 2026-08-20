ALTER TYPE "public"."store_account_status" ADD VALUE 'unlinked';--> statement-breakpoint
ALTER TABLE "ownerships" DROP CONSTRAINT "ownerships_backlog_platform_store_key";--> statement-breakpoint
ALTER TABLE "store_accounts" DROP CONSTRAINT "store_accounts_user_id_store_key";--> statement-breakpoint
ALTER TABLE "unresolved_imports" DROP CONSTRAINT "unresolved_imports_user_store_external_key";--> statement-breakpoint
ALTER TABLE "ownerships" ADD COLUMN "store_account_id" uuid;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD COLUMN "store_account_id" uuid;--> statement-breakpoint
--> Backfill. Fin qui l'account era uno solo per (utente, negozio), quindi la
--> riga da cui viene ogni possesso importato e' ricavabile senza ambiguita': e'
--> l'unico account di quell'utente su quel negozio. I possessi inseriti a mano
--> non hanno `store` e restano senza account, che e' giusto cosi'.
UPDATE "ownerships" o
   SET "store_account_id" = sa."id"
  FROM "backlog" b, "store_accounts" sa
 WHERE o."backlog_id" = b."id"
   AND o."store" IS NOT NULL
   AND sa."user_id" = b."user_id"
   AND sa."store" = o."store";--> statement-breakpoint
UPDATE "unresolved_imports" u
   SET "store_account_id" = sa."id"
  FROM "store_accounts" sa
 WHERE sa."user_id" = u."user_id"
   AND sa."store" = u."store";--> statement-breakpoint
--> Uno scarto senza account non vuol dire piu' niente: e' una voce di una
--> libreria che non sappiamo piu' leggere. Non ce ne dovrebbero essere — oggi
--> scollegare li cancella — ma la colonna sta per diventare NOT NULL e la
--> migration non deve dipendere da quella speranza.
DELETE FROM "unresolved_imports" WHERE "store_account_id" IS NULL;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ALTER COLUMN "store_account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_store_account_id_store_accounts_id_fk" FOREIGN KEY ("store_account_id") REFERENCES "public"."store_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD CONSTRAINT "unresolved_imports_store_account_id_store_accounts_id_fk" FOREIGN KEY ("store_account_id") REFERENCES "public"."store_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_backlog_platform_store_key" UNIQUE NULLS NOT DISTINCT("backlog_id","platform_slug","store","store_account_id");--> statement-breakpoint
ALTER TABLE "store_accounts" ADD CONSTRAINT "store_accounts_user_store_external_key" UNIQUE("user_id","store","external_account_id");--> statement-breakpoint
ALTER TABLE "unresolved_imports" ADD CONSTRAINT "unresolved_imports_account_external_key" UNIQUE("store_account_id","external_id");
