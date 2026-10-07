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
 * Un gioco o è in una lista o è nel backlog. Quando entra nel backlog esce dalle
 * liste (`dropFromWishlists`), e la lettura esclude comunque quelli che hai nel
 * backlog, per non mostrare mai un gioco già tuo.
 */

const NAME_INDEX = 'playlists_user_kind_name_idx';

/** Il nome della lista che nasce da sola al primo «aggiungi», senza liste. */
export const DEFAULT_LIST_NAME = 'Wishlist';

const isList = eq(schema.playlists.kind, 'wishlist');

/** Le voci che si vedono: quelle di giochi che l'utente non ha nel backlog. */
const notInBacklog = (userId: string) =>
  sql`not exists (select 1 from ${schema.backlog} where ${schema.backlog.userId} = ${userId} and ${schema.backlog.gameId} = ${schema.wishlistItems.gameId})`;

/** Quante voci visibili ha una lista. */
const visibleCount = (userId: string) =>
  sql<number>`(select count(*) from ${schema.wishlistItems} where ${schema.wishlistItems.listId} = ${schema.playlists.id} and ${notInBacklog(userId)})::int`;

const listColumns = (userId: string) => ({
  id: schema.playlists.id,
  name: schema.playlists.name,
  count: visibleCount(userId),
});

const mine = (userId: string, id: string) =>
  and(eq(schema.playlists.id, id), eq(schema.playlists.userId, userId), isList);

export function listWishlists(userId: string): Promise<Wishlist[]> {
  return db
    .select(listColumns(userId))
    .from(schema.playlists)
    .where(and(eq(schema.playlists.userId, userId), isList))
    .orderBy(
      asc(schema.playlists.position),
      asc(sql`lower(${schema.playlists.name})`),
      asc(schema.playlists.id),
    );
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

/** `undefined` se non esiste (o non è tua), `null` se il nome è già preso. */
export async function renameWishlist(
  userId: string,
  id: string,
  name: string,
): Promise<Wishlist | null | undefined> {
  try {
    const [row] = await db
      .update(schema.playlists)
      .set({ name })
      .where(mine(userId, id))
      .returning({ id: schema.playlists.id });
    if (!row) return undefined;
    const [list] = await db
      .select(listColumns(userId))
      .from(schema.playlists)
      .where(mine(userId, id));
    return list;
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

export const moveWishlist = (
  userId: string,
  id: string,
  direction: 'up' | 'down',
) => movePlaylist(userId, id, direction, 'wishlist');

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
    .select({ id: schema.playlists.id, name: schema.playlists.name })
    .from(schema.playlists)
    .where(mine(userId, input.id));
  if (!list) return undefined;

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
        notInBacklog(userId),
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

  return {
    id: list.id,
    name: list.name,
    total: rows[0]?.total ?? 0,
    // `IN` non conserva l'ordine: lo rimette quello della ricerca.
    games: ids.flatMap((id) => {
      const game = byId.get(id);
      // In lista per definizione: il cuore è pieno, e `wishlisted` lo dice.
      return game
        ? [{ ...GameSchema.parse(game), status: null, wishlisted: true }]
        : [];
    }),
  };
}
