import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { games } from './games';
import { playlists } from './playlists';

/**
 * I giochi di una lista (`playlists` col tipo `wishlist`, step 15b).
 *
 * **Solo il gioco e la data**: la lista è un promemoria, e ciò che serve a
 * scegliere (durata, voti) sta già su `games`, che si arricchisce da sé. Un gioco
 * può stare in più liste.
 *
 * Non c'è `user_id`: lo porta la lista, e le funzioni del servizio risolvono
 * sempre la lista **filtrando per utente** prima di toccare le voci, come per
 * `backlog_tags`.
 *
 * Una riga di `games` non si cancella mai, quindi il cascade su `game_id` non è
 * un rischio per le liste degli altri.
 */
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.gameId] }),
    // La chiave parte dalla lista: «in quali liste sta questo gioco» e «togli
    // questo gioco da tutte le liste» partono dal gioco.
    index('wishlist_items_game_id_idx').on(table.gameId),
  ],
);
