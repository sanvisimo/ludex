import type { CuratedPlaylist, CuratedPlaylistGames } from '@repo/contracts';
import { GameSchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, asc, eq, inArray, sql } from '@repo/db/orm';

import { isUniqueViolation } from '../lib/pg-error';
import { escapeLike } from './backlog-search';
import { gameColumns } from './games';
import { wishlistedGameIds } from './wishlist-sync';

/**
 * Le playlist aperte (step 15f): giochi scelti a mano, **nell'ordine voluto**,
 * che non seguono il backlog. «I 100 RPG più belli di sempre».
 *
 * Stanno in `playlists` col tipo `curated`, e i giochi in `wishlist_items` con la
 * loro `position`. Ogni funzione parte dallo `userId` **e dal tipo**: una lista di
 * un altro, una playlist a filtro o una wishlist si comportano come un id
 * inesistente.
 *
 * Le regole della wishlist qui **non valgono**: ci stanno anche i giochi che hai
 * nel backlog, aggiungerli al backlog non li toglie (`dropFromWishlists` guarda
 * solo il tipo `wishlist`), e non accendono il cuore sulle card
 * (`wishlistedGameIds`, idem).
 */

const NAME_INDEX = 'playlists_user_kind_name_idx';

const isCurated = eq(schema.playlists.kind, 'curated');

const mine = (userId: string, id: string) =>
  and(
    eq(schema.playlists.id, id),
    eq(schema.playlists.userId, userId),
    isCurated,
  );

/**
 * L'ordine di una playlist aperta: la posizione, poi la data e il gioco. Le
 * posizioni possono avere buchi e pareggi (vedi `wishlist_items.position`): lo
 * spareggio le rende comunque un ordine solo, lo stesso per chi legge e per chi
 * sposta.
 */
const itemOrder = [
  sql`${schema.wishlistItems.position} asc nulls last`,
  asc(schema.wishlistItems.addedAt),
  asc(schema.wishlistItems.gameId),
];

/** Le voci di una playlist aperta, tutte: anche quelle dei giochi che hai. */
const count = sql<number>`(select count(*) from ${schema.wishlistItems} where ${schema.wishlistItems.listId} = ${schema.playlists.id})::int`;

const columns = {
  id: schema.playlists.id,
  name: schema.playlists.name,
  count,
  shareToken: schema.playlists.shareToken,
};

async function readCurated(userId: string, id: string) {
  const [row] = await db
    .select(columns)
    .from(schema.playlists)
    .where(mine(userId, id));
  return row;
}

export function listCuratedPlaylists(
  userId: string,
): Promise<CuratedPlaylist[]> {
  return db
    .select(columns)
    .from(schema.playlists)
    .where(and(eq(schema.playlists.userId, userId), isCurated))
    .orderBy(
      asc(schema.playlists.position),
      asc(sql`lower(${schema.playlists.name})`),
      asc(schema.playlists.id),
    );
}

/** `null` se ne hai già una con quel nome, maiuscole a parte. */
export async function createCuratedPlaylist(
  userId: string,
  name: string,
): Promise<CuratedPlaylist | null> {
  try {
    const [row] = await db
      .insert(schema.playlists)
      .values({
        userId,
        kind: 'curated',
        name,
        query: null,
        // In fondo, fra le playlist aperte: letta nella stessa INSERT, che due
        // creazioni insieme non leggano lo stesso numero.
        position: sql`(select coalesce(max(${schema.playlists.position}), -1) + 1 from ${schema.playlists} where ${schema.playlists.userId} = ${userId} and ${schema.playlists.kind} = 'curated')`,
      })
      .returning({
        id: schema.playlists.id,
        name: schema.playlists.name,
        shareToken: schema.playlists.shareToken,
      });
    return { ...row!, count: 0 };
  } catch (error) {
    if (isUniqueViolation(error, NAME_INDEX)) return null;
    throw error;
  }
}

/** `undefined` se non esiste (o non è tua), `null` se il nome è già preso. */
export async function renameCuratedPlaylist(
  userId: string,
  id: string,
  name: string,
): Promise<CuratedPlaylist | null | undefined> {
  try {
    const [row] = await db
      .update(schema.playlists)
      .set({ name })
      .where(mine(userId, id))
      .returning({ id: schema.playlists.id });
    if (!row) return undefined;
    return await readCurated(userId, id);
  } catch (error) {
    if (isUniqueViolation(error, NAME_INDEX)) return null;
    throw error;
  }
}

/** Toglie la playlist e le sue voci (cascade), non i giochi. */
export async function deleteCuratedPlaylist(userId: string, id: string) {
  const [row] = await db
    .delete(schema.playlists)
    .where(mine(userId, id))
    .returning({ id: schema.playlists.id });
  return row !== undefined;
}

export type AddCuratedResult =
  | { ok: true; list: CuratedPlaylist }
  | { ok: false; reason: 'game' | 'list' };

/**
 * Mette un gioco in fondo alla playlist. Ripeterla non fa niente: il gioco resta
 * al suo posto. Un gioco che hai nel backlog si aggiunge come gli altri.
 */
export async function addToCuratedPlaylist(
  userId: string,
  input: { listId: string; gameId: string },
): Promise<AddCuratedResult> {
  const [game] = await db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(eq(schema.games.id, input.gameId));
  if (!game) return { ok: false, reason: 'game' };

  const [list] = await db
    .select({ id: schema.playlists.id })
    .from(schema.playlists)
    .where(mine(userId, input.listId));
  if (!list) return { ok: false, reason: 'list' };

  await db
    .insert(schema.wishlistItems)
    .values({
      listId: list.id,
      gameId: game.id,
      // In fondo: letta nella stessa INSERT. Due aggiunte insieme possono leggere
      // lo stesso numero, e allora decide la data; il primo spostamento riscrive
      // tutto da 0.
      position: sql`(select coalesce(max(${schema.wishlistItems.position}), -1) + 1 from ${schema.wishlistItems} where ${schema.wishlistItems.listId} = ${list.id})`,
    })
    .onConflictDoNothing();

  return { ok: true, list: (await readCurated(userId, list.id))! };
}

/**
 * `false` se la playlist non esiste o non è tua. Una voce che non c'è non è un
 * errore. Il buco che lascia non si richiude: l'ordine non cambia.
 */
export async function removeFromCuratedPlaylist(
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

/**
 * Porta un gioco al posto `to` (da 0), e gli altri scalano: su, giù, il
 * trascinamento e «Sposta alla posizione…» sono tutti questa. Un posto oltre la
 * fine vale l'ultimo. `false` se la playlist non è tua o il gioco non ci sta.
 *
 * Le posizioni si riscrivono **per tutta la lista**, da 0 e senza buchi, come per
 * `movePlaylist`: dopo una rimozione i numeri hanno dei buchi, e a pari posizione
 * «scambiare» non avrebbe un senso. In una transazione, con la riga della
 * playlist bloccata: due spostamenti si mettono in fila, e un'aggiunta (che per
 * la chiave esterna blocca la stessa riga in condivisione) aspetta che finisca.
 */
export async function moveCuratedGame(
  userId: string,
  listId: string,
  gameId: string,
  to: number,
) {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .select({ id: schema.playlists.id })
      .from(schema.playlists)
      .where(mine(userId, listId))
      .for('update');
    if (!list) return false;

    const rows = await tx
      .select({
        gameId: schema.wishlistItems.gameId,
        position: schema.wishlistItems.position,
      })
      .from(schema.wishlistItems)
      .where(eq(schema.wishlistItems.listId, list.id))
      .orderBy(...itemOrder);

    const from = rows.findIndex((row) => row.gameId === gameId);
    if (from === -1) return false;

    const ordered = rows.map((row) => row.gameId);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(Math.min(to, ordered.length), 0, moved!);

    for (const [position, id] of ordered.entries()) {
      if (rows.find((row) => row.gameId === id)!.position === position)
        continue;
      await tx
        .update(schema.wishlistItems)
        .set({ position })
        .where(
          and(
            eq(schema.wishlistItems.listId, list.id),
            eq(schema.wishlistItems.gameId, id),
          ),
        );
    }
    return true;
  });
}

/** Le playlist aperte dell'utente, e se il gioco sta già in ciascuna. */
export function curatedPlaylistsForGame(userId: string, gameId: string) {
  return db
    .select({
      id: schema.playlists.id,
      name: schema.playlists.name,
      has: sql<boolean>`exists (select 1 from ${schema.wishlistItems} where ${schema.wishlistItems.listId} = ${schema.playlists.id} and ${schema.wishlistItems.gameId} = ${gameId})`,
    })
    .from(schema.playlists)
    .where(and(eq(schema.playlists.userId, userId), isCurated))
    .orderBy(
      asc(schema.playlists.position),
      asc(sql`lower(${schema.playlists.name})`),
      asc(schema.playlists.id),
    );
}

/**
 * Una pagina dei giochi di una playlist aperta, nell'ordine scelto, ciascuno col
 * suo posto nella lista intera (da 0). La ricerca sul titolo restringe, non
 * rinumera. Niente si esclude: né i giochi che chi l'ha fatta ha nel backlog né
 * quelli che ha nascosto, perché li ha scelti uno per uno.
 *
 * Serve a chi la apre e al link pubblico: i giochi escono come `Game`, e nient'altro
 * di chi l'ha fatta.
 */
export async function curatedPage(input: {
  listId: string;
  q?: string;
  limit: number;
  offset: number;
}) {
  const ranked = db.$with('ranked').as(
    db
      .select({
        gameId: schema.wishlistItems.gameId,
        rank: sql<number>`(row_number() over (order by ${sql.join(itemOrder, sql`, `)}) - 1)::int`.as(
          'rank',
        ),
      })
      .from(schema.wishlistItems)
      .where(eq(schema.wishlistItems.listId, input.listId)),
  );
  const rows = await db
    .with(ranked)
    .select({
      gameId: ranked.gameId,
      rank: ranked.rank,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(ranked)
    .innerJoin(schema.games, eq(schema.games.id, ranked.gameId))
    .where(
      input.q
        ? sql`${schema.games.name} ilike ${`%${escapeLike(input.q)}%`}`
        : undefined,
    )
    .orderBy(asc(ranked.rank))
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
    total: rows[0]?.total ?? 0,
    // `IN` non conserva l'ordine: lo rimette quello della lista. `GameSchema.parse`
    // scarta qualunque campo che non sia del catalogo.
    games: rows.flatMap((row) => {
      const game = byId.get(row.gameId);
      return game ? [{ game: GameSchema.parse(game), position: row.rank }] : [];
    }),
  };
}

/**
 * Lo stato di chi guarda su questi giochi, e il cuore: come sulle card della
 * home. Chi non è loggato non ha né l'uno né l'altro.
 */
export async function viewerMarks(viewerId: string | null, ids: string[]) {
  const owned =
    viewerId && ids.length > 0
      ? await db
          .select({
            gameId: schema.backlog.gameId,
            status: schema.backlog.status,
          })
          .from(schema.backlog)
          .where(
            and(
              eq(schema.backlog.userId, viewerId),
              inArray(schema.backlog.gameId, ids),
            ),
          )
      : [];
  const status = new Map(owned.map((row) => [row.gameId, row.status]));
  const wishlisted = await wishlistedGameIds(viewerId, ids);
  return (id: string) => ({
    status: status.get(id) ?? null,
    wishlisted: wishlisted.has(id),
  });
}

/** La playlist aperta, per chi l'ha fatta. `undefined` se non è tua. */
export async function openCuratedPlaylist(
  userId: string,
  input: { id: string; q?: string; limit: number; offset: number },
): Promise<CuratedPlaylistGames | undefined> {
  const [list] = await db
    .select({
      id: schema.playlists.id,
      name: schema.playlists.name,
      shareToken: schema.playlists.shareToken,
    })
    .from(schema.playlists)
    .where(mine(userId, input.id));
  if (!list) return undefined;

  const page = await curatedPage({ ...input, listId: list.id });
  const marks = await viewerMarks(
    userId,
    page.games.map((entry) => entry.game.id),
  );
  return {
    ...list,
    total: page.total,
    games: page.games.map((entry) => ({
      ...entry.game,
      ...marks(entry.game.id),
      position: entry.position,
    })),
  };
}
