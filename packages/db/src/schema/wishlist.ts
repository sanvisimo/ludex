import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { games, store } from './games';
import { storeAccounts } from './imports';
import { playlists } from './playlists';
import { timestamps } from './timestamps';

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

/**
 * Le voci della wishlist di un negozio che l'import non ha saputo legare a un
 * gioco (step 15e).
 *
 * **Non stanno in `unresolved_imports`**, che pure se ne ha l'aria: quella tabella
 * è degli scarti della *libreria*, e `importLibrary` ne cancella ogni volta tutto
 * ciò che non è nella libreria dell'account. Una voce di wishlist, che nella
 * libreria non c'è, sparirebbe al primo import di libreria; e un appid in
 * wishlist e già posseduto avrebbe la stessa chiave di una voce della libreria.
 * Le due cose si somigliano e non devono toccarsi.
 *
 * Per utente e per account, come gli scarti: la voce è un pezzo della *sua*
 * wishlist, e nasce da un import e sparisce con l'account (cascade). Risolta, la
 * riga se ne va e il gioco entra nella lista di quell'account.
 */
export const wishlistUnresolved = pgTable(
  'wishlist_unresolved',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storeAccountId: uuid('store_account_id')
      .notNull()
      .references(() => storeAccounts.id, { onDelete: 'cascade' }),
    // Denormalizzato come in `unresolved_imports`: ci si filtra senza JOIN, e
    // compone il link alla pagina del negozio.
    store: store('store').notNull(),
    // L'id come lo dà il negozio. Su Steam e GOG, risolta la voce, è ciò che
    // finisce in `external_ids`; su PSN è un id di prodotto del negozio che **non**
    // è il `titleId` della libreria, e non ci finisce.
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    imageUrl: text('image_url'),
    // Come in `unresolved_imports.store_page`: un pezzo di indirizzo, che
    // `storePageUrl` completa. Nulla dove il negozio non lo dà.
    storePage: text('store_page'),
    // Quando la voce è entrata nella wishlist, dove il negozio lo dice (Steam).
    // Diventa `wishlist_items.added_at` quando la voce si risolve.
    addedAt: timestamp('added_at'),
    // Nascosta dall'utente: non compare più fra quelle da sistemare. Una data e
    // non un booleano, come per gli scarti; l'upsert di un nuovo import la lascia
    // com'è. Niente tipo né «nascosta per tutti»: in questo lotto basta mettere da
    // parte ciò che non è un gioco.
    hiddenAt: timestamp('hidden_at'),
    ...timestamps,
  },
  (table) => [
    unique('wishlist_unresolved_account_external_key').on(
      table.storeAccountId,
      table.externalId,
    ),
    index('wishlist_unresolved_user_id_idx').on(table.userId),
  ],
);
