import { storeAccountName } from '@repo/contracts';
import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, notInArray, sql } from '@repo/db/orm';

import {
  fetchGogProduct,
  fetchGogWishlist,
  GogAuthError,
} from '../external/gog';
import { findIgdbGamesByExternalIds } from '../external/igdb';
import { fetchPsnWishlist, PsnAuthError } from '../external/psn';
import {
  fetchSteamAppDetails,
  fetchSteamWishlist,
  SteamUnauthorizedError,
  SteamWishlistNotVisibleError,
} from '../external/steam';
import { chunk } from '../lib/chunk';
import { enqueueEnrichment, enqueuePostImport } from '../queue/enrichment';
import {
  type ExternalGameLink,
  findGameIdsByExternalIds,
  linkExternalGames,
} from './games';
import { resolveByName } from './library-import';
import { wishlistKey } from './wishlist-key';
import {
  requireReauth,
  type StoreAccountRow,
  steamAccessToken,
  storeAccessToken,
} from './store-accounts';

/**
 * La wishlist di un negozio, allineata alla lista di Ludex (step 15e).
 *
 * **Su richiesta**, non in automatico: la lista nasce la prima volta che
 * l'utente la importa e si aggiorna quando lo richiede di nuovo. Non tocca
 * `store_accounts.last_sync_at`, che è della libreria e decide l'aggiornamento
 * automatico di quella.
 *
 * Come per `importLibrary`, ciò che varia da negozio a negozio sta **prima** —
 * credenziale e client — e arriva già ridotto a `WishlistEntry[]`; da lì in giù
 * `syncStoreWishlist` è uguale per tutti, con una sola differenza di sostanza:
 * Steam e GOG si identificano **per id** (e per nome solo ciò che l'id non prende,
 * come la libreria); PSN per il **`titleId`** che l'id di prodotto contiene (vedi
 * `wishlistKey`) e poi per nome, e IGDB non si interroga per id perché non
 * conosce il `titleId`.
 *
 * La lista **rispecchia il negozio**: ciò che il negozio non ha più esce, e un gioco
 * che hai già nel backlog resta (regola e ragioni nel piano, `plans/15e`). Una
 * voce che non si riconosce non va in `unresolved_imports` — la cui potatura la
 * cancellerebbe al primo import di libreria — ma in `wishlist_unresolved`.
 */
export type WishlistEntry = {
  externalId: string;
  /** Il nome da mostrare: quello del negozio, o un ripiego se non lo dà. */
  name: string;
  /**
   * `name` è davvero un titolo, e quindi si può cercare su IGDB. Falso per Steam e
   * GOG finché `lookupNames` non lo ha chiesto, e dopo se non ha risposto.
   */
  nameKnown: boolean;
  /**
   * Il negozio dice che non è un gioco ma altro (DLC, demo, contenuto aggiuntivo):
   * non si cerca per nome, perché il match più vicino sarebbe il gioco base e
   * scriverebbe un id sbagliato in una tabella condivisa.
   */
  isAddon: boolean;
  addedAt: Date | null;
  imageUrl: string | null;
  /** Un pezzo di indirizzo, come `unresolved_imports.store_page`. */
  storePage: string | null;
};

export type WishlistReport = {
  /** Voci nella wishlist del negozio. */
  total: number;
  /** Giochi ora in lista (due id possono dare lo stesso gioco). */
  inList: number;
  /** Voci che non si sono legate a nessun gioco. */
  unresolved: number;
  /** Quante delle risolte sono venute dalla ricerca per nome. */
  resolvedByName: number;
  /** Righe `games` create: le uniche per cui si accoda l'enrichment. */
  newGames: number;
  listId: string;
};

/** Come il negozio si chiama nel nome della lista, che nasce una volta e poi è dell'utente. */
const STORE_LABEL: Partial<Record<Store, string>> = {
  steam: 'Steam',
  gog: 'GOG',
  psn: 'PlayStation',
};

/** Il nome con cui nasce la lista: negozio e account. */
export const wishlistName = (account: StoreAccountRow) =>
  `${STORE_LABEL[account.store] ?? account.store} · ${storeAccountName(account)}`;

/** IGDB conosce gli id di questo negozio, e i nomi li chiede il negozio? Steam e GOG. */
const igdbKnowsIds = (store: Store) => store !== 'psn';

// --- i nomi, per ciò che l'id non risolve ---

/** Che cosa si sa di una voce dopo averne chiesto il nome al negozio. */
export type LookedUpName = {
  name: string;
  isAddon: boolean;
  storePage?: string | null;
  imageUrl?: string | null;
};

export type NameLookup = (
  store: Store,
  entries: WishlistEntry[],
) => Promise<Map<string, LookedUpName>>;

/**
 * Quante voci al massimo si chiedono per aggiornamento, e quanto si aspetta fra
 * una richiesta e l'altra. Il limite di Steam sullo store (circa 200 ogni cinque
 * minuti, dichiarato: il nostro ritmo regge, la soglia non è stata raggiunta, vedi
 * `docs/negozi.md`) è la ragione del primo e del secondo: le voci oltre il
 * tetto restano col ripiego, e le riprende il prossimo aggiornamento, se
 * qualcuna si risolve nel frattempo.
 */
export const NAME_LOOKUP_CAP = 40;
const NAME_LOOKUP_GAP_MS: Partial<Record<Store, number>> = {
  steam: 1500,
  gog: 300,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chiede ai negozi il nome delle voci che IGDB non ha riconosciuto: Steam
 * `appdetails`, GOG `products`, **pubblici**, uno per voce. Si ferma alla prima
 * risposta che non è «l'app non c'è» (un 429, un 5xx): continuare vorrebbe dire
 * insistere su chi ha già detto basta, e le voci restano col ripiego.
 */
export const lookupNames: NameLookup = async (store, entries) => {
  const found = new Map<string, LookedUpName>();
  const gap = NAME_LOOKUP_GAP_MS[store] ?? 0;

  for (const [index, entry] of entries.slice(0, NAME_LOOKUP_CAP).entries()) {
    if (index > 0 && gap > 0) await sleep(gap);
    try {
      if (store === 'steam') {
        const details = await fetchSteamAppDetails(entry.externalId);
        if (details)
          found.set(entry.externalId, {
            name: details.name,
            isAddon: details.type !== null && details.type !== 'game',
          });
      } else if (store === 'gog') {
        const product = await fetchGogProduct(entry.externalId);
        if (product)
          found.set(entry.externalId, {
            name: product.title,
            isAddon: product.gameType !== null && product.gameType !== 'game',
            storePage: product.slug ? `/game/${product.slug}` : null,
            imageUrl: product.imageUrl,
          });
      }
    } catch (error) {
      console.warn(
        `[wishlist] ${store}: nome non letto, mi fermo dopo ${found.size} su ${entries.length}:`,
        error instanceof Error ? error.message : error,
      );
      break;
    }
  }

  return found;
};

/**
 * Lega le voci ai giochi, scrivendo in `external_ids` la **chiave** della voce e
 * non il suo id (vedi `wishlistKey`), e rende la mappa per id della voce.
 *
 * Una voce senza chiave — un id PSN in cui non c'è un titleId — si lega lo stesso
 * ma non si scrive: la tabella è condivisa fra tutti gli utenti e non si sporca con
 * ciò che non si sa chiamare.
 */
async function linkWithKeys(store: Store, links: ExternalGameLink[]) {
  const keyed = links.flatMap((link) => {
    const key = wishlistKey(store, link.externalId);
    return key ? [{ link, key }] : [];
  });
  const keyless = links.filter(
    (link) => wishlistKey(store, link.externalId) === null,
  );

  const linked = await linkExternalGames(
    store,
    keyed.map(({ link, key }) => ({ ...link, externalId: key })),
  );
  const unkeyed = await linkExternalGames(store, keyless, {
    persistIds: false,
  });

  const byExternalId = new Map<string, string>();
  for (const { link, key } of keyed) {
    const gameId = linked.byExternalId.get(key);
    if (gameId) byExternalId.set(link.externalId, gameId);
  }
  for (const [externalId, gameId] of unkeyed.byExternalId)
    byExternalId.set(externalId, gameId);

  return {
    byExternalId,
    createdGameIds: [...linked.createdGameIds, ...unkeyed.createdGameIds],
  };
}

// --- la lista ---

/** La lista di questo account, se c'è già; altrimenti la crea, in fondo alle sue pari. */
async function ensureList(
  tx: Pick<typeof db, 'select' | 'insert'>,
  account: StoreAccountRow,
) {
  const find = async () =>
    (
      await tx
        .select({ id: schema.playlists.id })
        .from(schema.playlists)
        .where(eq(schema.playlists.storeAccountId, account.id))
    )[0]?.id;

  const existing = await find();
  if (existing) return existing;

  const [created] = await tx
    .insert(schema.playlists)
    .values({
      userId: account.userId,
      kind: 'store_wishlist',
      name: wishlistName(account),
      query: null,
      storeAccountId: account.id,
      // In fondo fra le liste di negozio, letta nella stessa INSERT.
      position: sql`(select coalesce(max(${schema.playlists.position}), -1) + 1 from ${schema.playlists} where ${schema.playlists.userId} = ${account.userId} and ${schema.playlists.kind} = 'store_wishlist')`,
    })
    // Due aggiornamenti insieme: uno dei due trova la lista dell'altro.
    .onConflictDoNothing()
    .returning({ id: schema.playlists.id });
  return created?.id ?? (await find())!;
}

/**
 * Allinea la lista di un account a ciò che il suo negozio dice, e riscrive i
 * non riconosciuti. Non parla col negozio per la wishlist: le voci arrivano già
 * lette (tranne i nomi, che chiede `lookupNames`, sostituibile nei test).
 */
export async function syncStoreWishlist(
  account: StoreAccountRow,
  entries: WishlistEntry[],
  { lookup = lookupNames }: { lookup?: NameLookup } = {},
): Promise<WishlistReport> {
  const { id: storeAccountId, userId, store } = account;
  const byId = igdbKnowsIds(store);

  // 1. Quello che Ludex conosce già (per la chiave di `external_ids`, che su PSN
  // è il titleId), e 2. il resto su IGDB per id.
  const keyOf = (entry: { externalId: string }) =>
    wishlistKey(store, entry.externalId);
  const knownByKey = await findGameIdsByExternalIds(
    store,
    entries.flatMap((entry) => keyOf(entry) ?? []),
  );
  const known = new Map(
    entries.flatMap((entry): [string, string][] => {
      const key = keyOf(entry);
      const gameId = key ? knownByKey.get(key) : undefined;
      return gameId ? [[entry.externalId, gameId]] : [];
    }),
  );
  const missing = entries.filter((entry) => !known.has(entry.externalId));
  const matches = byId
    ? await findIgdbGamesByExternalIds(
        store,
        missing.map((entry) => entry.externalId),
      )
    : new Map();
  const idLinks: ExternalGameLink[] = missing.flatMap((entry) => {
    const match = matches.get(entry.externalId);
    return match ? [{ externalId: entry.externalId, ...match }] : [];
  });

  // 3. I nomi di ciò che resta, se il negozio non li dà.
  let toName = missing.filter((entry) => !matches.has(entry.externalId));
  if (byId && toName.some((entry) => !entry.nameKnown)) {
    const names = await lookup(
      store,
      toName.filter((entry) => !entry.nameKnown),
    );
    toName = toName.map((entry) => {
      const found = names.get(entry.externalId);
      return found
        ? {
            ...entry,
            name: found.name,
            nameKnown: true,
            isAddon: found.isAddon,
            storePage: found.storePage ?? entry.storePage,
            imageUrl: found.imageUrl ?? entry.imageUrl,
          }
        : entry;
    });
  }
  const refined = new Map(toName.map((entry) => [entry.externalId, entry]));
  const current = entries.map(
    (entry) => refined.get(entry.externalId) ?? entry,
  );

  // 4. Per nome, ciò che ha un titolo vero e non è un contenuto aggiuntivo.
  const nameLinks = await resolveByName(
    toName
      .filter((entry) => entry.nameKnown && !entry.isAddon)
      .map((entry) => ({ externalId: entry.externalId, name: entry.name })),
  );

  const { byExternalId, createdGameIds } = await linkWithKeys(store, [
    ...idLinks,
    ...nameLinks,
  ]);

  const gameIdByExternalId = new Map([...known, ...byExternalId]);
  const resolved = current.filter((entry) =>
    gameIdByExternalId.has(entry.externalId),
  );
  const unresolved = current.filter(
    (entry) => !gameIdByExternalId.has(entry.externalId),
  );

  // I giochi desiderati, uno per gioco; se due voci puntano allo stesso vale la
  // data più vecchia.
  const addedAtByGame = new Map<string, Date | null>();
  for (const entry of resolved) {
    const gameId = gameIdByExternalId.get(entry.externalId)!;
    const previous = addedAtByGame.get(gameId);
    addedAtByGame.set(
      gameId,
      previous === undefined || previous === null
        ? entry.addedAt
        : entry.addedAt && entry.addedAt < previous
          ? entry.addedAt
          : previous,
    );
  }

  // 5. Le scritture, insieme: una lista a metà non deve vedersi.
  const listId = await db.transaction(async (tx) => {
    const id = await ensureList(tx, account);

    for (const page of chunk([...addedAtByGame], 500)) {
      await tx
        .insert(schema.wishlistItems)
        .values(
          page.map(([gameId, addedAt]) => ({
            listId: id,
            gameId,
            // Solo se il negozio la dà (Steam); altrimenti il momento in cui si è
            // visto per la prima volta, che è il default della colonna.
            ...(addedAt ? { addedAt } : {}),
          })),
        )
        // Mai riscrivere la data di una voce che c'era già.
        .onConflictDoNothing();
    }
    await tx
      .delete(schema.wishlistItems)
      .where(
        and(
          eq(schema.wishlistItems.listId, id),
          addedAtByGame.size > 0
            ? notInArray(schema.wishlistItems.gameId, [...addedAtByGame.keys()])
            : undefined,
        ),
      );
    await tx
      .update(schema.playlists)
      .set({ updatedAt: new Date() })
      .where(eq(schema.playlists.id, id));

    for (const page of chunk(unresolved, 500)) {
      await tx
        .insert(schema.wishlistUnresolved)
        .values(
          page.map((entry) => ({
            userId,
            storeAccountId,
            store,
            externalId: entry.externalId,
            name: entry.name,
            imageUrl: entry.imageUrl,
            storePage: entry.storePage,
            addedAt: entry.addedAt,
          })),
        )
        // Un nuovo aggiornamento riscrive ciò che viene dal negozio e **non**
        // `hidden_at`, che è una scelta dell'utente.
        .onConflictDoUpdate({
          target: [
            schema.wishlistUnresolved.storeAccountId,
            schema.wishlistUnresolved.externalId,
          ],
          set: {
            name: sql`excluded.name`,
            imageUrl: sql`excluded.image_url`,
            storePage: sql`excluded.store_page`,
            addedAt: sql`excluded.added_at`,
            updatedAt: new Date(),
          },
        });
    }
    // Via quelle che il negozio non ha più e quelle che ora si riconoscono.
    await tx.delete(schema.wishlistUnresolved).where(
      and(
        eq(schema.wishlistUnresolved.storeAccountId, storeAccountId),
        unresolved.length > 0
          ? notInArray(
              schema.wishlistUnresolved.externalId,
              unresolved.map((entry) => entry.externalId),
            )
          : undefined,
      ),
    );

    return id;
  });

  // Solo i giochi nati adesso, come per la libreria.
  for (const gameId of createdGameIds) await enqueueEnrichment('igdb', gameId);
  if (createdGameIds.length > 0) await enqueuePostImport();

  return {
    total: entries.length,
    inList: addedAtByGame.size,
    unresolved: unresolved.length,
    resolvedByName: nameLinks.length,
    newGames: createdGameIds.length,
    listId,
  };
}

// --- cosa chiedere a ciascun negozio ---

/** Steam, col token se l'account ha il login e la chiave altrimenti. */
async function readSteamWishlist(account: StoreAccountRow) {
  const steamId = account.externalAccountId;
  let token: string | null = null;
  let renewable = false;
  if (account.credentials) {
    ({ accessToken: token, renewable } = await steamAccessToken(account));
  }

  let items;
  try {
    items = await fetchSteamWishlist(steamId, token ?? undefined);
  } catch (error) {
    if (!(error instanceof SteamUnauthorizedError)) throw error;
    // Come per la libreria: col QR è un login morto, col token web è solo un
    // token che non vale più, e si ripiega sulla chiave.
    if (renewable) return requireReauth(account);
    token = null;
    items = await fetchSteamWishlist(steamId);
  }

  // Senza il token un elenco vuoto non dice se la wishlist è vuota o non visibile:
  // non si tocca la lista.
  if (items.length === 0 && token === null) {
    throw new SteamWishlistNotVisibleError(steamId);
  }

  return items.map(
    (item): WishlistEntry => ({
      externalId: item.externalId,
      name: item.name,
      nameKnown: false,
      isAddon: false,
      addedAt: item.addedAt,
      imageUrl: null,
      // La copertina la compone la UI dall'appid; il link è la pagina dello store.
      storePage: `app/${item.externalId}`,
    }),
  );
}

async function readGogWishlist(account: StoreAccountRow) {
  const accessToken = await storeAccessToken(account);
  try {
    return (await fetchGogWishlist(accessToken)).map(
      (item): WishlistEntry => ({
        externalId: item.externalId,
        name: item.name,
        nameKnown: false,
        isAddon: false,
        addedAt: null,
        imageUrl: null,
        storePage: null,
      }),
    );
  } catch (error) {
    if (error instanceof GogAuthError) return requireReauth(account);
    throw error;
  }
}

async function readPsnWishlist(account: StoreAccountRow) {
  const accessToken = await storeAccessToken(account);
  try {
    return (await fetchPsnWishlist(accessToken)).map(
      (item): WishlistEntry => ({
        externalId: item.externalId,
        name: item.name,
        nameKnown: true,
        isAddon: false,
        addedAt: null,
        imageUrl: item.imageUrl,
        storePage: null,
      }),
    );
  } catch (error) {
    if (error instanceof PsnAuthError) return requireReauth(account);
    throw error;
  }
}

/**
 * Importa la wishlist di un account: legge il negozio e allinea la lista. È ciò che
 * il job esegue (3e).
 */
export async function importStoreWishlist(
  account: StoreAccountRow,
): Promise<WishlistReport> {
  const entries =
    account.store === 'steam'
      ? await readSteamWishlist(account)
      : account.store === 'gog'
        ? await readGogWishlist(account)
        : account.store === 'psn'
          ? await readPsnWishlist(account)
          : null;
  if (entries === null) {
    throw new Error(`Nessuna wishlist per il negozio ${account.store}`);
  }
  return syncStoreWishlist(account, entries);
}
