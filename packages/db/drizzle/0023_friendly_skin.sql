ALTER TABLE "backlog" ADD COLUMN "added_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
--> Backfill. Il default riempirebbe le righe esistenti con l'istante della
--> migration, tutte uguali; la cosa più vicina al vero che abbiamo è quando la
--> riga è nata. Il primo reimport porta poi la data del negozio, dove c'è.
UPDATE "backlog" SET "added_at" = "created_at";
