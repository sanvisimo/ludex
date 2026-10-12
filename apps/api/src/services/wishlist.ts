import type { Wishlist, WishlistGames } from '@repo/contracts';
import { GameSchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, asc, eq, inArray, sql } from '@repo/db/orm';
import type { SQL } from '@repo/db/orm';

import { isUniqueViolation } from '../lib/pg-error';
import { escapeLike } from './backlog-search';
import { gameColumns } from './games';
import { movePlaylist } from './playlists';

/**
 * Le liste a mano (step 15b): giochi che non hai ancora e vuoi tenere d'occhio.
 *
 * Stanno in `playlists` col tipo `wishlist`, e i giochi in `wishlist_items`, che
 * porta solo il gioco e la data. Ogni funzione parte dallo `userId` **e dal
 * tipo**: una lista di un altro, o una playlist a filtro, si comporta come un id
 * inesistente.
 *
 * Un gioco o è in una lista a mano o è nel backlog. Quando entra nel backlog esce
 * dalle liste a mano (`dropFromWishlists`), e la lettura esclude comunque quelli
 * che hai nel backlog, per non mostrare mai un gioco già tuo.
 *
 * **Le liste di negozio** (step 15e, tipo `store_wishlist`) stanno nella stessa
 * tabella e si vedono, si aprono, si rinominano e si spostano come le altre. Tutto
 * il resto no: aggiungere, togliere e cancellare vogliono una lista a mano (`mine`,
 * `isList`) e per una lista di negozio si comportano come per un id inesistente.
 * Una lista di negozio la scrive solo l'import, che la allinea al negozio, e la
 * cancella solo lo scollegamento dell'account. **Rispecchia il negozio**: i giochi
 * che hai già nel backlog restano in lista, e si vedono con l'etichetta del loro
 * stato (la wishlist Steam che ha ancora Hades, regalato su Epic).
 */

const NAME_INDEX = 'playlists_user_kind_name_idx';

/** Il nome della lista che nasce da sola al primo «aggiungi», senza liste. */
export const DEFAULT_LIST_NAME = 'Wishlist';

const isList = eq(schema.playlists.kind, 'wishlist');

/** Le liste a mano e quelle di negozio: ciò che si vede, apre, rinomina e sposta. */
const isAnyList = inArray(schema.playlists.kind, [
  'wishlist',
  'store_wishlist',
]);

/** Le voci che si vedono: quelle di giochi che l'utente non ha nel backlog. */
const notInBacklog = (userId: string) =>
  sql`not exists (select 1 from ${schema.backlog} where ${schema.backlog.userId} = ${userId} and ${schema.backlog.gameId} = ${schema.wishlistItems.gameId})`;

/**
 * Quante voci ha una lista. In una lista a mano sono quelle che non hai nel
 * backlog; **in una lista di negozio sono tutte**: rispecchia il negozio, e un
 * gioco che hai già (regalato su un altro negozio, per dire) resta lì, con
 * l'etichetta del suo stato. `::text` e non il letterale: vedi la nota sull'enum
 * in `playlists.ts`.
 */
const visibleCount = (userId: string) =>
  sql<number>`(select count(*) from ${schema.wishlistItems} where ${schema.wishlistItems.listId} = ${schema.playlists.id} and (${schema.playlists.kind}::text = 'store_wishlist' or ${notInBacklog(userId)}))::int`;

const listColumns = (userId: string) => ({
  id: schema.playlists.id,
  name: schema.playlists.name,
  count: visibleCount(userId),
});

const mine = (userId: string, id: string) =>
  and(eq(schema.playlists.id, id), eq(schema.playlists.userId, userId), isList);

/** Come `mine`, ma anche una lista di negozio. */
const mineAny = (userId: string, id: string) =>
  and(
    eq(schema.playlists.id, id),
    eq(schema.playlists.userId, userId),
    isAnyList,
  );

/**
 * Di quale negozio è la lista, se è di un negozio. La JOIN è sinistra: una lista a
 * mano non ha un account.
 */
const storeColumns = {
  storeAccountId: schema.playlists.storeAccountId,
  store: schema.storeAccounts.store,
};

const withStore = <T extends { storeAccountId: string | null }>(
  row: T & { store: Wishlist['store'] | null },
) => {
  const { store, storeAccountId, ...rest } = row;
  return store && storeAccountId ? { ...rest, store, storeAccountId } : rest;
};

/** Una lista, nel formato dell'elenco. `undefined` se non è tua. */
async function readList(userId: string, id: string) {
  const [row] = await db
    .select({ ...listColumns(userId), ...storeColumns })
    .from(schema.playlists)
    .leftJoin(
      schema.storeAccounts,
      eq(schema.storeAccounts.id, schema.playlists.storeAccountId),
    )
    .where(mineAny(userId, id));
  return row ? withStore(row) : undefined;
}

/**
 * Prima quelle a mano, poi quelle di negozio; dentro ciascun gruppo l'ordine
 * scelto (`move`), e a parità il nome.
 */
export async function listWishlists(userId: string): Promise<Wishlist[]> {
  const rows = await db
    .select({ ...listColumns(userId), ...storeColumns })
    .from(schema.playlists)
    .leftJoin(
      schema.storeAccounts,
      eq(schema.storeAccounts.id, schema.playlists.storeAccountId),
    )
    .where(and(eq(schema.playlists.userId, userId), isAnyList))
    .orderBy(
      // `::text` e non il letterale: vedi la nota sull'enum in `playlists.ts`.
      asc(sql`${schema.playlists.kind}::text = 'store_wishlist'`),
      asc(schema.playlists.position),
      asc(sql`lower(${schema.playlists.name})`),
      asc(schema.playlists.id),
    );
  return rows.map(withStore);
}

/** `null` se hai già una lista con quel nome, maiuscole a parte. */
export async function createWishlist(
  userId: string,
  name: string,
): Promise<Wishlist | null> {
  try {
    const [row] = await db
      .insert(schema.playlists)
      .values({
        userId,
        kind: 'wishlist',
        name,
        query: null,
        // In fondo, fra le liste: letta nella stessa INSERT, che due creazioni
        // insieme non leggano lo stesso numero.
        position: sql`(select coalesce(max(${schema.playlists.position}), -1) + 1 from ${schema.playlists} where ${schema.playlists.userId} = ${userId} and ${schema.playlists.kind} = 'wishlist')`,
      })
      .returning({ id: schema.playlists.id, name: schema.playlists.name });
    return { ...row!, count: 0 };
  } catch (error) {
    if (isUniqueViolation(error, NAME_INDEX)) return null;
    throw error;
  }
}

/**
 * `undefined` se non esiste (o non è tua), `null` se il nome è già preso. Vale
 * anche per una lista di negozio: il suo nome lo scrive l'import **una volta**,
 * alla creazione, e da lì è tuo (il nome di una lista di negozio non è unico).
 */
export async function renameWishlist(
  userId: string,
  id: string,
  name: string,
): Promise<Wishlist | null | undefined> {
  try {
    const [row] = await db
      .update(schema.playlists)
      .set({ name })
      .where(mineAny(userId, id))
      .returning({ id: schema.playlists.id });
    if (!row) return undefined;
    return await readList(userId, id);
  } catch (error) {
    if (isUniqueViolation(error, NAME_INDEX)) return null;
    throw error;
  }
}

/** Toglie la lista e le sue voci (cascade), non i giochi. */
export async function deleteWishlist(userId: string, id: string) {
  const [row] = await db
    .delete(schema.playlists)
    .where(mine(userId, id))
    .returning({ id: schema.playlists.id });
  return row !== undefined;
}

/**
 * Sposta una lista di un posto, **dentro il suo gruppo**: le liste a mano fra loro
 * e quelle di negozio fra loro (restano comunque dopo le prime).
 */
export async function moveWishlist(
  userId: string,
  id: string,
  direction: 'up' | 'down',
) {
  const [list] = await db
    .select({ kind: schema.playlists.kind })
    .from(schema.playlists)
    .where(mineAny(userId, id));
  if (!list || list.kind === 'filter') return false;
  return movePlaylist(userId, id, direction, list.kind);
}

export type AddResult =
  | { ok: true; list: Wishlist }
  | { ok: false; reason: 'game' | 'list' | 'owned' };

/**
 * Mette un gioco in una lista. Senza `listId` va nella prima, e se non ce n'è
 * nessuna ne crea una che si chiama «Wishlist». Ripeterla non fa niente.
 *
 * Un gioco che hai già nel backlog non si aggiunge: il suo posto è il backlog.
 */
export async function addToWishlist(
  userId: string,
  input: { gameId: string; listId?: string },
): Promise<AddResult> {
  const [game] = await db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(eq(schema.games.id, input.gameId));
  if (!game) return { ok: false, reason: 'game' };

  const [owned] = await db
    .select({ id: schema.backlog.id })
    .from(schema.backlog)
    .where(
      and(
        eq(schema.backlog.userId, userId),
        eq(schema.backlog.gameId, input.gameId),
      ),
    );
  if (owned) return { ok: false, reason: 'owned' };

  let listId = input.listId;
  if (listId === undefined) {
    const [first] = await db
      .select({ id: schema.playlists.id })
      .from(schema.playlists)
      .where(and(eq(schema.playlists.userId, userId), isList))
      .orderBy(
        asc(schema.playlists.position),
        asc(sql`lower(${schema.playlists.name})`),
        asc(schema.playlists.id),
      )
      .limit(1);
    // Nessuna lista: la prima nasce qui. Se due «aggiungi» arrivano insieme, uno
    // dei due trova il nome già preso e usa quella dell'altro.
    listId =
      first?.id ??
      (await createWishlist(userId, DEFAULT_LIST_NAME))?.id ??
      (
        await db
          .select({ id: schema.playlists.id })
          .from(schema.playlists)
          .where(and(eq(schema.playlists.userId, userId), isList))
          .limit(1)
      )[0]?.id;
  }
  if (listId === undefined) return { ok: false, reason: 'list' };

  const [list] = await db
    .select({ id: schema.playlists.id })
    .from(schema.playlists)
    .where(mine(userId, listId));
  if (!list) return { ok: false, reason: 'list' };

  await db
    .insert(schema.wishlistItems)
    .values({ listId: list.id, gameId: input.gameId })
    .onConflictDoNothing();

  const [row] = await db
    .select(listColumns(userId))
    .from(schema.playlists)
    .where(mine(userId, list.id));
  return { ok: true, list: row! };
}

/** `false` se la lista non esiste o non è tua. Una voce che non c'è non è un errore. */
export async function removeFromWishlist(
  userId: string,
  listId: string,
  gameId: string,
) {
  const [list] = await db
    .select({ id: schema.playlists.id })
    .from(schema.playlists)
    .where(mine(userId, listId));
  if (!list) return false;
  await db
    .delete(schema.wishlistItems)
    .where(
      and(
        eq(schema.wishlistItems.listId, list.id),
        eq(schema.wishlistItems.gameId, gameId),
      ),
    );
  return true;
}

/** Le liste dell'utente, e se il gioco sta già in ciascuna. */
export function wishlistsForGame(userId: string, gameId: string) {
  return db
    .select({
      id: schema.playlists.id,
      name: schema.playlists.name,
      has: sql<boolean>`exists (select 1 from ${schema.wishlistItems} where ${schema.wishlistItems.listId} = ${schema.playlists.id} and ${schema.wishlistItems.gameId} = ${gameId})`,
    })
    .from(schema.playlists)
    .where(and(eq(schema.playlists.userId, userId), isList))
    .orderBy(
      asc(schema.playlists.position),
      asc(sql`lower(${schema.playlists.name})`),
      asc(schema.playlists.id),
    );
}

function sortExpression(sort: string): SQL {
  switch (sort) {
    case 'name':
      return sql`lower(${schema.games.name})`;
    case 'released':
      return sql`${schema.games.firstReleaseDate}`;
    case 'duration':
      return sql`${schema.games.hltbMainMinutes}`;
    case 'criticRating':
      return sql`${schema.games.criticScore}`;
    default:
      return sql`${schema.wishlistItems.addedAt}`;
  }
}

/**
 * Una lista aperta: i giochi come li mostra il catalogo, senza quelli che l'utente
 * ha nel backlog. Ricerca sul titolo, ordine, pagina; i NULL vanno in fondo su
 * ogni chiave, come nel backlog.
 */
export async function openWishlist(
  userId: string,
  input: {
    id: string;
    q?: string;
    sort: string;
    direction: 'asc' | 'desc';
    limit: number;
    offset: number;
  },
): Promise<WishlistGames | undefined> {
  const [list] = await db
    .select({
      id: schema.playlists.id,
      name: schema.playlists.name,
      ...storeColumns,
    })
    .from(schema.playlists)
    .leftJoin(
      schema.storeAccounts,
      eq(schema.storeAccounts.id, schema.playlists.storeAccountId),
    )
    .where(mineAny(userId, input.id));
  if (!list) return undefined;
  const ofStore =
    list.store && list.storeAccountId
      ? { store: list.store, storeAccountId: list.storeAccountId }
      : null;

  const direction = sql.raw(input.direction === 'asc' ? 'asc' : 'desc');
  const rows = await db
    .select({
      gameId: schema.wishlistItems.gameId,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(schema.wishlistItems)
    .innerJoin(schema.games, eq(schema.games.id, schema.wishlistItems.gameId))
    .where(
      and(
        eq(schema.wishlistItems.listId, list.id),
        // Una lista di negozio mostra anche ciò che hai già: vedi `visibleCount`.
        ofStore === null ? notInBacklog(userId) : undefined,
        input.q
          ? sql`${schema.games.name} ilike ${`%${escapeLike(input.q)}%`}`
          : undefined,
      ),
    )
    .orderBy(
      sql`${sortExpression(input.sort)} ${direction} nulls last`,
      // Spareggio obbligatorio: i pareggi sono la norma, e senza una chiave
      // unica le pagine si sovrapporrebbero.
      asc(schema.games.id),
    )
    .limit(input.limit)
    .offset(input.offset);

  const ids = rows.map((row) => row.gameId);
  const games = ids.length
    ? await db.query.games.findMany({
        columns: gameColumns,
        where: inArray(schema.games.id, ids),
      })
    : [];
  const byId = new Map(games.map((game) => [game.id, game]));

  // Lo stato di chi guarda, solo per una lista di negozio: quelli che hai già
  // portano l'etichetta, come sulle card della home. In una lista a mano nessuno
  // è nel backlog, e lo stato resta nullo.
  const owned =
    ofStore !== null && ids.length > 0
      ? await db
          .select({
            gameId: schema.backlog.gameId,
            status: schema.backlog.status,
          })
          .from(schema.backlog)
          .where(
            and(
              eq(schema.backlog.userId, userId),
              inArray(schema.backlog.gameId, ids),
            ),
          )
      : [];
  const statusById = new Map(owned.map((row) => [row.gameId, row.status]));

  return {
    id: list.id,
    name: list.name,
    ...ofStore,
    total: rows[0]?.total ?? 0,
    // `IN` non conserva l'ordine: lo rimette quello della ricerca.
    games: ids.flatMap((id) => {
      const game = byId.get(id);
      // In una lista a mano il cuore è pieno, e `wishlisted` lo dice. In una lista
      // di negozio no: il cuore è delle liste a mano, e quel gioco può non stare in
      // nessuna.
      return game
        ? [
            {
              ...GameSchema.parse(game),
              status: statusById.get(id) ?? null,
              wishlisted: ofStore === null,
            },
          ]
        : [];
    }),
  };
}
