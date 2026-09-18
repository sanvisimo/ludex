import {
  AUTO_SYNC_EVERY_DAYS,
  linkableStoreValues,
} from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, isNull, lt, or, sql } from '@repo/db/orm';

import { enqueueImport } from '../queue/imports';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gli account che la spazzata deve reimportare adesso.
 *
 * Servono tutte e quattro le condizioni:
 *
 * - **collegamento vivo**: `ok`, cioè né `needs_reauth` — riprovare non lo
 *   sblocca, va ricollegato a mano — né `unlinked`;
 * - **l'interruttore dell'account** acceso;
 * - **quello generale** acceso, e una riga di `user_settings` che non c'è vale
 *   acceso: è il default, e la tabella non ha una riga per ogni utente;
 * - **l'ultimo import più vecchio della soglia** del suo negozio, o mai fatto.
 *
 * Le soglie diventano un confronto per negozio con una data calcolata qui,
 * invece di un intervallo calcolato in SQL: `last_sync_at` è un `timestamp`
 * senza fuso, e confrontarlo con `now()` del database vorrebbe dire fidarsi
 * che il fuso del server Postgres sia lo stesso con cui Drizzle scrive.
 */
export function findAccountsDueForImport(now = new Date()) {
  const account = schema.storeAccounts;

  const stale = linkableStoreValues.map((store) =>
    and(
      eq(account.store, store),
      lt(
        account.lastSyncAt,
        new Date(now.getTime() - AUTO_SYNC_EVERY_DAYS[store] * DAY_MS),
      ),
    ),
  );

  return db
    .select({ id: account.id, store: account.store })
    .from(account)
    .leftJoin(
      schema.userSettings,
      eq(schema.userSettings.userId, account.userId),
    )
    .where(
      and(
        eq(account.status, 'ok'),
        eq(account.autoSync, true),
        sql`coalesce(${schema.userSettings.autoSyncLibrary}, true)`,
        or(isNull(account.lastSyncAt), ...stale),
      ),
    );
}

/**
 * La spazzata degli import: accoda quello che è dovuto, e basta.
 *
 * Come la spazzata dell'enrichment non importa niente da sé — ogni account resta
 * un job suo, con i suoi tentativi. Un account che ha già un import in coda non
 * si accoda due volte: ci pensa la deduplicazione per account di
 * `enqueueImport`, la stessa che protegge dal doppio clic.
 *
 * Il rinnovo del credenziale resta dentro l'import e quindi dentro il worker,
 * uno alla volta per account: è per questo che qui non serve il lock sulla riga
 * che servirebbe a un rinnovo fatto da fuori (vedi CLAUDE.md, «Accorgersi prima
 * che un collegamento è morto»).
 */
export async function enqueueDueImports(now = new Date()) {
  const due = await findAccountsDueForImport(now);
  for (const row of due) {
    await enqueueImport(row.store, { storeAccountId: row.id });
  }
  return due.length;
}
