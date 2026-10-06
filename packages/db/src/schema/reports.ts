import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { dataSource } from './data-source';
import { games, store } from './games';
import { timestamps } from './timestamps';

/**
 * Le segnalazioni degli utenti (11a): «questo gioco è sbagliato».
 *
 * Esistono perché un collegamento sbagliato non lo vede nessun automatismo: il
 * gioco ha `igdbId` e le fonti in `found`, e non finisce in nessuna lista. Lo
 * vede solo chi ce l'ha in libreria. L'utente segnala, l'admin corregge.
 *
 * Una segnalazione riguarda **una cosa sola**: la copia di un negozio — Toki su
 * Nintendo collegato all'arcade invece che al remake — oppure una fonte — MGS3
 * Master Collection agganciato su Metacritic a Peace Walker. Il CHECK qui sotto
 * vuole esattamente una delle due. Il form che ne spunta tre ne scrive tre: si
 * chiudono ciascuna quando l'admin corregge quella cosa.
 */
export const gameReports = pgTable(
  'game_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    // La copia di quel negozio è collegata al gioco sbagliato.
    store: store('store'),
    // Oppure: quella fonte è agganciata alla scheda sbagliata.
    source: dataSource('source'),
    // Il gioco giusto, se l'utente l'ha trovato con la ricerca IGDB…
    suggestedIgdbId: integer('suggested_igdb_id'),
    // …o almeno il suo nome, se la ricerca non l'ha trovato.
    suggestedName: text('suggested_name'),
    note: text('note'),
    // Chiusa: corretta dall'admin, o archiviata. Le chiuse restano, sono la
    // storia di cosa è stato segnalato.
    resolvedAt: timestamp('resolved_at'),
    // `set null`: cancellare l'account dell'admin non riapre niente.
    resolvedBy: text('resolved_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    check(
      'game_reports_one_target',
      sql`(${table.store} is null) <> (${table.source} is null)`,
    ),
    // Una sola aperta per utente, gioco e cosa: risegnalare la aggiorna. Due
    // indici e non uno su `coalesce(store::text, source::text)`: il cast di un
    // enum a testo non è IMMUTABLE, e Postgres non lo vuole in un indice.
    uniqueIndex('game_reports_open_store_idx')
      .on(table.userId, table.gameId, table.store)
      .where(sql`${table.resolvedAt} is null and ${table.store} is not null`),
    uniqueIndex('game_reports_open_source_idx')
      .on(table.userId, table.gameId, table.source)
      .where(sql`${table.resolvedAt} is null and ${table.source} is not null`),
    index('game_reports_game_id_idx').on(table.gameId),
  ],
);
