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
import { timestamps } from './timestamps';

export const playlistKind = pgEnum('playlist_kind', playlistKindValues);

/**
 * Una playlist: una `BacklogQuery` salvata con un nome, per utente (step 15a).
 * O, col tipo `wishlist` (step 15b), una lista di giochi scelti a mano, che sta
 * in `wishlist_items` e non ha una query.
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
    // `filter` (il default, le playlist di prima) o `wishlist`. Le funzioni di
    // ogni tipo lavorano sul proprio e solo sul proprio.
    kind: playlistKind('kind').notNull().default('filter'),
    // La query c'è se e solo se il tipo è `filter`: lo dice il vincolo qui sotto.
    query: jsonb('query').$type<PlaylistQuery>(),
    // L'ordine in cui l'utente le vede, da 0. Non è unico: spostare una
    // playlist riscrive le posizioni di tutte, e una cancellata lascia un buco
    // che il prossimo spostamento richiude. A parità decide il nome.
    // Il default serve solo alla migration; chi inserisce lo scrive sempre.
    position: integer('position').notNull().default(0),
    // Il link pubblico (step 15d): 16 byte casuali in base64url, nullo se la
    // playlist non è condivisa. Chi ha il link la vede, senza account; revocarlo
    // lo rimette a nullo e il link smette di funzionare, e ricondividere ne dà
    // uno nuovo. Unico, e non indovinabile: è l'unica cosa che protegge la pagina.
    shareToken: text('share_token').unique(),
    ...timestamps,
  },
  (table) => [
    // Su `lower(name)` come `user_tags`: «Brevi» e «brevi» sono la stessa
    // playlist, e due righe che sembrano uguali sono solo confusione. **Dentro il
    // tipo**: una playlist e una lista che si chiamano uguale non si contendono il
    // nome.
    uniqueIndex('playlists_user_kind_name_idx').on(
      table.userId,
      table.kind,
      sql`lower(${table.name})`,
    ),
    check(
      'playlists_kind_query_check',
      sql`(${table.kind} = 'filter') = (${table.query} is not null)`,
    ),
    index('playlists_user_id_idx').on(table.userId),
  ],
);
