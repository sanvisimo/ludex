import {
  AUTO_SYNC_EVERY_DAYS,
  oneShotStoreValues,
  wishlistStoreValues,
} from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import {
  and,
  eq,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from '@repo/db/orm';

import { claimOnce } from '../lib/redis';
import { enqueueImport, enqueueWishlistImport } from '../queue/imports';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gli account che si possono reimportare in automatico, con una soglia data.
 *
 * Servono tutte e quattro le condizioni:
 *
 * - **collegamento vivo**: `ok`, cioè né `needs_reauth` — riprovare non lo
 *   sblocca, va ricollegato a mano — né `unlinked`;
 * - **l'interruttore dell'account** acceso;
 * - **quello generale** acceso, e una riga di `user_settings` che non c'è vale
 *   acceso: è il default, e la tabella non ha una riga per ogni utente;
 * - **l'ultimo import più vecchio della soglia** (`stale`), o mai fatto.
 *
 * E un negozio che si aggiorni: EA si importa una volta sola, ogni volta che
 * l'utente incolla un token nuovo (`oneShotStoreValues`). Va escluso a parte,
 * perché un import EA fallito lascia `last_sync_at` nullo, e il «mai fatto» lo
 * riprenderebbe a ogni giro.
 *
 * Le soglie sono confronti con una data calcolata in JavaScript, invece di un
 * intervallo calcolato in SQL: `last_sync_at` è un `timestamp` senza fuso, e
 * confrontarlo con `now()` del database vorrebbe dire fidarsi che il fuso del
 * server Postgres sia lo stesso con cui Drizzle scrive.
 *
 * Due chi la usano: la spazzata, con la soglia di ogni negozio, e l'apertura
 * dell'app, per un utente solo e con un'ora.
 */
function selectAccountsDue(stale: SQL | undefined, userId?: string) {
  const account = schema.storeAccounts;

  return db
    .select({ id: account.id, store: account.store })
    .from(account)
    .leftJoin(
      schema.userSettings,
      eq(schema.userSettings.userId, account.userId),
    )
    .where(
      and(
        userId === undefined ? undefined : eq(account.userId, userId),
        eq(account.status, 'ok'),
        eq(account.autoSync, true),
        sql`coalesce(${schema.userSettings.autoSyncLibrary}, true)`,
        notInArray(account.store, [...oneShotStoreValues]),
        // L'import da CSV (10) non ha niente da cui riaggiornarsi.
        eq(account.fromFile, false),
        or(isNull(account.lastSyncAt), stale),
      ),
    );
}

/**
 * Gli account che la spazzata deve reimportare adesso: le regole di
 * `selectAccountsDue`, con la soglia del negozio (`AUTO_SYNC_EVERY_DAYS`).
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

  return selectAccountsDue(or(...stale));
}

/**
 * Dopo quanto un account si reimporta quando l'utente apre l'app.
 *
 * Un'ora: chi compra un gioco la mattina lo trova nel backlog la sera, e un
 * import a libreria invariata costa una chiamata al negozio e un confronto col
 * DB. Vale anche come tetto: l'apertura non accoda più di un giro all'ora per
 * utente (`ON_OPEN_CLAIM_PREFIX`), nemmeno se l'import fallisce e
 * `last_sync_at` resta vecchio.
 */
export const SYNC_ON_OPEN_AFTER_MS = 60 * 60 * 1000;

/** Gli account di un utente da reimportare all'apertura dell'app. */
export function findAccountsDueOnOpen(userId: string, now = new Date()) {
  return selectAccountsDue(
    lt(
      schema.storeAccounts.lastSyncAt,
      new Date(now.getTime() - SYNC_ON_OPEN_AFTER_MS),
    ),
    userId,
  );
}

const ON_OPEN_CLAIM_PREFIX = 'library-sync:on-open:';

/**
 * L'utente ha aperto l'app: si accodano gli import dei suoi account più
 * vecchi di un'ora.
 *
 * La spazzata delle sei ore resta per chi non apre l'app: tiene vivi i
 * collegamenti (PSN muore in dieci giorni senza un rinnovo) e le librerie di
 * chi non c'è. La freschezza, cioè il gioco comprato stamattina nel backlog di
 * stasera, la dà questa.
 *
 * Il web la chiama a ogni apertura e ogni volta che la scheda torna in primo
 * piano, quindi spesso. La soglia su `last_sync_at` non basta a fermarla: un
 * negozio che non risponde lascia la data vecchia, e ogni ritorno sulla scheda
 * riaccoderebbe un import destinato a fallire. Per questo una chiave in Redis,
 * per utente, che dura quanto la soglia: un giro all'ora, su qualunque
 * dispositivo.
 *
 * Un account già in coda non si accoda due volte: ci pensa la deduplicazione
 * per account di `enqueueImport`. Restituisce quanti ne ha accodati.
 */
export async function enqueueImportsOnOpen(userId: string, now = new Date()) {
  const due = await findAccountsDueOnOpen(userId, now);
  if (due.length === 0) return 0;

  const claimed = await claimOnce(
    `${ON_OPEN_CLAIM_PREFIX}${userId}`,
    SYNC_ON_OPEN_AFTER_MS / 1000,
  );
  if (!claimed) return 0;

  for (const row of due) {
    await enqueueImport(row.store, { storeAccountId: row.id });
  }
  return due.length;
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
