import type { PlaylistQuery } from '@repo/contracts';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { timestamps } from './timestamps';

/**
 * Una playlist: una `BacklogQuery` salvata con un nome, per utente (step 15a).
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
    query: jsonb('query').$type<PlaylistQuery>().notNull(),
    // L'ordine in cui l'utente le vede, da 0. Non è unico: spostare una
    // playlist riscrive le posizioni di tutte, e una cancellata lascia un buco
    // che il prossimo spostamento richiude. A parità decide il nome.
    // Il default serve solo alla migration; chi inserisce lo scrive sempre.
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    // Su `lower(name)` come `user_tags`: «Brevi» e «brevi» sono la stessa
    // playlist, e due righe che sembrano uguali sono solo confusione.
    uniqueIndex('playlists_user_name_idx').on(
      table.userId,
      sql`lower(${table.name})`,
    ),
    index('playlists_user_id_idx').on(table.userId),
  ],
);
