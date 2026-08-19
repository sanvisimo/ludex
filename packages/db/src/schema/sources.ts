import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { games } from "./games";
import { timestamps } from "./timestamps";

// Fonti dei metadati. Distinto da `store` (i negozi) perché OpenCritic e HLTB
// non sono posti da cui si compra: sono posti da cui si legge.
export const dataSource = pgEnum("data_source", [
  "igdb",
  "opencritic",
  "hltb",
  "steamgriddb",
]);

// `failed` e `not_found` sono due cose diverse e tenerle separate è ciò che
// permette alla spazzata di smettere di riprovare.
//
// - `failed`: l'ultimo tentativo è andato male per una ragione che può passare —
//   rete, 500, credenziali scadute. Si riprova, diradando.
// - `not_found`: la fonte non ha questo gioco. Non passerà da sé: riprovare ogni
//   sei ore per sempre è lavoro buttato. Si riapre per evento, quando cambia
//   l'identificativo del gioco su quella fonte, non per scadenza.
export const sourceStatus = pgEnum("source_status", [
  "pending",
  "ok",
  "failed",
  "not_found",
]);

/**
 * Stato dell'enrichment, una riga per (gioco, fonte).
 *
 * Esiste perché `games.updatedAt` non sa rispondere alla domanda che serve
 * davvero: le fonti arrivano in momenti diversi — IGDB allo step 3, HLTB allo
 * step 6 — e scrivono sulla stessa riga. Un unico timestamp le collassa e non
 * dice se è vecchio l'IGDB o se l'HLTB non è mai stato preso.
 *
 * Tiene anche l'esito dell'ultimo tentativo: senza, un job fallito diventa
 * indistinguibile da uno mai partito.
 *
 * E tiene l'id del gioco **su quella fonte**. `games.igdbId` resta dov'è perché
 * ha un altro ruolo — è la chiave d'identità del gioco, quella su cui l'import
 * riconosce che due utenti hanno lo stesso gioco. Gli altri sono solo indirizzi
 * per tornare a prendere il dato, e stanno accanto allo stato che li riguarda.
 */
export const gameSources = pgTable(
  "game_sources",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    source: dataSource("source").notNull(),
    status: sourceStatus("status").notNull().default("pending"),
    // Ultimo successo. Null finché non è mai andata a buon fine: è questo il
    // campo su cui si decide che cosa riaccodare.
    syncedAt: timestamp("synced_at"),
    // Ultimo tentativo, riuscito o no.
    attemptedAt: timestamp("attempted_at"),
    error: text("error"),
    /**
     * L'id del gioco sulla fonte: il 26286 di Hollow Knight su HLTB.
     *
     * Serve a ripassare fra sei mesi senza rifare la ricerca per nome — che è
     * la parte cara e l'unica che può sbagliare. Nullo finché la fonte non è
     * stata agganciata, e resta nullo su IGDB, che l'id ce l'ha già su `games`.
     */
    externalId: text("external_id"),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.source] }),
    // Due nostri giochi non possono essere la stessa voce sulla fonte. Non è
    // prudenza: HLTB ha due "Resident Evil 4" con lo stesso identico nome, e un
    // match per nome li assegnerebbe volentieri entrambi allo stesso id. Il
    // conflitto in scrittura è il segnale che il match è sbagliato.
    //
    // Parziale, perché i NULL qui sono la norma: senza il `where`, Postgres li
    // considererebbe comunque tutti distinti, ma l'indice si porterebbe dietro
    // una riga per ogni fonte mai tentata.
    uniqueIndex("game_sources_source_external_id_idx")
      .on(table.source, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ],
);
