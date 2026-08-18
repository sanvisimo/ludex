import { pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const sourceStatus = pgEnum("source_status", ["pending", "ok", "failed"]);

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
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.gameId, table.source] })],
);
