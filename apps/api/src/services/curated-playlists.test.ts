import { PlaylistQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { exportAccount } from './account-export';
import {
  addToBacklog,
  ensureBacklogEntries,
  setBacklogHidden,
} from './backlog';
import {
  addToCuratedPlaylist,
  createCuratedPlaylist,
  curatedPlaylistsForGame,
  curatedPositions,
  deleteCuratedPlaylist,
  listCuratedPlaylists,
  moveCuratedGame,
  openCuratedPlaylist,
  removeFromCuratedPlaylist,
  renameCuratedPlaylist,
} from './curated-playlists';
import {
  createPlaylist,
  listPlaylists,
  movePlaylist,
  sharePlaylist,
  unsharePlaylist,
} from './playlists';
import { openSharedPlaylist } from './shared-playlists';
import {
  addToWishlist,
  createWishlist,
  deleteWishlist,
  listWishlists,
  openWishlist,
} from './wishlist';
import { wishlistedGameIds } from './wishlist-sync';

// Le playlist aperte (step 15f) si provano su ciò che, sbagliando, mente: un
// ordine che non è quello scelto, un gioco che sparisce perché è entrato nel
// backlog, una playlist di un altro che si legge o si cambia, e un tipo scambiato
// per un altro.

const open = (
  userId: string,
  id: string,
  over: Partial<Parameters<typeof openCuratedPlaylist>[1]> = {},
) => openCuratedPlaylist(userId, { id, limit: 50, offset: 0, ...over });

const nomi = async (userId: string, id: string) =>
  (await open(userId, id))!.games.map((game) => game.name);

async function playlist(userId: string, name = 'I migliori RPG') {
  return (await createCuratedPlaylist(userId, name))!;
}

/** Una playlist coi giochi `names`, aggiunti in quest'ordine. */
async function piena(userId: string, names: string[]) {
  const list = await playlist(userId);
  const games = [];
  for (const name of names) {
    const game = await createGame({ name });
    await addToCuratedPlaylist(userId, { listId: list.id, gameId: game.id });
    games.push(game);
  }
  return { list, games };
}

describe('le playlist aperte', () => {
  let userId: string;
  let altro: string;

  beforeEach(async () => {
    userId = await createUser();
    altro = await createUser();
  });

  it('nascono in fondo, e il nome è unico fra le playlist aperte', async () => {
    await playlist(userId, 'Zeta');
    await playlist(userId, 'Alfa');
    expect((await listCuratedPlaylists(userId)).map((l) => l.name)).toEqual([
      'Zeta',
      'Alfa',
    ]);
    expect(await createCuratedPlaylist(userId, 'alfa')).toBeNull();
    // Un altro utente, e gli altri tipi, il nome lo possono usare.
    expect(await createCuratedPlaylist(altro, 'Alfa')).not.toBeNull();
    expect(await createWishlist(userId, 'Alfa')).not.toBeNull();
    expect(
      await createPlaylist(userId, {
        name: 'Alfa',
        query: PlaylistQuerySchema.parse({}),
      }),
    ).not.toBeNull();
  });

  it('si rinominano e si cancellano, i giochi restano', async () => {
    const { list, games } = await piena(userId, ['Hades']);
    expect(await renameCuratedPlaylist(userId, list.id, 'Top')).toMatchObject({
      name: 'Top',
      count: 1,
    });
    await playlist(userId, 'Altra');
    expect(await renameCuratedPlaylist(userId, list.id, 'altra')).toBeNull();

    expect(await deleteCuratedPlaylist(userId, list.id)).toBe(true);
    expect(await listCuratedPlaylists(userId)).toHaveLength(1);
    expect(await db.select().from(schema.wishlistItems)).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.games)
        .where(eq(schema.games.id, games[0]!.id)),
    ).toHaveLength(1);
  });

  it('aggiungere mette in fondo, e ripeterlo non sposta niente', async () => {
    const { list, games } = await piena(userId, ['Uno', 'Due', 'Tre']);
    await moveCuratedGame(userId, list.id, games[2]!.id, 0);

    const again = await addToCuratedPlaylist(userId, {
      listId: list.id,
      gameId: games[0]!.id,
    });
    expect(again).toMatchObject({ ok: true, list: { count: 3 } });
    expect(await nomi(userId, list.id)).toEqual(['Tre', 'Uno', 'Due']);

    const quattro = await createGame({ name: 'Quattro' });
    await addToCuratedPlaylist(userId, {
      listId: list.id,
      gameId: quattro.id,
    });
    expect(await nomi(userId, list.id)).toEqual([
      'Tre',
      'Uno',
      'Due',
      'Quattro',
    ]);
  });

  it('un gioco inesistente o una playlist non tua non si aggiungono', async () => {
    const list = await playlist(userId);
    const game = await createGame();
    expect(
      await addToCuratedPlaylist(userId, {
        listId: list.id,
        gameId: '00000000-0000-4000-8000-000000000000',
      }),
    ).toEqual({ ok: false, reason: 'game' });
    expect(
      await addToCuratedPlaylist(altro, { listId: list.id, gameId: game.id }),
    ).toEqual({ ok: false, reason: 'list' });
    expect(await db.select().from(schema.wishlistItems)).toEqual([]);
  });

  describe('lo spostamento', () => {
    const tutti = ['A', 'B', 'C', 'D', 'E'];

    it('in cima, in fondo e in mezzo', async () => {
      const { list, games } = await piena(userId, tutti);
      const [a, , c, , e] = games;

      await moveCuratedGame(userId, list.id, e!.id, 0);
      expect(await nomi(userId, list.id)).toEqual(['E', 'A', 'B', 'C', 'D']);

      await moveCuratedGame(userId, list.id, e!.id, 4);
      expect(await nomi(userId, list.id)).toEqual(tutti);

      await moveCuratedGame(userId, list.id, a!.id, 2);
      expect(await nomi(userId, list.id)).toEqual(['B', 'C', 'A', 'D', 'E']);

      await moveCuratedGame(userId, list.id, c!.id, 3);
      expect(await nomi(userId, list.id)).toEqual(['B', 'A', 'D', 'C', 'E']);
    });

    it('alla stessa posizione non cambia niente, e oltre la fine vale l’ultima', async () => {
      const { list, games } = await piena(userId, tutti);

      expect(await moveCuratedGame(userId, list.id, games[2]!.id, 2)).toBe(
        true,
      );
      expect(await nomi(userId, list.id)).toEqual(tutti);

      await moveCuratedGame(userId, list.id, games[0]!.id, 99);
      expect(await nomi(userId, list.id)).toEqual(['B', 'C', 'D', 'E', 'A']);
    });

    it('richiude i buchi lasciati da chi è uscito', async () => {
      const { list, games } = await piena(userId, tutti);
      await removeFromCuratedPlaylist(userId, list.id, games[1]!.id);
      await removeFromCuratedPlaylist(userId, list.id, games[3]!.id);
      expect(
        (await open(userId, list.id))!.games.map((g) => g.position),
      ).toEqual([0, 1, 2]);

      await moveCuratedGame(userId, list.id, games[4]!.id, 0);
      const voci = await db
        .select({ position: schema.wishlistItems.position })
        .from(schema.wishlistItems)
        .orderBy(schema.wishlistItems.position);
      expect(voci.map((v) => v.position)).toEqual([0, 1, 2]);
      expect(await nomi(userId, list.id)).toEqual(['E', 'A', 'C']);
    });

    it('sulla playlist di un altro, o con un gioco che non c’è, non succede niente', async () => {
      const { list, games } = await piena(userId, tutti);
      const fuori = await createGame();

      expect(await moveCuratedGame(altro, list.id, games[4]!.id, 0)).toBe(
        false,
      );
      expect(await moveCuratedGame(userId, list.id, fuori.id, 0)).toBe(false);
      expect(await nomi(userId, list.id)).toEqual(tutti);
    });
  });

  it('la ricerca restringe senza rinumerare, e le pagine seguono l’ordine', async () => {
    const { list } = await piena(userId, [
      'Baldur’s Gate 3',
      'Hades',
      'Baldur’s Gate 2',
    ]);
    const cercata = await open(userId, list.id, { q: 'baldur' });
    expect(cercata!.total).toBe(2);
    expect(cercata!.games.map((g) => [g.name, g.position] as const)).toEqual([
      ['Baldur’s Gate 3', 0],
      ['Baldur’s Gate 2', 2],
    ]);

    const seconda = await open(userId, list.id, { limit: 2, offset: 2 });
    expect(seconda!.total).toBe(3);
    expect(seconda!.games.map((g) => g.name)).toEqual(['Baldur’s Gate 2']);
  });

  it('un gioco che entra nel backlog resta nella playlist, col suo stato', async () => {
    const { list, games } = await piena(userId, [
      'Dal dialogo',
      'Da un import',
    ]);
    await addToBacklog({
      userId,
      gameId: games[0]!.id,
      status: 'playing',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });
    await ensureBacklogEntries(userId, [games[1]!.id]);

    const aperta = await open(userId, list.id);
    expect(aperta!.games.map((g) => [g.name, g.status])).toEqual([
      ['Dal dialogo', 'playing'],
      ['Da un import', 'backlog'],
    ]);
    expect((await listCuratedPlaylists(userId))[0]!.count).toBe(2);
  });

  it('il cuore ignora le playlist aperte', async () => {
    const { list, games } = await piena(userId, ['Hades']);
    expect(await wishlistedGameIds(userId, [games[0]!.id])).toEqual(new Set());
    expect((await open(userId, list.id))!.games[0]!.wishlisted).toBe(false);

    // Ma se lo stesso gioco è anche in una wishlist, il cuore c'è.
    await addToWishlist(userId, { gameId: games[0]!.id });
    expect((await open(userId, list.id))!.games[0]!.wishlisted).toBe(true);
  });

  it('i tipi non si confondono', async () => {
    const { list, games } = await piena(userId, ['Hades']);
    const wishlist = (await createWishlist(userId, 'Regali'))!;
    const filtro = (await createPlaylist(userId, {
      name: 'Brevi',
      query: PlaylistQuerySchema.parse({}),
    }))!;

    // Le funzioni delle wishlist non vedono una playlist aperta, e viceversa.
    expect(await listWishlists(userId)).toHaveLength(1);
    expect(await listPlaylists(userId)).toHaveLength(1);
    expect(
      await openWishlist(userId, {
        id: list.id,
        sort: 'addedAt',
        direction: 'desc',
        limit: 50,
        offset: 0,
      }),
    ).toBeUndefined();
    expect(await deleteWishlist(userId, list.id)).toBe(false);
    expect(await open(userId, wishlist.id)).toBeUndefined();
    expect(await open(userId, filtro.id)).toBeUndefined();
    expect(
      await addToCuratedPlaylist(userId, {
        listId: wishlist.id,
        gameId: games[0]!.id,
      }),
    ).toEqual({ ok: false, reason: 'list' });
    expect(await deleteCuratedPlaylist(userId, filtro.id)).toBe(false);

    // Lo spostamento delle playlist è dentro il tipo.
    const seconda = await playlist(userId, 'Seconda');
    await movePlaylist(userId, seconda.id, 'up', 'curated');
    expect((await listCuratedPlaylists(userId)).map((l) => l.name)).toEqual([
      'Seconda',
      'I migliori RPG',
    ]);
    expect(await movePlaylist(userId, filtro.id, 'up', 'curated')).toBe(false);

    // Il link: ciascuno col suo tipo.
    expect(await sharePlaylist(userId, list.id)).toBeUndefined();
    expect(await sharePlaylist(userId, filtro.id, 'curated')).toBeUndefined();
    expect(await unsharePlaylist(userId, list.id)).toBe(false);
    expect(await sharePlaylist(userId, list.id, 'curated')).toBeTruthy();
  });

  it('la playlist di un altro non si legge né si cambia', async () => {
    const { list, games } = await piena(userId, ['Hades']);

    expect(await open(altro, list.id)).toBeUndefined();
    expect(await listCuratedPlaylists(altro)).toEqual([]);
    expect(await renameCuratedPlaylist(altro, list.id, 'Mia')).toBeUndefined();
    expect(await deleteCuratedPlaylist(altro, list.id)).toBe(false);
    expect(await removeFromCuratedPlaylist(altro, list.id, games[0]!.id)).toBe(
      false,
    );
    expect(await sharePlaylist(altro, list.id, 'curated')).toBeUndefined();
    expect(await movePlaylist(altro, list.id, 'down', 'curated')).toBe(false);
    expect(await curatedPlaylistsForGame(altro, games[0]!.id)).toEqual([]);

    expect(await nomi(userId, list.id)).toEqual(['Hades']);
    expect((await listCuratedPlaylists(userId))[0]!.name).toBe(
      'I migliori RPG',
    );
  });

  it('dice a che posto stanno i giochi che ci sono, e solo a chi l’ha fatta', async () => {
    const { list, games } = await piena(userId, ['Uno', 'Due', 'Tre']);
    await removeFromCuratedPlaylist(userId, list.id, games[0]!.id);
    const fuori = await createGame();

    const posti = await curatedPositions(userId, list.id, [
      games[2]!.id,
      games[1]!.id,
      fuori.id,
    ]);
    expect(new Map(posti!.map((p) => [p.gameId, p.position]))).toEqual(
      new Map([
        [games[1]!.id, 0],
        [games[2]!.id, 1],
      ]),
    );
    expect(
      await curatedPositions(altro, list.id, [games[1]!.id]),
    ).toBeUndefined();
  });

  it('il menu della scheda dice in quali playlist sta il gioco', async () => {
    const { list, games } = await piena(userId, ['Hades']);
    const vuota = await playlist(userId, 'Vuota');
    expect(await curatedPlaylistsForGame(userId, games[0]!.id)).toEqual([
      { id: list.id, name: 'I migliori RPG', has: true },
      { id: vuota.id, name: 'Vuota', has: false },
    ]);
  });

  describe('col link', () => {
    it('escono solo i giochi, nell’ordine scelto, anche quelli nascosti', async () => {
      const { list, games } = await piena(userId, ['Uno', 'Due', 'Tre']);
      await moveCuratedGame(userId, list.id, games[2]!.id, 0);
      const entryId = await addToBacklog({
        userId,
        gameId: games[1]!.id,
        status: 'completed',
        ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
      });
      await db
        .update(schema.backlog)
        .set({ rating: 4.5, notes: 'segreto' })
        .where(eq(schema.backlog.id, entryId));
      await setBacklogHidden(userId, entryId, true);
      const token = (await sharePlaylist(userId, list.id, 'curated'))!;

      const shared = await openSharedPlaylist(
        { token, limit: 30, offset: 0 },
        null,
      );
      expect(shared).toMatchObject({
        kind: 'curated',
        name: 'I migliori RPG',
        total: 3,
      });
      expect(shared!.games.map((g) => g.name)).toEqual(['Tre', 'Uno', 'Due']);
      // Lo stato è di chi guarda: da anonimo, nessuno.
      expect(shared!.games.map((g) => g.status)).toEqual([null, null, null]);
      expect(Object.keys(shared!).sort()).toEqual([
        'games',
        'kind',
        'name',
        'total',
      ]);
      const testo = JSON.stringify(shared);
      expect(testo).not.toContain('segreto');
      expect(testo).not.toContain(userId);
      expect(testo).not.toContain('completed');
    });

    it('con lo stato di chi guarda, e revocato non c’è più', async () => {
      const { list, games } = await piena(userId, ['Hades']);
      await ensureBacklogEntries(altro, [games[0]!.id]);
      const token = (await sharePlaylist(userId, list.id, 'curated'))!;

      const perLui = await openSharedPlaylist(
        { token, limit: 30, offset: 0 },
        altro,
      );
      expect(perLui!.games[0]!.status).toBe('backlog');

      await unsharePlaylist(userId, list.id, 'curated');
      expect(
        await openSharedPlaylist({ token, limit: 30, offset: 0 }, null),
      ).toBeUndefined();
    });
  });

  it('l’esportazione le contiene, coi giochi nell’ordine scelto', async () => {
    const { list, games } = await piena(userId, ['Uno', 'Due']);
    await removeFromCuratedPlaylist(userId, list.id, games[0]!.id);
    const tre = await createGame({ name: 'Tre', igdbId: 4242 });
    await addToCuratedPlaylist(userId, { listId: list.id, gameId: tre.id });
    await moveCuratedGame(userId, list.id, tre.id, 0);
    await sharePlaylist(userId, list.id, 'curated');

    const file = await exportAccount(userId);
    expect(file.curatedPlaylists).toEqual([
      {
        name: 'I migliori RPG',
        shared: true,
        games: [
          {
            game: { name: 'Tre', igdbId: 4242 },
            position: 1,
            addedAt: expect.any(Date),
          },
          {
            game: { name: 'Due', igdbId: games[1]!.igdbId },
            position: 2,
            addedAt: expect.any(Date),
          },
        ],
      },
    ]);
    expect(file.wishlists).toEqual([]);
    expect(file.playlists).toEqual([]);
  });
});
