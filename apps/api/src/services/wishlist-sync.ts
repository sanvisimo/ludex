import { db, schema } from '@repo/db';
import { and, eq, inArray, sql } from '@repo/db/orm';

/**
 * Un gioco o è in una lista o è nel backlog (step 15b): quando entra nel
 * backlog esce da **tutte** le liste dell'utente.
 *
 * Sta in un modulo suo, che non importa il resto, perché lo chiamano i due punti
 * dove nasce una riga di `backlog` (`addToBacklog` e `ensureBacklogEntries`, che
 * usano gli import) e non può dipendere da loro.
 *
 * Non è l'unica difesa: la lettura di una lista esclude comunque i giochi che
 * l'utente ha nel backlog. Questa toglie le voci che altrimenti resterebbero,
 * e che tornerebbero a vedersi il giorno che il gioco esce dal backlog.
 */
export async function dropFromWishlists(
  userId: string,
  gameIds: string[],
  // Dentro la transazione di chi aggiunge, o fuori: se la riga di backlog non
  // nasce, la voce non deve sparire.
  executor: Pick<typeof db, 'delete' | 'select'> = db,
) {
  if (gameIds.length === 0) return;
  await executor.delete(schema.wishlistItems).where(
    and(
      inArray(schema.wishlistItems.gameId, gameIds),
      inArray(
        schema.wishlistItems.listId,
        executor
          .select({ id: schema.playlists.id })
          .from(schema.playlists)
          .where(
            and(
              eq(schema.playlists.userId, userId),
              eq(schema.playlists.kind, 'wishlist'),
            ),
          ),
      ),
    ),
  );
}

/**
 * Quali di questi giochi stanno in almeno una lista dell'utente: il cuore pieno
 * sulle card (step 15b).
 *
 * Un gioco che l'utente ha nel backlog **non conta**, qualunque cosa dica una
 * voce rimasta: la card mostra il suo stato, e il cuore non c'è. Chi non è
 * loggato non ha liste.
 */
export async function wishlistedGameIds(
  viewerId: string | null,
  gameIds: string[],
): Promise<Set<string>> {
  if (!viewerId || gameIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ gameId: schema.wishlistItems.gameId })
    .from(schema.wishlistItems)
    .innerJoin(
      schema.playlists,
      eq(schema.playlists.id, schema.wishlistItems.listId),
    )
    .where(
      and(
        eq(schema.playlists.userId, viewerId),
        eq(schema.playlists.kind, 'wishlist'),
        inArray(schema.wishlistItems.gameId, gameIds),
        sql`not exists (select 1 from ${schema.backlog} where ${schema.backlog.userId} = ${viewerId} and ${schema.backlog.gameId} = ${schema.wishlistItems.gameId})`,
      ),
    );
  return new Set(rows.map((row) => row.gameId));
}
