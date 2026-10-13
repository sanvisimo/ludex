import {
  AUTO_SYNC_EVERY_DAYS,
  oneShotStoreValues,
  wishlistStoreValues,
} from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, isNull, lt, notInArray, or, sql } from '@repo/db/orm';

import { enqueueImport, enqueueWishlistImport } from '../queue/imports';

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
 * E un negozio che si aggiorni: EA si importa una volta sola, ogni volta che
 * l'utente incolla un token nuovo (`oneShotStoreValues`). Va escluso a parte,
 * perché un import EA fallito lascia `last_sync_at` nullo, e il «mai fatto» lo
 * riprenderebbe a ogni giro.
 *
 * Le soglie diventano un confronto per negozio con una data calcolata qui,
 * invece di un intervallo calcolato in SQL: `last_sync_at` è un `timestamp`
 * senza fuso, e confrontarlo con `now()` del database vorrebbe dire fidarsi
 * che il fuso del server Postgres sia lo stesso con cui Drizzle scrive.
 */
export function findAccountsDueForImport(now = new Date()) {
  const account = schema.storeAccounts;

  const stores = Object.keys(
    AUTO_SYNC_EVERY_DAYS,
  ) as (keyof typeof AUTO_SYNC_EVERY_DAYS)[];
  const stale = stores.map((store) =>
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
        notInArray(account.store, [...oneShotStoreValues]),
        or(isNull(account.lastSyncAt), ...stale),
      ),
    );
}

/**
 * Gli account di cui la spazzata deve aggiornare la **wishlist** adesso (15e).
 *
 * Vale per la wishlist ciò che vale per la libreria — collegamento vivo,
 * l'interruttore dell'account e quello generale, la soglia del negozio — con tre
 * differenze:
 *
 * - **la lista deve esistere**. L'import della wishlist è a richiesta: la crea
 *   l'utente la prima volta, e l'aggiornamento automatico rinfresca soltanto ciò
 *   che c'è. Una lista cancellata non si ricrea da sola, e un account che non l'ha
 *   mai chiesta non ne riceve una;
 * - **la soglia è `wishlist_synced_at`**, non `last_sync_at`: la wishlist e la
 *   libreria si aggiornano per conto loro;
 * - **un errore che aspetta l'utente non si riprova**. `not_visible` (i dettagli
 *   dei giochi di Steam sono privati) e `reauth` falliscono uguale a ogni giro
 *   finché non interviene lui; `failed` è una rete che cade, e si riprova.
 */
export function findAccountsDueForWishlist(now = new Date()) {
  const account = schema.storeAccounts;

  const stale = wishlistStoreValues.map((store) =>
    and(
      eq(account.store, store),
      lt(
        account.wishlistSyncedAt,
        new Date(now.getTime() - AUTO_SYNC_EVERY_DAYS[store] * DAY_MS),
      ),
    ),
  );

  return db
    .select({ id: account.id, store: account.store })
    .from(account)
    .innerJoin(
      schema.playlists,
      eq(schema.playlists.storeAccountId, account.id),
    )
    .leftJoin(
      schema.userSettings,
      eq(schema.userSettings.userId, account.userId),
    )
    .where(
      and(
        eq(account.status, 'ok'),
        eq(account.autoSync, true),
        sql`coalesce(${schema.userSettings.autoSyncLibrary}, true)`,
        or(isNull(account.wishlistError), eq(account.wishlistError, 'failed')),
        // Una lista nata prima che esistesse la data non ne ha una: è dovuta.
        or(isNull(account.wishlistSyncedAt), ...stale),
      ),
    );
}

/** Come `enqueueDueImports`, per le wishlist: un job per account dovuto. */
export async function enqueueDueWishlistImports(now = new Date()) {
  const due = await findAccountsDueForWishlist(now);
  for (const row of due) {
    await enqueueWishlistImport(row.store, { storeAccountId: row.id });
  }
  return due.length;
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
