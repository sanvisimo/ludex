import { attributeKindValues } from "@repo/contracts/vocabulary";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { games } from "./games";
import { timestamps } from "./timestamps";

// Generi, temi, modalità di gioco e prospettive di IGDB hanno tutti la stessa
// forma — un id e un nome — e la stessa relazione molti-a-molti con `games`.
// Stanno quindi in una tabella sola distinta da `kind`, invece che in quattro
// tabelle gemelle più quattro di raccordo.
//
// Da non confondere con i tag e le categorie personali dello step 5: quelli sono
// scoped per utente e vivono lato `backlog`. Questi sono attributi del gioco,
// uguali per tutti, e alimentano i filtri e (allo step 7) l'embedding.
export const attributeKind = pgEnum("attribute_kind", attributeKindValues);

// Gli id IGDB sono unici solo dentro il proprio tipo — il genere 8 e il tema 8
// sono cose diverse — quindi la coppia (kind, igdbId) è la chiave naturale.
// La chiave primaria è comunque surrogata, così la tabella di raccordo referenzia
// una sola colonna invece di una coppia.
export const igdbAttributes = pgTable(
  "igdb_attributes",
  {
    id: serial("id").primaryKey(),
    kind: attributeKind("kind").notNull(),
    igdbId: integer("igdb_id").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("igdb_attributes_kind_igdb_id_idx").on(table.kind, table.igdbId)],
);

export const gameAttributes = pgTable(
  "game_attributes",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    attributeId: integer("attribute_id")
      .notNull()
      .references(() => igdbAttributes.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.attributeId] }),
    // La primary key indicizza (gameId, attributeId): partire dall'attributo
    // — "tutti i giochi di questo genere", il filtro hard dello step 7 —
    // richiede un indice proprio.
    index("game_attributes_attribute_id_idx").on(table.attributeId),
  ],
);
