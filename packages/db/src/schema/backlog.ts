import { backlogStatusValues } from "@repo/contracts/vocabulary";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games, store } from "./games";
import { platforms } from "./platforms";
import { timestamps } from "./timestamps";

// `excluded` ("non voglio giocarlo") è uno stato, non una tabella a parte: è un
// segnale negativo esplicito e allo step 7 vale più di molte valutazioni positive.
// Valori da @repo/contracts, vedi il commento su `store` in games.ts.
export const backlogStatus = pgEnum("backlog_status", backlogStatusValues);

// L'esistenza della riga È il possesso: nessun flag "posseduto". La wishlist è
// una tabella separata, così ogni query qui resta semplice.
// Voto, tag e categorie personali arrivano allo step 5.
export const backlog = pgTable(
  "backlog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // text e non uuid: gli id di Better Auth sono stringhe.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    status: backlogStatus("status").notNull().default("backlog"),
    ...timestamps,
  },
  (table) => [
    // Una riga per gioco/utente: stato e (dallo step 5) voto non si duplicano.
    unique("backlog_user_id_game_id_key").on(table.userId, table.gameId),
    // Il filtro per utente è una JOIN backlog → games, parte sempre da qui.
    index("backlog_user_id_idx").on(table.userId),
  ],
);

// I possessi stanno a parte così stato e voto non si duplicano per piattaforma.
// Una riga per (backlog, piattaforma, store): su PC lo stesso gioco può stare su
// Steam *e* GOG. La piattaforma è il filtro hard ("stasera ho la Switch accesa"),
// lo store dice da dove lanciarlo e da quale import proviene.
export const ownerships = pgTable(
  "ownerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backlogId: uuid("backlog_id")
      .notNull()
      .references(() => backlog.id, { onDelete: "cascade" }),
    platformSlug: text("platform_slug")
      .notNull()
      .references(() => platforms.slug),
    // Vuoto sugli inserimenti manuali: si sa su che console ci giochi, non
    // necessariamente da dove viene la copia.
    store: store("store"),
    // Ore giocate e ultima partita, come le riporta il negozio da cui viene
    // l'import. Stanno qui e non su `backlog` perche' sono una proprieta' di
    // *questa copia*: lo stesso gioco su GOG avrebbe le sue.
    //
    // Sono dato oggettivo del negozio, non un campo personale dello step 5, e
    // restano nulli sugli inserimenti manuali. Non si usano per indovinare lo
    // stato: due ore su un GDR da sessanta non vogliono dire "giocato", e
    // `played` allo step 7 pesa.
    playtimeMinutes: integer("playtime_minutes"),
    lastPlayedAt: timestamp("last_played_at"),
    ...timestamps,
  },
  (table) => [
    // NULLS NOT DISTINCT perché store è nullable: con il comportamento standard
    // di Postgres i NULL sono tutti diversi fra loro, e "PC / nessuno store" si
    // potrebbe inserire due volte sullo stesso gioco.
    unique("ownerships_backlog_platform_store_key")
      .on(table.backlogId, table.platformSlug, table.store)
      .nullsNotDistinct(),
    index("ownerships_backlog_id_idx").on(table.backlogId),
  ],
);
