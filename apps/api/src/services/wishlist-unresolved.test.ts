import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import { findIgdbGameById } from '../external/igdb';
import { ensureBacklogEntries } from './backlog';
import {
  listWishlistUnresolved,
  resolveWishlistUnresolved,
  setWishlistUnresolvedHidden,
} from './wishlist-unresolved';

vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  searchIgdbGames: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({
  enqueueEnrichment: vi.fn(),
  enqueuePostImport: vi.fn(),
}));

const mockedFindById = vi.mocked(findIgdbGameById);

/** Una lista di negozio con una voce da sistemare: ciò che lascia un import. */
async function storeList(
  userId: string,
  store: 'steam' | 'gog' | 'psn' = 'steam',
  entry: { externalId?: string; addedAt?: Date | null } = {},
) {
  const account = await linkStoreAccount(userId, store);
  const [list] = await db
    .insert(schema.playlists)
    .values({
      userId,
      kind: 'store_wishlist',
      name: `${store} · prova`,
      query: null,
      storeAccountId: account.id,
    })
    .returning({ id: schema.playlists.id });
  const [row] = await db
    .insert(schema.wishlistUnresolved)
    .values({
      userId,
      storeAccountId: account.id,
      store,
      externalId: entry.externalId ?? '931180',
      name: 'Conan Exiles - Public Beta Client',
      addedAt: entry.addedAt ?? null,
    })
    .returning({ id: schema.wishlistUnresolved.id });
  return { account, listId: list!.id, rowId: row!.id };
}

const itemsOf = (listId: string) =>
  db
    .select()
    .from(schema.wishlistItems)
    .where(eq(schema.wishlistItems.listId, listId));

const mappingOf = (source: 'steam' | 'gog' | 'psn', externalId: string) =>
  db.query.externalIds.findFirst({
    where: and(
      eq(schema.externalIds.source, source),
      eq(schema.externalIds.externalId, externalId),
    ),
  });

describe('wishlist unresolved (15e)', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  describe('elenco', () => {
    it('rende le voci della lista, nascoste comprese, in ordine di nome', async () => {
      const { account, listId } = await storeList(userId);
      await db.insert(schema.wishlistUnresolved).values({
        userId,
        storeAccountId: account.id,
        store: 'steam',
        externalId: '1',
        name: 'Aaa',
        hiddenAt: new Date(),
      });

      const rows = await listWishlistUnresolved(userId, listId);

      expect(rows!.map((r) => r.name)).toEqual([
        'Aaa',
        'Conan Exiles - Public Beta Client',
      ]);
      expect(rows![0]!.hiddenAt).toBeInstanceOf(Date);
    });

    it('una lista altrui, a mano o inesistente non ha voci: null', async () => {
      const mine = await storeList(userId);
      const other = await storeList(await createUser());
      const [manual] = await db
        .insert(schema.playlists)
        .values({ userId, kind: 'wishlist', name: 'A mano', query: null })
        .returning({ id: schema.playlists.id });

      expect(await listWishlistUnresolved(userId, other.listId)).toBeNull();
      expect(await listWishlistUnresolved(userId, manual!.id)).toBeNull();
      expect(
        await listWishlistUnresolved(
          userId,
          '00000000-0000-4000-8000-0000000000ff',
        ),
      ).toBeNull();
      expect(await listWishlistUnresolved(userId, mine.listId)).toHaveLength(1);
    });

    it('non mescola le voci di due account dello stesso utente', async () => {
      const first = await storeList(userId, 'steam');
      const second = await storeList(userId, 'gog', { externalId: '2' });

      expect(await listWishlistUnresolved(userId, first.listId)).toHaveLength(
        1,
      );
      const rows = await listWishlistUnresolved(userId, second.listId);
      expect(rows).toHaveLength(1);
      expect(rows![0]!.store).toBe('gog');
    });
  });

  describe('collegare', () => {
    it('Steam: il gioco entra nella lista con la data del negozio, l’id si scrive e la voce sparisce', async () => {
      const game = await createGame({ igdbId: 113112, name: 'Hades' });
      const { listId, rowId } = await storeList(userId, 'steam', {
        addedAt: new Date('2026-10-01T10:00:00Z'),
      });

      const esito = await resolveWishlistUnresolved(userId, rowId, 113112);

      expect(esito).toEqual({ status: 'ok' });
      const items = await itemsOf(listId);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ gameId: game.id });
      expect(items[0]!.addedAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
      expect((await mappingOf('steam', '931180'))?.gameId).toBe(game.id);
      expect(await listWishlistUnresolved(userId, listId)).toEqual([]);
    });

    it('GOG scrive l’id come Steam; PSN scrive il titleId, non l’id di prodotto', async () => {
      const game = await createGame({ igdbId: 113112, name: 'Hades' });
      const gog = await storeList(userId, 'gog', { externalId: '1207' });
      const psn = await storeList(userId, 'psn', {
        externalId: 'EP0002-CUSA13801_00-HADES',
      });

      await resolveWishlistUnresolved(userId, gog.rowId, 113112);
      await resolveWishlistUnresolved(userId, psn.rowId, 113112);

      expect(await mappingOf('gog', '1207')).toBeDefined();
      expect((await mappingOf('psn', 'CUSA13801_00'))?.gameId).toBe(game.id);
      expect(
        await mappingOf('psn', 'EP0002-CUSA13801_00-HADES'),
      ).toBeUndefined();
      expect(await itemsOf(psn.listId)).toHaveLength(1);
      expect(await listWishlistUnresolved(userId, psn.listId)).toEqual([]);
    });

    it('PSN senza un titleId nell’id entra in lista ma non scrive niente', async () => {
      await createGame({ igdbId: 113112, name: 'Hades' });
      const psn = await storeList(userId, 'psn', { externalId: 'NIENTE' });

      await resolveWishlistUnresolved(userId, psn.rowId, 113112);

      expect(await itemsOf(psn.listId)).toHaveLength(1);
      expect(await db.select().from(schema.externalIds)).toEqual([]);
    });

    it('un gioco che hai già nel backlog entra lo stesso: la lista rispecchia il negozio', async () => {
      const game = await createGame({ igdbId: 113112, name: 'Hades' });
      await ensureBacklogEntries(userId, [game.id]);
      const { listId, rowId } = await storeList(userId);

      await resolveWishlistUnresolved(userId, rowId, 113112);

      expect((await itemsOf(listId)).map((i) => i.gameId)).toEqual([game.id]);
    });

    it('un id IGDB che non esiste non cambia niente', async () => {
      mockedFindById.mockResolvedValue(null);
      const { listId, rowId } = await storeList(userId);

      expect(await resolveWishlistUnresolved(userId, rowId, 999)).toEqual({
        status: 'unknown_igdb_id',
      });

      expect(await itemsOf(listId)).toEqual([]);
      expect(await listWishlistUnresolved(userId, listId)).toHaveLength(1);
      expect(await db.select().from(schema.externalIds)).toEqual([]);
    });

    it('la voce di un altro utente è come inesistente', async () => {
      await createGame({ igdbId: 113112, name: 'Hades' });
      const other = await storeList(await createUser());

      expect(
        await resolveWishlistUnresolved(userId, other.rowId, 113112),
      ).toEqual({ status: 'not_found' });

      expect(await itemsOf(other.listId)).toEqual([]);
      expect(await db.select().from(schema.wishlistUnresolved)).toHaveLength(1);
    });
  });

  describe('nascondere', () => {
    it('nasconde, tiene la data se lo si ripete, e rimette fra quelle da sistemare', async () => {
      const { listId, rowId } = await storeList(userId);

      await setWishlistUnresolvedHidden(userId, rowId, true);
      const first = (await listWishlistUnresolved(userId, listId))![0]!
        .hiddenAt;
      expect(first).toBeInstanceOf(Date);

      await new Promise((resolve) => setTimeout(resolve, 20));
      await setWishlistUnresolvedHidden(userId, rowId, true);
      expect(
        (await listWishlistUnresolved(userId, listId))![0]!.hiddenAt,
      ).toEqual(first);

      await setWishlistUnresolvedHidden(userId, rowId, false);
      expect(
        (await listWishlistUnresolved(userId, listId))![0]!.hiddenAt,
      ).toBeNull();
    });

    it('non tocca la voce di un altro utente', async () => {
      const other = await storeList(await createUser());

      expect(
        await setWishlistUnresolvedHidden(userId, other.rowId, true),
      ).toBeUndefined();

      const [row] = await db.select().from(schema.wishlistUnresolved);
      expect(row!.hiddenAt).toBeNull();
    });
  });
});
