import { userTagKindValues } from "@repo/contracts/vocabulary";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { backlog } from "./backlog";
import { timestamps } from "./timestamps";

// Valori da @repo/contracts, come gli altri enum: web e mobile devono conoscerli
// senza poter importare questo package.
export const userTagKind = pgEnum("user_tag_kind", userTagKindValues);

/**
 * Tag e categorie personali: il vocabolario che l'utente si costruisce da sé.
 *
 * Da non confondere con `igdb_attributes`, che ha la stessa forma ma non lo
 * stesso significato. Quelli sono attributi *del gioco*, uguali per tutti e
 * presi da IGDB; questi sono *dell'utente*, e "da rigiocare" o "quando sono
 * stanco" non sono cose che una fonte esterna potrebbe mai dire.
 *
 * L'insieme chiuso che il progetto impone è quello dei **campi**, non dei
 * valori: l'utente non può inventarsi un attributo "pippo" con un valore
 * arbitrario — per questo niente JSONB e niente EAV — ma i nomi dei suoi tag li
 * sceglie lui. Sono righe di una tabella normale, con una foreign key.
 */
export const userTags = pgTable(
  "user_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // text e non uuid: gli id di Better Auth sono stringhe.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: userTagKind("kind").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    // Unico su `lower(name)` e non sul nome grezzo: chi scrive "Da rigiocare" e
    // poi "da rigiocare" intende la stessa cosa, e con due righe si ritroverebbe
    // il backlog spaccato in due mucchi che sembrano uno. Il nome si conserva
    // come l'ha scritto la prima volta.
    uniqueIndex("user_tags_user_kind_name_idx").on(
      table.userId,
      table.kind,
      sql`lower(${table.name})`,
    ),
    index("user_tags_user_id_idx").on(table.userId),
  ],
);

/**
 * Quali tag stanno su quale riga di backlog.
 *
 * Non c'è `userId` qui: lo portano già entrambi i lati, e il servizio risolve i
 * nomi in id **filtrando per utente** prima di scrivere. È lì che si impedisce a
 * un utente di attaccarsi il tag di un altro, ed è quello che i test verificano.
 */
export const backlogTags = pgTable(
  "backlog_tags",
  {
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlog.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => userTags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.backlogId, table.tagId] }),
    // La primary key indicizza (backlogId, tagId): partire dal tag — "tutti i
    // giochi che ho segnato «quando sono stanco»", il filtro dello step 7 —
    // richiede un indice proprio.
    index("backlog_tags_tag_id_idx").on(table.tagId),
  ],
);
