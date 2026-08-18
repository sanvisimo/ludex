import { storeValues } from "@repo/contracts/vocabulary";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./timestamps";

// Negozi da cui un gioco può provenire. Serve a due cose che oggi hanno la stessa
// lista: da dove si lancia il gioco (`ownerships.store`) e in che namespace vive
// un id esterno (`external_ids.source`). Quando arriveranno sorgenti che non sono
// negozi — HLTB e OpenCritic, step 3 e 6 — `external_ids.source` vorrà un enum
// suo e le due cose si separeranno.
//
// I valori arrivano da @repo/contracts perché servono anche a web e mobile, che
// non possono importare questo package.
export const store = pgEnum("store", storeValues);

// Condivisa fra tutti gli utenti: se l'utente 2 importa un gioco già presente
// riusa questa riga e l'enrichment si paga una volta sola. Per questo qui NON
// c'è userId — il possesso sta su `backlog`.
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Chiave esterna canonica, ma nullable: un gioco inserito a mano e non
    // ancora risolto su IGDB è legittimo. Nessuna query può quindi dare per
    // scontato che i metadata siano popolati.
    igdbId: integer("igdb_id").unique(),
    name: text("name").notNull(),

    // --- metadati, popolati dall'enrichment dello step 3 ---
    // Tutti nullable: un gioco esiste prima di essere arricchito, e le fonti
    // arrivano in momenti diversi. Che cosa sia gia stato preso lo dice
    // `game_sources`, non il fatto che una colonna sia piena.
    summary: text("summary"),
    firstReleaseDate: timestamp("first_release_date"),
    // IGDB restituisce un `image_id`: l'URL si compone al momento di mostrarlo,
    // scegliendo la dimensione. Salvare l'URL gia fatto vincolerebbe al formato.
    coverImageId: text("cover_image_id"),
    coverWidth: integer("cover_width"),
    coverHeight: integer("cover_height"),
    // Voto della critica aggregato da IGDB. Allo step 3 è l'unico che abbiamo;
    // OpenCritic arrivera dopo come fonte separata, senza sovrascrivere questo.
    aggregatedRating: real("aggregated_rating"),
    aggregatedRatingCount: integer("aggregated_rating_count"),

    ...timestamps,
  },
  // Ordinamento del catalogo pubblico: ultimi giochi conosciuti da Ludex.
  (table) => [index("games_created_at_idx").on(table.createdAt)],
);

// Mappa Steam appid, GOG, PSN, Xbox… tutti sulla stessa riga `games`. Ogni nuova
// libreria importabile aggiunge righe qui, non colonne a `games`.
export const externalIds = pgTable(
  "external_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    source: store("source").notNull(),
    externalId: text("external_id").notNull(),
    ...timestamps,
  },
  (table) => [
    // Lo stesso id su Steam non può puntare a due giochi diversi.
    uniqueIndex("external_ids_source_external_id_idx").on(
      table.source,
      table.externalId,
    ),
    index("external_ids_game_id_idx").on(table.gameId),
  ],
);
