import { PlaylistQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { exportAccount } from './account-export';
import { searchCatalog } from './catalog-search';
import { listHomeBands } from './home';
import { openSharedPlaylist } from './shared-playlists';
import {
  addToBacklog,
  ensureBacklogEntries,
  removeFromBacklog,
} from './backlog';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  movePlaylist,
  openPlaylist,
  sharePlaylist,
  updatePlaylist,
} from './playlists';
import { wishlistedGameIds } from './wishlist-sync';
import {
  addToWishlist,
  createWishlist,
  DEFAULT_LIST_NAME,
  deleteWishlist,
  listWishlists,
  moveWishlist,
  openWishlist,
  removeFromWishlist,
  renameWishlist,
  wishlistsForGame,
} from './wishlist';

// Le liste a mano (step 15b) si provano su ciò che, sbagliando, mente: un gioco
// già comprato che resta in lista, una lista di un altro che si legge o si cambia,
// una playlist a filtro scambiata per una lista (e viceversa).

const query = () => PlaylistQuerySchema.parse({});

const open = (
  userId: string,
  id: string,
  over: Partial<Parameters<typeof openWishlist>[1]> = {},
) =>
  openWishlist(userId, {
    id,
    sort: 'addedAt',
    direction: 'desc',
    limit: 50,
    offset: 0,
    ...over,
  });

async function lista(userId: string, name = 'Regali') {
  return (await createWishlist(userId, name))!;
}

async function gioco(over: Parameters<typeof createGame>[0] = {}) {
  return createGame(over);
}

describe('le liste', () => {
  let userId: string;
  let altro: string;

  beforeEach(async () => {
    userId = await createUser();
    altro = await createUser();
  });

  it('nascono in fondo, e il nome è unico per tipo e per utente', async () => {
    await lista(userId, 'Zeta');
    await lista(userId, 'Alfa');
    expect((await listWishlists(userId)).map((l) => l.name)).toEqual([
      'Zeta',
      'Alfa',
    ]);

    expect(await createWishlist(userId, 'ALFA')).toBeNull();
    // Un altro utente può usare lo stesso nome.
    expect(await createWishlist(altro, 'Alfa')).not.toBeNull();
  });

  it('una playlist a filtro e una lista possono chiamarsi uguale', async () => {
    expect(
      await createPlaylist(userId, { name: 'Brevi', query: query() }),
    ).not.toBeNull();
    expect(await createWishlist(userId, 'Brevi')).not.toBeNull();
  });

  it('rinominare su un nome già preso è un conflitto, non un errore', async () => {
    const a = await lista(userId, 'Alfa');
    await lista(userId, 'Beta');
    expect(await renameWishlist(userId, a.id, 'BETA')).toBeNull();
    expect(await renameWishlist(userId, a.id, 'Gamma')).toMatchObject({
      name: 'Gamma',
    });
  });

  it('si spostano dentro il tipo, senza toccare l’ordine delle playlist', async () => {
    const p1 = await createPlaylist(userId, { name: 'P1', query: query() });
    await createPlaylist(userId, { name: 'P2', query: query() });
    const l1 = await lista(userId, 'L1');
    await lista(userId, 'L2');
    const l3 = await lista(userId, 'L3');

    expect(await moveWishlist(userId, l3.id, 'up')).toBe(true);
    expect((await listWishlists(userId)).map((l) => l.name)).toEqual([
      'L1',
      'L3',
      'L2',
    ]);
    expect((await listPlaylists(userId)).map((p) => p.name)).toEqual([
      'P1',
      'P2',
    ]);

    // L'ordine di una playlist non tocca le liste.
    await movePlaylist(userId, p1!.id, 'down');
    expect((await listWishlists(userId)).map((l) => l.name)).toEqual([
      'L1',
      'L3',
      'L2',
    ]);
    void l1;
  });

  it('un altro non vede, non cambia, non sposta e non cancella le mie', async () => {
    const mia = await lista(userId, 'Mia');
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: mia.id });

    expect(await listWishlists(altro)).toEqual([]);
    expect(await open(altro, mia.id)).toBeUndefined();
    expect(await renameWishlist(altro, mia.id, 'Rubata')).toBeUndefined();
    expect(await moveWishlist(altro, mia.id, 'up')).toBe(false);
    expect(await removeFromWishlist(altro, mia.id, g.id)).toBe(false);
    expect(await deleteWishlist(altro, mia.id)).toBe(false);
    expect(
      await addToWishlist(altro, { gameId: g.id, listId: mia.id }),
    ).toEqual({ ok: false, reason: 'list' });

    expect((await open(userId, mia.id))!.games).toHaveLength(1);
  });

  it('i due tipi non si scambiano: ognuno lavora solo sul proprio', async () => {
    const playlist = (await createPlaylist(userId, {
      name: 'Filtro',
      query: query(),
    }))!;
    const lst = await lista(userId, 'Lista');
    const g = await gioco();

    // Un id di lista, alle funzioni delle playlist a filtro.
    expect(
      await updatePlaylist(userId, { id: lst.id, name: 'X' }),
    ).toBeUndefined();
    expect(await deletePlaylist(userId, lst.id)).toBeUndefined();
    expect(
      await openPlaylist(userId, { id: lst.id, limit: 5, offset: 0 }),
    ).toBeUndefined();
    expect(await sharePlaylist(userId, lst.id)).toBeUndefined();
    expect(await movePlaylist(userId, lst.id, 'up')).toBe(false);

    // Un id di playlist, alle funzioni delle liste.
    expect(await renameWishlist(userId, playlist.id, 'X')).toBeUndefined();
    expect(await deleteWishlist(userId, playlist.id)).toBe(false);
    expect(await open(userId, playlist.id)).toBeUndefined();
    expect(await moveWishlist(userId, playlist.id, 'up')).toBe(false);
    expect(
      await addToWishlist(userId, { gameId: g.id, listId: playlist.id }),
    ).toEqual({ ok: false, reason: 'list' });

    expect(await listPlaylists(userId)).toHaveLength(1);
    expect(await listWishlists(userId)).toHaveLength(1);
  });

  it('eliminare una lista porta via le sue voci e non i giochi', async () => {
    const l = await lista(userId);
    const g = await gioco({ name: 'Resta' });
    await addToWishlist(userId, { gameId: g.id, listId: l.id });

    expect(await deleteWishlist(userId, l.id)).toBe(true);
    expect(await db.select().from(schema.wishlistItems)).toEqual([]);
    expect(
      await db.select().from(schema.games).where(eq(schema.games.id, g.id)),
    ).toHaveLength(1);
  });
});

describe('aggiungere', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('è idempotente, e un gioco può stare in più liste', async () => {
    const a = await lista(userId, 'Alfa');
    const b = await lista(userId, 'Beta');
    const g = await gioco();

    await addToWishlist(userId, { gameId: g.id, listId: a.id });
    await addToWishlist(userId, { gameId: g.id, listId: a.id });
    await addToWishlist(userId, { gameId: g.id, listId: b.id });

    expect(await db.select().from(schema.wishlistItems)).toHaveLength(2);
    expect((await listWishlists(userId)).map((l) => l.count)).toEqual([1, 1]);
  });

  it('senza liste la prima nasce da sola, e dopo si usa quella', async () => {
    const g1 = await gioco();
    const g2 = await gioco();

    const primo = await addToWishlist(userId, { gameId: g1.id });
    expect(primo).toMatchObject({
      ok: true,
      list: { name: DEFAULT_LIST_NAME },
    });
    const secondo = await addToWishlist(userId, { gameId: g2.id });

    expect(await listWishlists(userId)).toHaveLength(1);
    expect(secondo.ok && secondo.list.count).toBe(2);
  });

  it('senza una lista indicata va nella prima, non nell’ultima', async () => {
    const prima = await lista(userId, 'Prima');
    await lista(userId, 'Seconda');
    const g = await gioco();

    const risultato = await addToWishlist(userId, { gameId: g.id });
    expect(risultato.ok && risultato.list.id).toBe(prima.id);
  });

  it('un gioco già nel backlog non si aggiunge, e uno che non esiste nemmeno', async () => {
    const l = await lista(userId);
    const g = await gioco();
    await addToBacklog({
      userId,
      gameId: g.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });

    expect(await addToWishlist(userId, { gameId: g.id, listId: l.id })).toEqual(
      {
        ok: false,
        reason: 'owned',
      },
    );
    expect(
      await addToWishlist(userId, {
        gameId: '00000000-0000-4000-8000-000000000000',
        listId: l.id,
      }),
    ).toEqual({ ok: false, reason: 'game' });
  });

  it('forGame dice in quali liste sta il gioco', async () => {
    const a = await lista(userId, 'Alfa');
    await lista(userId, 'Beta');
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: a.id });

    expect(await wishlistsForGame(userId, g.id)).toEqual([
      expect.objectContaining({ name: 'Alfa', has: true }),
      expect.objectContaining({ name: 'Beta', has: false }),
    ]);
  });
});

describe('dalla lista al backlog', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('aggiungerlo al backlog lo toglie da tutte le liste', async () => {
    const a = await lista(userId, 'Alfa');
    const b = await lista(userId, 'Beta');
    const g = await gioco();
    const altro = await gioco();
    for (const list of [a, b])
      await addToWishlist(userId, { gameId: g.id, listId: list.id });
    await addToWishlist(userId, { gameId: altro.id, listId: a.id });

    await addToBacklog({
      userId,
      gameId: g.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });

    // La voce non c'è più, nemmeno nel database; l'altro gioco resta.
    const voci = await db.select().from(schema.wishlistItems);
    expect(voci.map((v) => v.gameId)).toEqual([altro.id]);
  });

  it('un import che lo porta nel backlog lo toglie, e non tocca le liste degli altri', async () => {
    const mia = await lista(userId);
    const altroUtente = await createUser();
    const sua = await lista(altroUtente);
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: mia.id });
    await addToWishlist(altroUtente, { gameId: g.id, listId: sua.id });

    await ensureBacklogEntries(userId, [g.id]);

    expect((await open(userId, mia.id))!.games).toEqual([]);
    expect(
      (await db.select().from(schema.wishlistItems)).map((v) => v.listId),
    ).toEqual([sua.id]);
  });

  it('togliere il gioco dal backlog non lo rimette in lista', async () => {
    const l = await lista(userId);
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: l.id });
    const entryId = await addToBacklog({
      userId,
      gameId: g.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });

    await removeFromBacklog(userId, entryId);
    expect((await open(userId, l.id))!.games).toEqual([]);
  });

  it('la lettura non mostra un gioco che hai nel backlog, anche se la voce c’è ancora', async () => {
    const l = await lista(userId);
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: l.id });
    // Una strada di scrittura che se ne dimentica: la riga di backlog senza il
    // passaggio dalle funzioni del servizio.
    await db.insert(schema.backlog).values({ userId, gameId: g.id });

    expect((await open(userId, l.id))!.games).toEqual([]);
    expect((await open(userId, l.id))!.total).toBe(0);
    expect((await listWishlists(userId))[0]!.count).toBe(0);
    expect(await db.select().from(schema.wishlistItems)).toHaveLength(1);
  });
});

describe('aprire una lista', () => {
  let userId: string;
  let lst: Awaited<ReturnType<typeof lista>>;

  beforeEach(async () => {
    userId = await createUser();
    lst = await lista(userId);
  });

  const nomi = async (over: Partial<Parameters<typeof open>[2]> = {}) =>
    (await open(userId, lst.id, over))!.games.map((g) => g.name);

  async function metti(
    name: string,
    extra: Parameters<typeof createGame>[0] = {},
  ) {
    const g = await gioco({ name, ...extra });
    await addToWishlist(userId, { gameId: g.id, listId: lst.id });
    return g;
  }

  it('cerca sul titolo, e i caratteri jolly valgono per quello che sono', async () => {
    await metti('Hollow Knight');
    await metti('Celeste');
    await metti('100% Orange Juice');

    expect(await nomi({ q: 'hollow' })).toEqual(['Hollow Knight']);
    expect(await nomi({ q: '100%' })).toEqual(['100% Orange Juice']);
    expect(await nomi({ q: '%' })).toEqual(['100% Orange Juice']);
  });

  it('ordina per ogni chiave, con i NULL in fondo in tutte e due le direzioni', async () => {
    await metti('Breve', {
      hltbMainMinutes: 60,
      criticScore: 70,
      firstReleaseDate: new Date('2010-01-01'),
    });
    await metti('Lungo', {
      hltbMainMinutes: 3000,
      criticScore: 90,
      firstReleaseDate: new Date('2020-01-01'),
    });
    await metti('Ignoto');

    expect(await nomi({ sort: 'duration', direction: 'asc' })).toEqual([
      'Breve',
      'Lungo',
      'Ignoto',
    ]);
    expect(await nomi({ sort: 'duration', direction: 'desc' })).toEqual([
      'Lungo',
      'Breve',
      'Ignoto',
    ]);
    expect(await nomi({ sort: 'criticRating', direction: 'desc' })).toEqual([
      'Lungo',
      'Breve',
      'Ignoto',
    ]);
    expect(await nomi({ sort: 'released', direction: 'asc' })).toEqual([
      'Breve',
      'Lungo',
      'Ignoto',
    ]);
    expect(await nomi({ sort: 'name', direction: 'asc' })).toEqual([
      'Breve',
      'Ignoto',
      'Lungo',
    ]);
  });

  it('di default i più recenti per primi, e la pagina non salta né ripete', async () => {
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      await metti(name);
      // La data di aggiunta distingue: due righe nello stesso istante non si
      // ordinerebbero per scelta ma per caso.
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(await nomi()).toEqual(['E', 'D', 'C', 'B', 'A']);

    const pagina1 = await open(userId, lst.id, { limit: 2, offset: 0 });
    const pagina2 = await open(userId, lst.id, { limit: 2, offset: 2 });
    const pagina3 = await open(userId, lst.id, { limit: 2, offset: 4 });
    expect(
      [pagina1, pagina2, pagina3].flatMap((p) => p!.games.map((g) => g.name)),
    ).toEqual(['E', 'D', 'C', 'B', 'A']);
    expect(pagina1!.total).toBe(5);
  });

  it('i giochi escono come li mostra il catalogo, senza stato', async () => {
    await metti('Solo catalogo');
    const aperta = await open(userId, lst.id);
    expect(aperta!.games[0]).toMatchObject({
      name: 'Solo catalogo',
      status: null,
    });
    expect(Object.keys(aperta!).sort()).toEqual([
      'games',
      'id',
      'name',
      'total',
    ]);
  });
});

describe('l’esportazione', () => {
  it('porta le liste coi loro giochi, e le playlist a filtro restano com’erano', async () => {
    const userId = await createUser();
    await createPlaylist(userId, { name: 'Filtro', query: query() });
    const l = await lista(userId, 'Regali');
    const g = await gioco({ name: 'Hades', igdbId: 113112 });
    await addToWishlist(userId, { gameId: g.id, listId: l.id });

    const file = await exportAccount(userId);
    expect(file.wishlists).toEqual([
      {
        name: 'Regali',
        games: [
          {
            game: { name: 'Hades', igdbId: 113112 },
            addedAt: expect.any(Date),
          },
        ],
      },
    ]);
    expect(file.playlists.map((p) => p.name)).toEqual(['Filtro']);
  });
});

describe('il cuore sulle card (wishlisted)', () => {
  let userId: string;
  let altro: string;

  beforeEach(async () => {
    userId = await createUser();
    altro = await createUser();
  });

  it('dice quali giochi stanno in almeno una lista, una volta sola', async () => {
    const a = await lista(userId, 'Alfa');
    const b = await lista(userId, 'Beta');
    const inDue = await gioco();
    const inUna = await gioco();
    const fuori = await gioco();
    for (const l of [a, b])
      await addToWishlist(userId, { gameId: inDue.id, listId: l.id });
    await addToWishlist(userId, { gameId: inUna.id, listId: a.id });

    const set = await wishlistedGameIds(userId, [inDue.id, inUna.id, fuori.id]);
    expect([...set].sort()).toEqual([inDue.id, inUna.id].sort());
  });

  it('le liste degli altri non contano, e da anonimo non c’è niente', async () => {
    const sua = await lista(altro);
    const g = await gioco();
    await addToWishlist(altro, { gameId: g.id, listId: sua.id });

    expect(await wishlistedGameIds(userId, [g.id])).toEqual(new Set());
    expect(await wishlistedGameIds(null, [g.id])).toEqual(new Set());
    expect(await wishlistedGameIds(userId, [])).toEqual(new Set());
  });

  it('un gioco che hai nel backlog non conta, anche se la voce c’è ancora', async () => {
    const l = await lista(userId);
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: l.id });
    await db.insert(schema.backlog).values({ userId, gameId: g.id });

    expect(await wishlistedGameIds(userId, [g.id])).toEqual(new Set());
  });

  it('la ricerca lo porta per chi cerca, e da anonimo è falso', async () => {
    const l = await lista(userId);
    const inLista = await gioco({ name: 'Cuore pieno' });
    await gioco({ name: 'Cuore vuoto' });
    await addToWishlist(userId, { gameId: inLista.id, listId: l.id });

    const mia = await searchCatalog(
      { q: 'cuore', limit: 10, offset: 0 },
      userId,
    );
    expect(
      Object.fromEntries(mia.games.map((g) => [g.name, g.wishlisted])),
    ).toEqual({ 'Cuore pieno': true, 'Cuore vuoto': false });

    const dellAltro = await searchCatalog(
      { q: 'cuore', limit: 10, offset: 0 },
      altro,
    );
    expect(dellAltro.games.every((g) => g.wishlisted === false)).toBe(true);
    const anonimo = await searchCatalog(
      { q: 'cuore', limit: 10, offset: 0 },
      null,
    );
    expect(anonimo.games.every((g) => g.wishlisted === false)).toBe(true);
  });

  it('la home lo porta per chi guarda', async () => {
    const l = await lista(userId);
    const g = await gioco({ name: 'Nella home', gameType: 'main_game' });
    await addToWishlist(userId, { gameId: g.id, listId: l.id });

    const trova = (bande: Awaited<ReturnType<typeof listHomeBands>>) =>
      bande.flatMap((b) => b.games).find((x) => x.name === 'Nella home');

    expect(trova(await listHomeBands(userId))?.wishlisted).toBe(true);
    expect(trova(await listHomeBands(altro))?.wishlisted).toBe(false);
    expect(trova(await listHomeBands(null))?.wishlisted).toBe(false);
  });

  it('la playlist condivisa lo porta per chi guarda, non per il proprietario', async () => {
    const owner = await createUser();
    const g = await gioco({ name: 'Condiviso', hltbMainMinutes: 60 });
    await addToBacklog({
      userId: owner,
      gameId: g.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });
    const playlist = (await createPlaylist(owner, {
      name: 'Condivisa',
      query: query(),
    }))!;
    const token = (await sharePlaylist(owner, playlist.id))!;

    const l = await lista(userId);
    await addToWishlist(userId, { gameId: g.id, listId: l.id });

    const perLui = await openSharedPlaylist(
      { token, limit: 10, offset: 0 },
      userId,
    );
    expect(perLui!.games[0]).toMatchObject({
      name: 'Condiviso',
      wishlisted: true,
    });
    const perUnAltro = await openSharedPlaylist(
      { token, limit: 10, offset: 0 },
      altro,
    );
    expect(perUnAltro!.games[0]).toMatchObject({ wishlisted: false });
    const anonimo = await openSharedPlaylist(
      { token, limit: 10, offset: 0 },
      null,
    );
    expect(anonimo!.games[0]).toMatchObject({ wishlisted: false });
  });

  it('nella lista aperta sono tutti in lista', async () => {
    const l = await lista(userId);
    const g = await gioco();
    await addToWishlist(userId, { gameId: g.id, listId: l.id });

    expect((await open(userId, l.id))!.games[0]).toMatchObject({
      wishlisted: true,
      status: null,
    });
  });
});
