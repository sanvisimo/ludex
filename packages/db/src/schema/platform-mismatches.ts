import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { games } from './games';
import { platforms } from './platforms';
import { timestamps } from './timestamps';

/**
 * «Va bene così» sulla lista delle copie su una piattaforma dove il gioco non è
 * uscito (9b PSN).
 *
 * La lista è calcolata: una copia su una console che IGDB non dà al gioco è
 * quasi sempre un collegamento sbagliato. Quasi: a volte è IGDB che non ha la
 * piattaforma — _Metal Slug 3_ su PC — e l'admin lo dice una volta per gioco e
 * piattaforma, per tutti i negozi e tutti gli utenti. Si annulla cancellando
 * la riga.
 *
 * In cascade sul gioco: una fusione (11b) cancella il gioco assorbito, e il suo
 * «va bene così» con lui. Se il sopravvissuto ha lo stesso buco, torna in lista
 * e si rimette.
 */
export const platformMismatchDismissals = pgTable(
  'platform_mismatch_dismissals',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    platformSlug: text('platform_slug')
      .notNull()
      .references(() => platforms.slug),
    // `set null`: cancellare l'account dell'admin non riapre niente.
    dismissedBy: text('dismissed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.gameId, table.platformSlug] })],
);
