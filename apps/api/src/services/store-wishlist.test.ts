import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  createUser,
  linkSteamAppId,
  linkStoreAccount,
} from '../../test/factories';
import {
  fetchGogProduct,
  fetchGogWishlist,
  GogAuthError,
} from '../external/gog';
import {
  findIgdbGamesByExternalIds,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import { fetchPsnWishlist, PsnAuthError } from '../external/psn';
import {
  fetchSteamAppDetails,
  fetchSteamWishlist,
  SteamUnauthorizedError,
  SteamWishlistNotVisibleError,
} from '../external/steam';
import { enqueueEnrichment, enqueuePostImport } from '../queue/enrichment';
import { ensureBacklogEntries } from './backlog';
import {
  importStoreWishlist,
  lookupNames,
  NAME_LOOKUP_CAP,
  syncStoreWishlist,
  type WishlistEntry,
} from './store-wishlist';
import {
  StoreReauthRequiredError,
  type StoreAccountRow,
  steamAccessToken,
  storeAccessToken,
} from './store-accounts';
import { renameWishlist } from './wishlist';

// I confini sono i moduli dei negozi e di IGDB, non `fetch`: le classi d'errore
// restano vere, perché il servizio ci fa `instanceof`.
vi.mock('../external/steam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/steam')>()),
  fetchSteamWishlist: vi.fn(),
  fetchSteamAppDetails: vi.fn(),
}));
vi.mock('../external/gog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/gog')>()),
  fetchGogWishlist: vi.fn(),
  fetchGogProduct: vi.fn(),
}));
vi.mock('../external/psn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/psn')>()),
  fetchPsnWishlist: vi.fn(),
}));
vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  findIgdbGamesByExternalIds: vi.fn(),
  findIgdbGamesBySource: vi.fn(),
  searchIgdbGames: vi.fn(),
  igdbSourceFor: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({
  enqueueEnrichment: vi.fn(),
  enqueuePostImport: vi.fn(),
}));
// Come ottenere un token è un altro test (`store-accounts.test.ts`): qui conta
// cosa se ne fa.
vi.mock('./store-accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store-accounts')>()),
  steamAccessToken: vi.fn(),
  storeAccessToken: vi.fn(),
}));

const mockedById = vi.mocked(findIgdbGamesByExternalIds);
const mockedSearch = vi.mocked(searchIgdbGames);
const mockedSource = vi.mocked(igdbSourceFor);
const mockedEnqueue = vi.mocked(enqueueEnrichment);
const mockedPostImport = vi.mocked(enqueuePostImport);
const mockedSteamWishlist = vi.mocked(fetchSteamWishlist);
const mockedSteamDetails = vi.mocked(fetchSteamAppDetails);
const mockedGogWishlist = vi.mocked(fetchGogWishlist);
const mockedGogProduct = vi.mocked(fetchGogProduct);
const mockedPsnWishlist = vi.mocked(fetchPsnWishlist);
const mockedSteamToken = vi.mocked(steamAccessToken);
const mockedToken = vi.mocked(storeAccessToken);

const entry = (
  externalId: string,
  over: Partial<WishlistEntry> = {},
): WishlistEntry => ({
  externalId,
  name: `App ${externalId}`,
  nameKnown: false,
  isAddon: false,
  addedAt: null,
  imageUrl: null,
  storePage: `app/${externalId}`,
  ...over,
});

/** Un risultato di ricerca IGDB, ridotto a ciò che il matcher guarda. */
const hit = (igdbId: number, name: string) => ({
  igdbId,
  name,
  releaseYear: null,
  developer: null,
  cover: null,
  gameType: null,
  totalRatingCount: null,
  platformIds: [],
});

const listOf = async (accountId: string) =>
  (
    await db
      .select()
      .from(schema.playlists)
      .where(eq(schema.playlists.storeAccountId, accountId))
  )[0];

const gamesIn = async (listId: string) =>
  (
    await db
      .select({
        name: schema.games.name,
        addedAt: schema.wishlistItems.addedAt,
      })
      .from(schema.wishlistItems)
      .innerJoin(schema.games, eq(schema.games.id, schema.wishlistItems.gameId))
      .where(eq(schema.wishlistItems.listId, listId))
  ).sort((a, b) => a.name.localeCompare(b.name));

const unresolvedOf = (accountId: string) =>
  db
    .select()
    .from(schema.wishlistUnresolved)
    .where(eq(schema.wishlistUnresolved.storeAccountId, accountId));

/** Un gioco di Ludex che ha già l'appid Steam, cioè «noto». */
async function knownSteamGame(name: string, appId: string) {
  const game = await createGame({ name });
  await linkSteamAppId(game.id, appId);
  return game;
}

/** L'account, riletto: è la riga che i servizi si passano. */
async function account(
  userId: string,
  store: 'steam' | 'gog' | 'psn' = 'steam',
  over: Partial<typeof schema.storeAccounts.$inferInsert> = {},
): Promise<StoreAccountRow> {
  const created = await linkStoreAccount(userId, store);
  const [row] = await db
    .update(schema.storeAccounts)
    .set({ displayName: 'prova', ...over })
    .where(eq(schema.storeAccounts.id, created.id))
    .returning();
  return row!;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedById.mockResolvedValue(new Map());
  mockedSearch.mockResolvedValue([]);
  mockedSource.mockReturnValue(1);
});

describe('syncStoreWishlist', () => {
  let userId: string;
  let acct: StoreAccountRow;
  const noNames = vi.fn().mockResolvedValue(new Map());

  beforeEach(async () => {
    userId = await createUser();
    acct = await account(userId);
    // `resetAllMocks` (qui sopra) azzera anche questo: si rimette il suo valore.
    noNames.mockReset().mockResolvedValue(new Map());
  });

  it('crea la lista alla prima richiesta, col nome del negozio e dell’account', async () => {
    await knownSteamGame('Hades', '1145360');
    await knownSteamGame('Celeste', '504230');

    const report = await syncStoreWishlist(
      acct,
      [
        entry('1145360', { addedAt: new Date('2026-10-01T10:00:00Z') }),
        entry('504230'),
      ],
      { lookup: noNames },
    );

    const list = await listOf(acct.id);
    expect(list).toMatchObject({
      kind: 'store_wishlist',
      name: 'Steam · prova',
      userId,
      query: null,
    });
    expect(report).toMatchObject({
      total: 2,
      inList: 2,
      unresolved: 0,
      newGames: 0,
      listId: list!.id,
    });
    const items = await gamesIn(list!.id);
    expect(items.map((i) => i.name)).toEqual(['Celeste', 'Hades']);
    // La data del negozio, dove c'è.
    expect(items.find((i) => i.name === 'Hades')!.addedAt.toISOString()).toBe(
      '2026-10-01T10:00:00.000Z',
    );
  });

  it('riallineare è idempotente e non riscrive la data di una voce che c’era già', async () => {
    await knownSteamGame('Hades', '1145360');
    await syncStoreWishlist(
      acct,
      [entry('1145360', { addedAt: new Date('2026-10-01T10:00:00Z') })],
      { lookup: noNames },
    );
    const primo = await listOf(acct.id);

    await syncStoreWishlist(
      acct,
      [entry('1145360', { addedAt: new Date('2026-10-09T10:00:00Z') })],
      { lookup: noNames },
    );

    // Una lista sola, e la voce con la data di allora.
    const liste = await db
      .select()
      .from(schema.playlists)
      .where(eq(schema.playlists.storeAccountId, acct.id));
    expect(liste).toHaveLength(1);
    expect(liste[0]!.id).toBe(primo!.id);
    const items = await gamesIn(primo!.id);
    expect(items).toHaveLength(1);
    expect(items[0]!.addedAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });

  it('ciò che il negozio non ha più esce; le liste degli altri restano', async () => {
    const g1 = await knownSteamGame('Uno', '1');
    await knownSteamGame('Due', '2');
    const altro = await createUser();
    const accountAltro = await account(altro);
    await syncStoreWishlist(accountAltro, [entry('1')], { lookup: noNames });

    await syncStoreWishlist(acct, [entry('1'), entry('2')], {
      lookup: noNames,
    });
    await syncStoreWishlist(acct, [entry('1')], { lookup: noNames });

    expect(
      (await gamesIn((await listOf(acct.id))!.id)).map((i) => i.name),
    ).toEqual(['Uno']);
    expect(
      (await gamesIn((await listOf(accountAltro.id))!.id)).map((i) => i.name),
    ).toEqual([g1.id ? 'Uno' : '']);
  });

  it('una wishlist svuotata dal negozio svuota la lista, e anche i non riconosciuti', async () => {
    await knownSteamGame('Uno', '1');
    mockedSteamDetails.mockResolvedValue(null);
    await syncStoreWishlist(acct, [entry('1'), entry('999')], {
      lookup: noNames,
    });
    expect(await unresolvedOf(acct.id)).toHaveLength(1);

    await syncStoreWishlist(acct, [], { lookup: noNames });

    expect(await gamesIn((await listOf(acct.id))!.id)).toEqual([]);
    expect(await unresolvedOf(acct.id)).toEqual([]);
  });

  it('un gioco che hai già nel backlog resta in lista: rispecchia il negozio', async () => {
    const hades = await knownSteamGame('Hades', '1145360');
    await ensureBacklogEntries(userId, [hades.id]);

    const report = await syncStoreWishlist(acct, [entry('1145360')], {
      lookup: noNames,
    });

    expect(report.inList).toBe(1);
    expect(await gamesIn(report.listId)).toHaveLength(1);
  });

  it('per id: IGDB crea il gioco, si scrive l’id, e si accoda l’arricchimento', async () => {
    mockedById.mockResolvedValue(
      new Map([
        ['730', { igdbId: 7300, name: 'Counter-Strike 2', releaseYear: 2023 }],
      ]),
    );

    const report = await syncStoreWishlist(acct, [entry('730')], {
      lookup: noNames,
    });

    expect(report).toMatchObject({ inList: 1, newGames: 1, unresolved: 0 });
    const game = await db.query.games.findFirst({
      where: eq(schema.games.igdbId, 7300),
    });
    expect(game?.name).toBe('Counter-Strike 2');
    const mapped = await db.query.externalIds.findFirst({
      where: and(
        eq(schema.externalIds.source, 'steam'),
        eq(schema.externalIds.externalId, '730'),
      ),
    });
    expect(mapped?.gameId).toBe(game!.id);
    expect(mockedEnqueue).toHaveBeenCalledWith('igdb', game!.id);
    expect(mockedPostImport).toHaveBeenCalledTimes(1);
    // Riconosciuta per id: non si chiede nessun nome.
    expect(noNames).not.toHaveBeenCalled();
  });

  it('una voce già nota non costa né IGDB né il nome', async () => {
    await knownSteamGame('Hades', '1145360');

    await syncStoreWishlist(acct, [entry('1145360')], { lookup: noNames });

    expect(noNames).not.toHaveBeenCalled();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('non riconosciuta: nome e pagina dal negozio, riga a parte, e si risolve da sola più tardi', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(
        new Map([['555', { name: 'Gioco Misterioso', isAddon: false }]]),
      );

    const report = await syncStoreWishlist(
      acct,
      [entry('555', { addedAt: new Date('2026-10-02T00:00:00Z') })],
      { lookup },
    );

    expect(report).toMatchObject({ inList: 0, unresolved: 1 });
    const [riga] = await unresolvedOf(acct.id);
    expect(riga).toMatchObject({
      userId,
      store: 'steam',
      externalId: '555',
      name: 'Gioco Misterioso',
      storePage: 'app/555',
      hiddenAt: null,
    });
    expect(riga!.addedAt?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    // E non fra gli scarti della libreria.
    expect(await db.select().from(schema.unresolvedImports)).toEqual([]);

    // Il gioco arriva (un admin lo collega, un altro utente lo importa): al
    // prossimo aggiornamento la riga sparisce e il gioco entra in lista.
    await knownSteamGame('Gioco Misterioso', '555');
    await syncStoreWishlist(acct, [entry('555')], { lookup });

    expect(await unresolvedOf(acct.id)).toEqual([]);
    expect((await gamesIn(report.listId)).map((i) => i.name)).toEqual([
      'Gioco Misterioso',
    ]);
  });

  it('un aggiornamento riscrive nome e copertina ma non ciò che l’utente ha nascosto', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(
        new Map([['555', { name: 'Prima', isAddon: true }]]),
      )
      .mockResolvedValueOnce(
        new Map([['555', { name: 'Dopo', isAddon: true }]]),
      );

    await syncStoreWishlist(acct, [entry('555')], { lookup });
    await db
      .update(schema.wishlistUnresolved)
      .set({ hiddenAt: new Date('2026-10-05T00:00:00Z') })
      .where(eq(schema.wishlistUnresolved.storeAccountId, acct.id));
    await syncStoreWishlist(acct, [entry('555')], { lookup });

    const [riga] = await unresolvedOf(acct.id);
    expect(riga!.name).toBe('Dopo');
    expect(riga!.hiddenAt?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('con un nome si cerca per nome e, su Steam e GOG, l’id si scrive', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(new Map([['3', { name: 'Hades', isAddon: false }]]));
    mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);

    const report = await syncStoreWishlist(acct, [entry('3')], { lookup });

    expect(report).toMatchObject({ inList: 1, resolvedByName: 1, newGames: 1 });
    const mapped = await db.query.externalIds.findFirst({
      where: and(
        eq(schema.externalIds.source, 'steam'),
        eq(schema.externalIds.externalId, '3'),
      ),
    });
    expect(mapped).toBeDefined();
  });

  it('un contenuto aggiuntivo non si cerca per nome: il gioco base sarebbe l’errore', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(
        new Map([['9', { name: 'Hades - Soundtrack', isAddon: true }]]),
      );
    mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);

    const report = await syncStoreWishlist(acct, [entry('9')], { lookup });

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(report).toMatchObject({ inList: 0, unresolved: 1 });
    expect((await unresolvedOf(acct.id))[0]!.name).toBe('Hades - Soundtrack');
  });

  it('un nome che il negozio non ha dato non si cerca: «App 7» troverebbe un gioco a caso', async () => {
    mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);

    const report = await syncStoreWishlist(acct, [entry('7')], {
      lookup: noNames,
    });

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(report).toMatchObject({ inList: 0, unresolved: 1 });
    expect((await unresolvedOf(acct.id))[0]!.name).toBe('App 7');
  });

  it.each([
    ['la più vecchia prima', '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z'],
    ['la più recente prima', '2026-06-01T00:00:00Z', '2026-01-01T00:00:00Z'],
  ])(
    'due voci dello stesso gioco: vale la data più vecchia (%s)',
    async (_ordine, prima, seconda) => {
      const game = await knownSteamGame('Hades', '1145360');
      await linkSteamAppId(game.id, '1145361');

      const report = await syncStoreWishlist(
        acct,
        [
          entry('1145360', { addedAt: new Date(prima) }),
          entry('1145361', { addedAt: new Date(seconda) }),
        ],
        { lookup: noNames },
      );

      expect(report.inList).toBe(1);
      expect((await gamesIn(report.listId))[0]!.addedAt.toISOString()).toBe(
        '2026-01-01T00:00:00.000Z',
      );
    },
  );

  it('il nome della lista nasce una volta: se l’utente la rinomina, resta', async () => {
    await knownSteamGame('Hades', '1145360');
    const { listId } = await syncStoreWishlist(acct, [entry('1145360')], {
      lookup: noNames,
    });
    await renameWishlist(userId, listId, 'Regali Steam');

    await syncStoreWishlist(acct, [entry('1145360')], { lookup: noNames });

    expect((await listOf(acct.id))!.name).toBe('Regali Steam');
  });

  it('due account dello stesso utente hanno due liste', async () => {
    const seconda = await account(userId, 'steam', { displayName: 'seconda' });
    await knownSteamGame('Hades', '1145360');

    await syncStoreWishlist(acct, [entry('1145360')], { lookup: noNames });
    await syncStoreWishlist(seconda, [entry('1145360')], { lookup: noNames });

    expect((await listOf(acct.id))!.id).not.toBe(
      (await listOf(seconda.id))!.id,
    );
    expect((await listOf(seconda.id))!.name).toBe('Steam · seconda');
  });

  describe('PSN: l’id di prodotto contiene il titleId', () => {
    let psn: StoreAccountRow;
    const prodotto = (productId: string, name = 'Hades') =>
      entry(productId, { name, nameKnown: true, storePage: null });

    beforeEach(async () => {
      psn = await account(userId, 'psn', { displayName: 'sanvisimo81' });
    });

    it('per nome la prima volta, e scrive il titleId — non l’id intero — in external_ids', async () => {
      mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);
      const hades = prodotto('EP0002-CUSA13801_00-HADES');

      const primo = await syncStoreWishlist(psn, [hades], { lookup: noNames });

      expect(primo).toMatchObject({
        inList: 1,
        resolvedByName: 1,
        newGames: 1,
      });
      expect((await gamesIn(primo.listId)).map((i) => i.name)).toEqual([
        'Hades',
      ]);
      expect((await listOf(psn.id))!.name).toBe('PlayStation · sanvisimo81');
      const ids = await db.select().from(schema.externalIds);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toMatchObject({
        source: 'psn',
        externalId: 'CUSA13801_00',
      });
      // E PSN non passa da IGDB per id, né dai nomi del negozio.
      expect(mockedById).not.toHaveBeenCalled();
      expect(noNames).not.toHaveBeenCalled();
    });

    it('la volta dopo lo riconosce dal titleId, senza cercare per nome', async () => {
      mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);
      const hades = prodotto('EP0002-CUSA13801_00-HADES');
      const primo = await syncStoreWishlist(psn, [hades], { lookup: noNames });
      mockedSearch.mockReset().mockResolvedValue([]);

      const secondo = await syncStoreWishlist(psn, [hades], {
        lookup: noNames,
      });

      expect(mockedSearch).not.toHaveBeenCalled();
      expect(secondo).toMatchObject({
        inList: 1,
        unresolved: 0,
        resolvedByName: 0,
        newGames: 0,
      });
      expect((await gamesIn(primo.listId)).map((i) => i.name)).toEqual([
        'Hades',
      ]);
    });

    it('un gioco che hai già su PSN si riconosce dal titleId, anche se il nome è un altro', async () => {
      const game = await createGame({ igdbId: 125174, name: 'Returnal' });
      await db
        .insert(schema.externalIds)
        .values({ gameId: game.id, source: 'psn', externalId: 'PPSA01285_00' });

      const report = await syncStoreWishlist(
        psn,
        [
          prodotto(
            'EP9000-PPSA01285_00-RETURNALGAME0001',
            'Returnal™ Digital Edition',
          ),
        ],
        { lookup: noNames },
      );

      expect(mockedSearch).not.toHaveBeenCalled();
      expect(report).toMatchObject({ inList: 1, resolvedByName: 0 });
    });

    it('il titleId è per console: l’id di un’altra console non è lo stesso gioco, e si ripiega sul nome', async () => {
      const game = await createGame({ igdbId: 113112, name: 'Hades' });
      await db
        .insert(schema.externalIds)
        .values({ gameId: game.id, source: 'psn', externalId: 'CUSA13801_00' });
      mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);

      const report = await syncStoreWishlist(
        psn,
        [prodotto('EP0002-PPSA99999_00-HADES')],
        { lookup: noNames },
      );

      expect(mockedSearch).toHaveBeenCalledTimes(1);
      expect(report).toMatchObject({ inList: 1, resolvedByName: 1 });
      expect(
        (await db.select().from(schema.externalIds)).map((r) => r.externalId),
      ).toEqual(expect.arrayContaining(['CUSA13801_00', 'PPSA99999_00']));
    });

    it('due id di prodotto con lo stesso titleId sono lo stesso gioco', async () => {
      const game = await createGame({ igdbId: 113112, name: 'Hades' });
      await db
        .insert(schema.externalIds)
        .values({ gameId: game.id, source: 'psn', externalId: 'CUSA13801_00' });

      const report = await syncStoreWishlist(
        psn,
        [
          prodotto('EP0002-CUSA13801_00-HADES'),
          prodotto('UP0002-CUSA13801_00-HADESUS'),
        ],
        { lookup: noNames },
      );

      expect(mockedSearch).not.toHaveBeenCalled();
      expect(report).toMatchObject({ total: 2, inList: 1, unresolved: 0 });
    });

    it('un id senza titleId si lega per nome ma non scrive niente nella tabella condivisa', async () => {
      mockedSearch.mockResolvedValue([hit(113112, 'Hades')]);

      const report = await syncStoreWishlist(
        psn,
        [prodotto('NIENTE-TITLEID')],
        {
          lookup: noNames,
        },
      );

      expect(report).toMatchObject({ inList: 1, resolvedByName: 1 });
      expect(await db.select().from(schema.externalIds)).toEqual([]);
    });
  });
});

describe('lookupNames', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const pending = (n: number) =>
    Array.from({ length: n }, (_, i) => entry(String(1000 + i)));

  it('Steam: nome e tipo, aspettando fra una richiesta e l’altra', async () => {
    mockedSteamDetails
      .mockResolvedValueOnce({ name: 'Core Keeper', type: 'game' })
      .mockResolvedValueOnce({ name: 'Colonna sonora', type: 'music' })
      .mockResolvedValueOnce(null);

    const promise = lookupNames('steam', pending(3));
    await vi.advanceTimersByTimeAsync(10_000);
    const found = await promise;

    expect(found.get('1000')).toEqual({ name: 'Core Keeper', isAddon: false });
    expect(found.get('1001')).toEqual({
      name: 'Colonna sonora',
      isAddon: true,
    });
    // Un'app ritirata non c'è: resta col ripiego.
    expect(found.has('1002')).toBe(false);
  });

  it('GOG: titolo, tipo, pagina e immagine', async () => {
    mockedGogProduct.mockResolvedValueOnce({
      title: 'Songs of the Past',
      slug: 'songs_of_the_past',
      gameType: 'pack',
      imageUrl: 'https://images-2.gog-statics.com/x.jpg',
    });

    const promise = lookupNames('gog', pending(1));
    await vi.advanceTimersByTimeAsync(1000);

    expect((await promise).get('1000')).toEqual({
      name: 'Songs of the Past',
      isAddon: true,
      storePage: '/game/songs_of_the_past',
      imageUrl: 'https://images-2.gog-statics.com/x.jpg',
    });
  });

  it('si ferma alla prima risposta che non è «non c’è», e tiene quello che ha', async () => {
    mockedSteamDetails
      .mockResolvedValueOnce({ name: 'Uno', type: 'game' })
      .mockRejectedValueOnce(new Error('Steam appdetails: 429'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = lookupNames('steam', pending(5));
    await vi.advanceTimersByTimeAsync(20_000);
    const found = await promise;

    expect([...found.keys()]).toEqual(['1000']);
    expect(mockedSteamDetails).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('non chiede più del tetto per aggiornamento', async () => {
    mockedSteamDetails.mockResolvedValue({ name: 'X', type: 'game' });

    const promise = lookupNames('steam', pending(NAME_LOOKUP_CAP + 20));
    await vi.advanceTimersByTimeAsync(NAME_LOOKUP_CAP * 2000);
    await promise;

    expect(mockedSteamDetails).toHaveBeenCalledTimes(NAME_LOOKUP_CAP);
  });
});

describe('importStoreWishlist', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  const steamItem = (appId: string, name = `App ${appId}`) => ({
    externalId: appId,
    name,
    addedAt: new Date('2026-10-01T10:00:00Z'),
  });

  it('Steam col login legge col token, e il pacchetto arriva in lista', async () => {
    const acct = await account(userId, 'steam', {
      credentials: Buffer.from('x'),
    });
    await knownSteamGame('Hades', '1145360');
    mockedSteamToken.mockResolvedValue({
      accessToken: 'token-di-prova',
      renewable: true,
    });
    mockedSteamWishlist.mockResolvedValue([steamItem('1145360')]);

    const report = await importStoreWishlist(acct);

    expect(mockedSteamWishlist).toHaveBeenCalledWith(
      acct.externalAccountId,
      'token-di-prova',
    );
    expect(report.inList).toBe(1);
    // La data di aggiunta arriva dal negozio fino alla lista.
    expect((await gamesIn(report.listId))[0]!.addedAt.toISOString()).toBe(
      '2026-10-01T10:00:00.000Z',
    );
  });

  it('Steam senza login usa la chiave: niente token', async () => {
    const acct = await account(userId, 'steam');
    await knownSteamGame('Hades', '1145360');
    mockedSteamWishlist.mockResolvedValue([steamItem('1145360')]);

    await importStoreWishlist(acct);

    expect(mockedSteamToken).not.toHaveBeenCalled();
    expect(mockedSteamWishlist).toHaveBeenCalledWith(
      acct.externalAccountId,
      undefined,
    );
  });

  it('Steam con la chiave e nessuna voce: non si sa se è vuota, e la lista non si tocca', async () => {
    const acct = await account(userId, 'steam');
    await knownSteamGame('Hades', '1145360');
    mockedSteamWishlist.mockResolvedValueOnce([steamItem('1145360')]);
    const { listId } = await importStoreWishlist(acct);

    mockedSteamWishlist.mockResolvedValueOnce([]);
    await expect(importStoreWishlist(acct)).rejects.toBeInstanceOf(
      SteamWishlistNotVisibleError,
    );

    expect(await gamesIn(listId)).toHaveLength(1);
  });

  it('Steam col token e nessuna voce: è vuota davvero, e la lista si svuota', async () => {
    const acct = await account(userId, 'steam', {
      credentials: Buffer.from('x'),
    });
    await knownSteamGame('Hades', '1145360');
    mockedSteamToken.mockResolvedValue({
      accessToken: 't',
      renewable: true,
    });
    mockedSteamWishlist.mockResolvedValueOnce([steamItem('1145360')]);
    const { listId } = await importStoreWishlist(acct);

    mockedSteamWishlist.mockResolvedValueOnce([]);
    await importStoreWishlist(acct);

    expect(await gamesIn(listId)).toEqual([]);
  });

  it('Steam: un token web rifiutato ripiega sulla chiave; un login morto va rifatto', async () => {
    const acct = await account(userId, 'steam', {
      credentials: Buffer.from('x'),
    });
    await knownSteamGame('Hades', '1145360');

    // Token web (non rinnovabile): si ripiega sulla chiave.
    mockedSteamToken.mockResolvedValueOnce({
      accessToken: 'scaduto',
      renewable: false,
    });
    mockedSteamWishlist
      .mockRejectedValueOnce(new SteamUnauthorizedError('GetWishlist', 401))
      .mockResolvedValueOnce([steamItem('1145360')]);
    expect((await importStoreWishlist(acct)).inList).toBe(1);
    expect(mockedSteamWishlist).toHaveBeenLastCalledWith(
      acct.externalAccountId,
    );

    // Login (rinnovabile) rifiutato: va ricollegato.
    mockedSteamToken.mockResolvedValueOnce({
      accessToken: 'morto',
      renewable: true,
    });
    mockedSteamWishlist.mockRejectedValueOnce(
      new SteamUnauthorizedError('GetWishlist', 403),
    );
    await expect(importStoreWishlist(acct)).rejects.toBeInstanceOf(
      StoreReauthRequiredError,
    );
    const [riga] = await db
      .select({ status: schema.storeAccounts.status })
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, acct.id));
    expect(riga?.status).toBe('needs_reauth');
  });

  it('GOG: legge col token del negozio; un rifiuto manda l’account in needs_reauth', async () => {
    const acct = await account(userId, 'gog');
    mockedToken.mockResolvedValue('token-gog');
    mockedGogWishlist.mockResolvedValueOnce([]);

    await importStoreWishlist(acct);
    expect(mockedGogWishlist).toHaveBeenCalledWith('token-gog');
    expect((await listOf(acct.id))!.name).toBe('GOG · prova');

    mockedGogWishlist.mockRejectedValueOnce(new GogAuthError('revocato'));
    await expect(importStoreWishlist(acct)).rejects.toBeInstanceOf(
      StoreReauthRequiredError,
    );
  });

  it('PSN: un rifiuto manda l’account in needs_reauth', async () => {
    const acct = await account(userId, 'psn');
    mockedToken.mockResolvedValue('token-psn');
    mockedPsnWishlist.mockRejectedValueOnce(new PsnAuthError('revocato'));

    await expect(importStoreWishlist(acct)).rejects.toBeInstanceOf(
      StoreReauthRequiredError,
    );
  });

  it('PSN: legge col token del negozio e risolve per nome', async () => {
    const acct = await account(userId, 'psn', { displayName: 'sanvisimo81' });
    mockedToken.mockResolvedValue('token-psn');
    mockedPsnWishlist.mockResolvedValue([
      {
        externalId: 'EP9000-PPSA01285_00-RETURNALGAME0001',
        name: 'Returnal',
        platforms: ['PS5'],
        classification: 'FULL_GAME',
        imageUrl: null,
      },
    ]);
    mockedSearch.mockResolvedValue([hit(125174, 'Returnal')]);

    const report = await importStoreWishlist(acct);

    expect(report).toMatchObject({ inList: 1, resolvedByName: 1 });
    // Si scrive il titleId, il pezzo di mezzo dell'id di prodotto.
    expect(
      (await db.select().from(schema.externalIds)).map((r) => [
        r.source,
        r.externalId,
      ]),
    ).toEqual([['psn', 'PPSA01285_00']]);
  });

  it('PSN: la copertina del negozio arriva alla voce che non si riconosce', async () => {
    const acct = await account(userId, 'psn');
    mockedToken.mockResolvedValue('token-psn');
    mockedPsnWishlist.mockResolvedValue([
      {
        externalId: 'EP0001-SCONOSCIUTO',
        name: 'Un gioco che IGDB non ha',
        platforms: ['PS5'],
        classification: 'FULL_GAME',
        imageUrl: 'https://image.api.playstation.com/vulcan/img/copertina.png',
      },
    ]);

    const report = await importStoreWishlist(acct);

    expect(report).toMatchObject({ inList: 0, unresolved: 1 });
    expect((await unresolvedOf(acct.id))[0]!.imageUrl).toBe(
      'https://image.api.playstation.com/vulcan/img/copertina.png',
    );
  });

  it('un negozio senza wishlist alza, e non crea niente', async () => {
    const acct = await account(userId, 'steam');
    const epic = { ...acct, store: 'epic' as const };

    await expect(importStoreWishlist(epic)).rejects.toThrow(/Nessuna wishlist/);
    expect(await listOf(acct.id)).toBeUndefined();
  });
});
