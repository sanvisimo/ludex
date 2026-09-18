import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { timestamps } from './timestamps';

/**
 * Le preferenze dell'utente: una riga per utente, **e nessuna riga vuol dire
 * i default**.
 *
 * Non sono colonne su `user` per la stessa ragione di `store_accounts`:
 * `auth.ts` è generato e viene riscritto intero. E non sono `additionalFields`
 * di Better Auth, che le porterebbero nello schema generato e dentro ogni
 * sessione, dove una preferenza di import non ha niente da fare.
 *
 * Che l'assenza della riga valga i default è la scelta che conta: gli utenti
 * che c'erano prima di questa tabella non hanno bisogno di una migrazione dei
 * dati, e la registrazione non ha bisogno di un hook che la crei. Chi legge
 * deve quindi sempre ripiegare sul default — in SQL con `coalesce`, in
 * `getUserSettings` a mano — e i default stanno scritti **qui**, sulle colonne,
 * e da nessun'altra parte.
 */
export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // «Aggiorna automaticamente la libreria»: l'interruttore generale sugli
  // import periodici di tutti gli account. Spento, non si aggiorna nulla da sé;
  // acceso, si aggiornano gli account che hanno acceso anche il loro
  // (`store_accounts.auto_sync`).
  //
  // Acceso di default perché su PSN non è una comodità: il refresh token dura
  // dieci giorni che ripartono a ogni rinnovo, e senza un import che rinnovi
  // l'account muore da solo.
  autoSyncLibrary: boolean('auto_sync_library').notNull().default(true),
  ...timestamps,
});
