import type { PlaylistQuery } from '@repo/contracts';
import { playlistKindValues } from '@repo/contracts/vocabulary';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { storeAccounts } from './imports';
import { timestamps } from './timestamps';

export const playlistKind = pgEnum('playlist_kind', playlistKindValues);

/**
 * Una playlist: una `BacklogQuery` salvata con un nome, per utente (step 15a).
 * O, col tipo `wishlist` (step 15b), una lista di giochi scelti a mano, che sta
 * in `wishlist_items` e non ha una query. O, col tipo `store_wishlist` (step
 * 15e), la wishlist di un account di un negozio: una lista di sola lettura che
 * l'import allinea al negozio, e che sparisce con l'account. O, col tipo
 * `curated` (step 15f), una playlist aperta: giochi scelti a mano, in
 * `wishlist_items` con la loro posizione, che possono stare anche nel backlog.
 *
 * **Non contiene i giochi.** È una domanda, non una risposta: la query gira a
 * ogni apertura, quindi un gioco che cambia stato o durata entra e esce da solo.
 *
 * `query` è una colonna come le altre, **senza versione**. Un campo nuovo è
 * opzionale e non rompe niente; rinominare o togliere un campo, o cambiare un
 * valore di un enum, vuole una migration che riscrive le righe. Altrimenti Zod
 * scarta il campo in silenzio e la playlist mostrerebbe più giochi del
 * previsto.
 *
 * I tag stanno nella query **per id**. Un tag cancellato si ignora quando la
 * playlist gira, e il servizio dice quanti ne mancano.
 */
export const playlists = pgTable(
  'playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // text e non uuid: gli id di Better Auth sono stringhe.
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // `filter` (il default, le playlist di prima), `wishlist`, `store_wishlist`
    // o `curated`.
    // Le funzioni di ogni tipo lavorano sul proprio e solo sul proprio.
    kind: playlistKind('kind').notNull().default('filter'),
    // La query c'è se e solo se il tipo è `filter`: lo dice il vincolo qui sotto.
    query: jsonb('query').$type<PlaylistQuery>(),
    // L'ordine in cui l'utente le vede, da 0. Non è unico: spostare una
    // playlist riscrive le posizioni di tutte, e una cancellata lascia un buco
    // che il prossimo spostamento richiude. A parità decide il nome.
    // Il default serve solo alla migration; chi inserisce lo scrive sempre.
    position: integer('position').notNull().default(0),
    // Il link pubblico (step 15d, e per le playlist aperte 15f): 16 byte casuali in base64url, nullo se la
    // playlist non è condivisa. Chi ha il link la vede, senza account; revocarlo
    // lo rimette a nullo e il link smette di funzionare, e ricondividere ne dà
    // uno nuovo. Unico, e non indovinabile: è l'unica cosa che protegge la pagina.
    shareToken: text('share_token').unique(),
    // Da quale account di un negozio viene la lista: c'è se e solo se il tipo è
    // `store_wishlist`, lo dice il vincolo qui sotto. `cascade`: scollegando
    // l'account la sua lista se ne va, perché non c'è più niente da allineare.
    storeAccountId: uuid('store_account_id').references(
      () => storeAccounts.id,
      { onDelete: 'cascade' },
    ),
    ...timestamps,
  },
  (table) => [
    // Su `lower(name)` come `user_tags`: «Brevi» e «brevi» sono la stessa
    // playlist, e due righe che sembrano uguali sono solo confusione. **Dentro il
    // tipo**: una playlist e una lista che si chiamano uguale non si contendono il
    // nome. **Non per `store_wishlist`**: il nome di quelle lo compone il
    // sistema dall'account, e due account che si chiamano uguale (due Amazon
    // dello stesso utente è un caso visto) non devono far fallire un import.
    //
    // Il predicato è `store_account_id is null` e non `kind <> 'store_wishlist'`
    // (che sarebbe lo stesso): un valore d'enum appena aggiunto non si può usare
    // come letterale nella migration che arriva insieme a lui, su un database dove
    // il tipo esiste già (`55P04`). Vale lo stesso per il vincolo qui sotto, che
    // confronta il tipo come testo.
    uniqueIndex('playlists_user_kind_name_idx')
      .on(table.userId, table.kind, sql`lower(${table.name})`)
      .where(sql`${table.storeAccountId} is null`),
    // Una lista per account.
    uniqueIndex('playlists_store_account_idx').on(table.storeAccountId),
    check(
      'playlists_kind_query_check',
      sql`(${table.kind} = 'filter') = (${table.query} is not null)`,
    ),
    check(
      'playlists_kind_store_account_check',
      sql`(${table.kind}::text = 'store_wishlist') = (${table.storeAccountId} is not null)`,
    ),
    index('playlists_user_id_idx').on(table.userId),
  ],
);
