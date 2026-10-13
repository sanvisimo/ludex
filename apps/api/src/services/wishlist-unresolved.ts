import { db, schema } from '@repo/db';
import { and, asc, eq, sql } from '@repo/db/orm';

import { reopenSourcesForNewExternalIds } from './enrichment';
import { resolveGameFromIgdb } from './games';
import { wishlistKey } from './wishlist-key';

/**
 * Le voci di una wishlist di negozio che l'import non ha saputo legare a un
 * gioco (15e), nascoste comprese: la pagina le separa da sé, come per gli scarti
 * della libreria.
 *
 * Si chiedono **per lista**, non per account: è la lista che l'utente ha aperto.
 * `null` se la lista non è una sua lista di negozio — una lista altrui, una a
 * mano o una playlist a filtro non hanno voci da sistemare.
 */
export async function listWishlistUnresolved(userId: string, listId: string) {
  const [list] = await db
    .select({ storeAccountId: schema.playlists.storeAccountId })
    .from(schema.playlists)
    .where(
      and(
        eq(schema.playlists.id, listId),
        eq(schema.playlists.userId, userId),
        eq(sql`${schema.playlists.kind}::text`, 'store_wishlist'),
      ),
    );
  if (!list?.storeAccountId) return null;

  return db
    .select({
      id: schema.wishlistUnresolved.id,
      store: schema.wishlistUnresolved.store,
      externalId: schema.wishlistUnresolved.externalId,
      name: schema.wishlistUnresolved.name,
      imageUrl: schema.wishlistUnresolved.imageUrl,
      storePage: schema.wishlistUnresolved.storePage,
      addedAt: schema.wishlistUnresolved.addedAt,
      hiddenAt: schema.wishlistUnresolved.hiddenAt,
    })
    .from(schema.wishlistUnresolved)
    .where(
      and(
        eq(schema.wishlistUnresolved.storeAccountId, list.storeAccountId),
        // Sempre in AND con lo userId, come per gli scarti.
        eq(schema.wishlistUnresolved.userId, userId),
      ),
    )
    .orderBy(asc(schema.wishlistUnresolved.name));
}

function findOwn(userId: string, id: string) {
  return db.query.wishlistUnresolved.findFirst({
    where: and(
      eq(schema.wishlistUnresolved.id, id),
      eq(schema.wishlistUnresolved.userId, userId),
    ),
  });
}

/**
 * L'utente indica il gioco giusto: entra nella **lista di quell'account** e la
 * voce sparisce.
 *
 * Non entra nel backlog: è una voce di wishlist, non un possesso. Una lista di
 * negozio rispecchia il negozio, quindi un gioco che l'utente ha già nel backlog
 * entra lo stesso (e la lista lo mostra come «in backlog»), come all'import.
 *
 * Scrive anche la mappatura in `external_ids`, ed è la parte che conta di più: da
 * lì quell'id è risolto **per tutti**, e il prossimo aggiornamento non ripasserà
 * da qui. Su PSN la chiave è il `titleId` che l'id di prodotto contiene (vedi
 * `wishlistKey`), non l'id intero. Se l'id non ne contiene uno la voce entra in
 * lista lo stesso, ma niente si scrive e il collegamento dura fino al prossimo
 * aggiornamento.
 */
export async function resolveWishlistUnresolved(
  userId: string,
  id: string,
  igdbId: number,
) {
  const pending = await findOwn(userId, id);
  if (!pending) return { status: 'not_found' as const };

  const [list] = await db
    .select({ id: schema.playlists.id })
    .from(schema.playlists)
    .where(eq(schema.playlists.storeAccountId, pending.storeAccountId));
  if (!list) return { status: 'not_found' as const };

  const game = await resolveGameFromIgdb(igdbId);
  if (!game) return { status: 'unknown_igdb_id' as const };

  const key = wishlistKey(pending.store, pending.externalId);
  if (key) {
    const inserted = await db
      .insert(schema.externalIds)
      .values({
        gameId: game.id,
        source: pending.store,
        externalId: key,
        storeTitle: pending.name,
      })
      .onConflictDoNothing({
        target: [schema.externalIds.source, schema.externalIds.externalId],
      })
      .returning({
        gameId: schema.externalIds.gameId,
        source: schema.externalIds.source,
      });
    // Collegare a mano un id è lo stesso evento di quando lo porta IGDB.
    await reopenSourcesForNewExternalIds(inserted);
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.wishlistItems)
      .values({
        listId: list.id,
        gameId: game.id,
        // La data del negozio, se la dà; altrimenti il default (adesso).
        ...(pending.addedAt ? { addedAt: pending.addedAt } : {}),
      })
      .onConflictDoNothing();
    await tx
      .delete(schema.wishlistUnresolved)
      .where(eq(schema.wishlistUnresolved.id, pending.id));
  });

  return { status: 'ok' as const };
}

/**
 * Mette da parte una voce che non è un gioco (un software, un bundle), o la
 * rimette fra quelle da sistemare. Una data e basta, senza i tipi degli scarti.
 *
 * Nasconderla di nuovo non ne sposta la data. L'aggiornamento della lista non la
 * tocca (vedi `syncStoreWishlist`), altrimenti tornerebbe a ogni giro.
 */
export async function setWishlistUnresolvedHidden(
  userId: string,
  id: string,
  hidden: boolean,
) {
  const [row] = await db
    .update(schema.wishlistUnresolved)
    .set({
      hiddenAt: hidden
        ? sql`coalesce(${schema.wishlistUnresolved.hiddenAt}, now())`
        : null,
    })
    .where(
      and(
        eq(schema.wishlistUnresolved.id, id),
        eq(schema.wishlistUnresolved.userId, userId),
      ),
    )
    .returning({ id: schema.wishlistUnresolved.id });
  return row;
}
