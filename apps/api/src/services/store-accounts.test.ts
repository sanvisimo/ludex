import { storeAccountName } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  createUser,
  linkSteamAccount as seedAccount,
  linkStoreAccount,
} from '../../test/factories';
import { fetchEaIdentity } from '../external/ea';
import {
  exchangeNintendoCode,
  fetchNintendoProfile,
  NintendoAuthError,
  refreshNintendoTokens,
} from '../external/nintendo';
import {
  fetchSteamLibrary,
  fetchSteamPersonaName,
  resolveSteamId,
  SteamLibraryNotVisibleError,
} from '../external/steam';
import { refreshSteamTokens, SteamAuthError } from '../external/steam-auth';
import {
  decryptCredentials,
  encryptCredentials,
  resetStoreTokenKey,
  sameCredentials,
} from '../lib/crypto';
import {
  enqueueImport,
  enqueueWishlistImport,
  isImportRunning,
  isWishlistImportRunning,
} from '../queue/imports';
import {
  EaTokenError,
  linkNintendoAccount,
  nintendoCredentials,
  linkSteamAccount,
  linkStore,
  listStoreAccounts,
  NintendoCodeError,
  renameStoreAccount,
  StoreAccountMismatchError,
  StoreReauthRequiredError,
  storeAccessToken,
  storeLoginUrl,
  deleteStoreWishlist,
  requestWishlistImport,
  setPlayedThreshold,
  syncAllStoreAccounts,
  unlinkImpact,
  unlinkStoreAccount,
} from './store-accounts';

vi.mock('../external/steam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/steam')>()),
  resolveSteamId: vi.fn(),
  fetchSteamPersonaName: vi.fn(),
  fetchSteamLibrary: vi.fn(),
}));
vi.mock('../external/steam-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/steam-auth')>()),
  refreshSteamTokens: vi.fn(),
}));
vi.mock('../external/nintendo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/nintendo')>()),
  exchangeNintendoCode: vi.fn(),
  fetchNintendoProfile: vi.fn(),
  refreshNintendoTokens: vi.fn(),
}));
vi.mock('../external/ea', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/ea')>()),
  fetchEaIdentity: vi.fn(),
}));
vi.mock('../queue/imports', () => ({
  isImportRunning: vi.fn(),
  enqueueImport: vi.fn(),
  isWishlistImportRunning: vi.fn(),
  enqueueWishlistImport: vi.fn(),
}));

const mockedResolve = vi.mocked(resolveSteamId);
const mockedPersona = vi.mocked(fetchSteamPersonaName);
const mockedLibrary = vi.mocked(fetchSteamLibrary);
const mockedRefresh = vi.mocked(refreshSteamTokens);
const mockedExchangeNintendo = vi.mocked(exchangeNintendoCode);
const mockedRefreshNintendo = vi.mocked(refreshNintendoTokens);
const mockedProfileNintendo = vi.mocked(fetchNintendoProfile);
const mockedRunning = vi.mocked(isImportRunning);
const mockedEaIdentity = vi.mocked(fetchEaIdentity);
const mockedEnqueue = vi.mocked(enqueueImport);
const mockedWishlistRunning = vi.mocked(isWishlistImportRunning);
const mockedWishlistEnqueue = vi.mocked(enqueueWishlistImport);

/**
 * Un gioco nel backlog con un possesso, e da quale account viene.
 *
 * `storeAccountId` è il punto di tutti i test qui sotto: senza, due account
 * dello stesso negozio scrivono lo stesso possesso e scollegarne uno non
 * saprebbe quali righe erano sue.
 */
async function ownedGame(
  userId: string,
  accountId: string | null,
  store: 'steam' | 'amazon' = 'amazon',
  over: { rating?: number } = {},
) {
  const game = await createGame();
  const [entry] = await db
    .insert(schema.backlog)
    .values({ userId, gameId: game.id, rating: over.rating ?? null })
    .returning({ id: schema.backlog.id });

  await db.insert(schema.ownerships).values({
    backlogId: entry!.id,
    platformSlug: 'pc_windows',
    store,
    storeAccountId: accountId,
  });

  return { gameId: game.id, backlogId: entry!.id };
}

describe('account di negozio', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
    mockedRunning.mockResolvedValue(false);
    mockedPersona.mockResolvedValue(null);
  });

  it("collega risolvendo quello che l'utente ha incollato", async () => {
    mockedResolve.mockResolvedValue('76561198015402862');

    const account = await linkSteamAccount(
      userId,
      'https://steamcommunity.com/id/pippo',
    );

    expect(account).toMatchObject({
      store: 'steam',
      externalAccountId: '76561198015402862',
    });
  });

  it("ricollegando lo stesso account sovrascrive e dimentica l'ultima importazione", async () => {
    mockedResolve.mockResolvedValue('76561190000000001');
    const primo = await linkSteamAccount(userId, 'pippo');
    await db
      .update(schema.storeAccounts)
      .set({ lastSyncAt: new Date() })
      .where(eq(schema.storeAccounts.id, primo.id));

    const secondo = await linkSteamAccount(userId, 'pippo');

    // Stessa riga, non una seconda: è il gesto che rimette a posto un
    // `needs_reauth`, e la libreria di prima non è quella di adesso.
    expect(secondo.id).toBe(primo.id);
    expect(secondo.lastSyncAt).toBeNull();
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(1);
  });

  it('collegando un account diverso sullo stesso negozio ne aggiunge uno', async () => {
    // Il caso vero: due account Amazon, o due Steam. Prima questo era un
    // ricollegamento e il primo account spariva, lasciandosi dietro i suoi
    // giochi senza niente che ricordasse da dove venissero.
    mockedResolve.mockResolvedValue('76561190000000001');
    const primo = await linkSteamAccount(userId, 'primo');
    mockedResolve.mockResolvedValue('76561190000000002');
    const secondo = await linkSteamAccount(userId, 'secondo');

    expect(secondo.id).not.toBe(primo.id);
    await expect(listStoreAccounts(userId)).resolves.toHaveLength(2);
  });

  it('scollegando con `keep` tiene i giochi e ricorda da quale account venivano', async () => {
    const account = await linkStoreAccount(userId, 'amazon');
    const { backlogId } = await ownedGame(userId, account.id);
    await db.insert(schema.unresolvedImports).values({
      userId,
      store: 'amazon',
      storeAccountId: account.id,
      externalId: '931180',
      name: 'Conan Exiles - Public Beta Client',
    });

    await unlinkStoreAccount(userId, account.id, 'keep');

    // I giochi importati restano suoi, come se li avesse inseriti a mano.
    expect(await db.select().from(schema.backlog)).toHaveLength(1);
    // E il possesso continua a dire da dove veniva: è il motivo per cui la riga
    // dell'account sopravvive invece di essere cancellata.
    const [possesso] = await db
      .select()
      .from(schema.ownerships)
      .where(eq(schema.ownerships.backlogId, backlogId));
    expect(possesso?.storeAccountId).toBe(account.id);

    const [riga] = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, account.id));
    expect(riga).toMatchObject({ status: 'unlinked', credentials: null });

    // Gli scarti invece senza l'account non vogliono più dire niente.
    expect(await db.select().from(schema.unresolvedImports)).toHaveLength(0);
    // E un account scollegato non è più un account collegato.
    await expect(listStoreAccounts(userId)).resolves.toEqual([]);
  });

  it('scollegando con `purge` porta via i possessi e i giochi rimasti senza', async () => {
    const account = await linkStoreAccount(userId, 'amazon');
    const solo = await ownedGame(userId, account.id);
    const anche = await ownedGame(userId, account.id);
    // Questo ce l'ha anche su Steam: il possesso Amazon se ne va, il gioco no.
    await db.insert(schema.ownerships).values({
      backlogId: anche.backlogId,
      platformSlug: 'pc_windows',
      store: 'steam',
    });

    await unlinkStoreAccount(userId, account.id, 'purge');

    const rimasti = await db.select().from(schema.backlog);
    expect(rimasti).toHaveLength(1);
    expect(rimasti[0]?.id).toBe(anche.backlogId);

    // `games` non si tocca mai: il catalogo è condiviso, e il prossimo utente
    // che importa quel gioco non deve ripagarne l'enrichment perché qualcun
    // altro ha scollegato un account.
    const catalogo = await db
      .select({ id: schema.games.id })
      .from(schema.games);
    expect(catalogo.map((row) => row.id).sort()).toEqual(
      [solo.gameId, anche.gameId].sort(),
    );

    expect(await db.select().from(schema.storeAccounts)).toHaveLength(0);
  });

  it.each(['keep', 'purge'] as const)(
    'scollegando con `%s` porta via anche la wishlist di quell’account, e non quella degli altri',
    async (mode) => {
      const wishlistOf = async (
        storeAccountId: string,
        store: 'amazon' | 'gog',
      ) => {
        const [list] = await db
          .insert(schema.playlists)
          .values({
            userId,
            kind: 'store_wishlist',
            name: `${store} · prova`,
            query: null,
            storeAccountId,
          })
          .returning({ id: schema.playlists.id });
        const game = await createGame();
        await db
          .insert(schema.wishlistItems)
          .values({ listId: list!.id, gameId: game.id });
        await db.insert(schema.wishlistUnresolved).values({
          userId,
          storeAccountId,
          store,
          externalId: '1',
          name: 'Voce non riconosciuta',
        });
      };
      const account = await linkStoreAccount(userId, 'amazon');
      const other = await linkStoreAccount(userId, 'gog');
      await wishlistOf(account.id, 'amazon');
      await wishlistOf(other.id, 'gog');

      await unlinkStoreAccount(userId, account.id, mode);

      // Una lista di negozio non si cancella da sé: se restasse, sarebbe orfana.
      const lists = await db.select().from(schema.playlists);
      expect(lists.map((l) => l.storeAccountId)).toEqual([other.id]);
      expect(await db.select().from(schema.wishlistItems)).toHaveLength(1);
      expect(
        (await db.select().from(schema.wishlistUnresolved)).map(
          (row) => row.storeAccountId,
        ),
      ).toEqual([other.id]);
    },
  );

  it('conta cosa porterebbe via lo scollegamento, prima di portarlo via', async () => {
    const account = await linkStoreAccount(userId, 'amazon');
    // Sta solo qui e ha un voto: è la riga che fa esitare.
    await ownedGame(userId, account.id, 'amazon', { rating: 4 });
    // Sta solo qui e non ha niente di suo, ma è nascosto: se ne andrebbe
    // senza che l'utente lo veda in lista, ed è per questo che si conta.
    const nascosto = await ownedGame(userId, account.id);
    await db
      .update(schema.backlog)
      .set({ hiddenAt: new Date() })
      .where(eq(schema.backlog.id, nascosto.backlogId));
    // Sta anche altrove: non sparirebbe.
    const anche = await ownedGame(userId, account.id);
    await db.insert(schema.ownerships).values({
      backlogId: anche.backlogId,
      platformSlug: 'pc_windows',
      store: 'steam',
    });

    await expect(unlinkImpact(userId, account.id)).resolves.toEqual({
      ownerships: 3,
      removedEntries: 2,
      withPersonalData: 1,
      hiddenEntries: 1,
    });
  });

  it('un possesso senza account non conta come possesso di un altro account', async () => {
    // I possessi inseriti a mano, e quelli importati prima che gli account
    // fossero più d'uno, hanno l'account nullo. Scollegando, quel gioco ha
    // ancora un possesso e non deve sparire: `is distinct from` e non `<>`.
    const account = await linkStoreAccount(userId, 'amazon');
    const gioco = await ownedGame(userId, account.id);
    await db.insert(schema.ownerships).values({
      backlogId: gioco.backlogId,
      platformSlug: 'pc_windows',
      store: 'gog',
      storeAccountId: null,
    });

    await expect(unlinkImpact(userId, account.id)).resolves.toMatchObject({
      removedEntries: 0,
    });
  });

  it("prende il nome che l'utente si è dato su Steam", async () => {
    mockedResolve.mockResolvedValue('76561198015402862');
    mockedPersona.mockResolvedValue('sanvisimo');

    const account = await linkSteamAccount(userId, 'pippo');

    // Senza, `/account` mostrerebbe uno SteamID64 nudo, che non dice niente a
    // nessuno.
    expect(account.displayName).toBe('sanvisimo');
  });

  it('un nome che non si riesce a leggere non fa fallire il collegamento', async () => {
    mockedResolve.mockResolvedValue('76561198015402862');
    // Profilo privato, Steam giù, chiave a limite: è decorazione, e la libreria
    // si legge con lo SteamID, non col nome.
    mockedPersona.mockResolvedValue(null);

    const account = await linkSteamAccount(userId, 'pippo');

    expect(account).toMatchObject({
      externalAccountId: '76561198015402862',
      displayName: null,
    });
  });

  it('ricollegando, un nome che non si riesce a leggere non cancella quello che c’era', async () => {
    mockedResolve.mockResolvedValue('76561198015402862');
    mockedPersona.mockResolvedValue('sanvisimo');
    await linkSteamAccount(userId, 'pippo');

    // Il secondo collegamento — per esempio il login famiglia — non riesce a
    // rileggere il nome: il vecchio resta, non diventa uno SteamID64 nudo.
    mockedPersona.mockResolvedValue(null);
    const account = await linkSteamAccount(userId, 'pippo');

    expect(account.displayName).toBe('sanvisimo');
  });

  it('ricollegando, un nome nuovo sostituisce quello vecchio', async () => {
    mockedResolve.mockResolvedValue('76561198015402862');
    mockedPersona.mockResolvedValue('sanvisimo');
    await linkSteamAccount(userId, 'pippo');

    mockedPersona.mockResolvedValue('simone');
    const account = await linkSteamAccount(userId, 'pippo');

    expect(account.displayName).toBe('simone');
  });

  it("l'etichetta la scrive l'utente e vince sul nome del negozio", async () => {
    // È il caso Amazon: due account della stessa persona rendono lo stesso
    // `given_name`, quindi il negozio da solo non li separa.
    const account = await linkStoreAccount(userId, 'amazon');
    await db
      .update(schema.storeAccounts)
      .set({ displayName: 'Simone' })
      .where(eq(schema.storeAccounts.id, account.id));

    const rinominato = await renameStoreAccount(
      userId,
      account.id,
      ' di famiglia ',
    );

    expect(rinominato).toMatchObject({
      label: 'di famiglia',
      displayName: 'Simone',
    });
    expect(storeAccountName(rinominato!)).toBe('di famiglia');
  });

  it("un'etichetta vuota la toglie, e si torna al nome del negozio", async () => {
    const account = await linkStoreAccount(userId, 'amazon');
    await renameStoreAccount(userId, account.id, 'di famiglia');

    const ripulito = await renameStoreAccount(userId, account.id, '   ');

    // Cancellare l'etichetta è un gesto legittimo e non merita una mutazione sua.
    expect(ripulito?.label).toBeNull();
  });

  it("non rinomina l'account di un altro utente", async () => {
    const altrui = await linkStoreAccount(await createUser(), 'amazon');

    await expect(
      renameStoreAccount(userId, altrui.id, 'mio'),
    ).resolves.toBeUndefined();
  });

  it("dice se c'è un import in corso, leggendolo dalla coda", async () => {
    await seedAccount(userId);
    mockedRunning.mockResolvedValue(true);

    await expect(listStoreAccounts(userId)).resolves.toMatchObject([
      { syncing: true },
    ]);
  });

  it('non mostra gli account di altri utenti', async () => {
    await seedAccount(await createUser());
    await expect(listStoreAccounts(userId)).resolves.toEqual([]);
  });

  it("non scollega l'account di un altro utente", async () => {
    const altrui = await linkStoreAccount(await createUser(), 'amazon');

    await expect(
      unlinkStoreAccount(userId, altrui.id, 'purge'),
    ).resolves.toBeNull();
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(1);
  });

  describe('importa la wishlist (15e)', () => {
    beforeEach(() => {
      mockedWishlistEnqueue.mockClear();
      mockedWishlistRunning.mockReset().mockResolvedValue(false);
    });

    it('accoda quella del negozio dell’account, senza toccare la libreria', async () => {
      const gog = await linkStoreAccount(userId, 'gog');

      await expect(requestWishlistImport(userId, gog.id)).resolves.toBe(
        'queued',
      );
      expect(mockedWishlistEnqueue).toHaveBeenCalledWith('gog', {
        storeAccountId: gog.id,
      });
      expect(mockedEnqueue).not.toHaveBeenCalled();
    });

    it('l’elenco degli account dice se la wishlist si sta importando, quando e com’è andata', async () => {
      const gog = await linkStoreAccount(userId, 'gog');
      const steam = await linkStoreAccount(userId, 'steam');
      const synced = new Date('2026-10-01T10:00:00Z');
      await db
        .update(schema.storeAccounts)
        .set({ wishlistSyncedAt: synced, wishlistError: 'not_visible' })
        .where(eq(schema.storeAccounts.id, steam.id));
      mockedWishlistRunning.mockImplementation(async (id) => id === gog.id);

      const rows = await listStoreAccounts(userId);

      expect(rows.find((r) => r.id === gog.id)).toMatchObject({
        wishlistSyncing: true,
        wishlistSyncedAt: null,
        wishlistError: null,
      });
      expect(rows.find((r) => r.id === steam.id)).toMatchObject({
        wishlistSyncing: false,
        wishlistSyncedAt: synced,
        wishlistError: 'not_visible',
      });
    });

    it('non accoda se è già in corso, se va ricollegato o se il negozio non ne ha una', async () => {
      const steam = await linkStoreAccount(userId, 'steam');
      const scaduto = await linkStoreAccount(userId, 'psn');
      const epic = await linkStoreAccount(userId, 'epic');
      await db
        .update(schema.storeAccounts)
        .set({ status: 'needs_reauth' })
        .where(eq(schema.storeAccounts.id, scaduto.id));
      mockedWishlistRunning.mockImplementation(async (id) => id === steam.id);

      await expect(requestWishlistImport(userId, steam.id)).resolves.toBe(
        'running',
      );
      await expect(requestWishlistImport(userId, scaduto.id)).resolves.toBe(
        'needs_reauth',
      );
      await expect(requestWishlistImport(userId, epic.id)).resolves.toBe(
        'unsupported',
      );
      expect(mockedWishlistEnqueue).not.toHaveBeenCalled();
    });

    it('un account di un altro utente o scollegato non esiste', async () => {
      const altro = await linkStoreAccount(await createUser(), 'gog');
      const scollegato = await linkStoreAccount(userId, 'gog');
      await db
        .update(schema.storeAccounts)
        .set({ status: 'unlinked' })
        .where(eq(schema.storeAccounts.id, scollegato.id));

      await expect(requestWishlistImport(userId, altro.id)).resolves.toBe(
        'not_found',
      );
      await expect(requestWishlistImport(userId, scollegato.id)).resolves.toBe(
        'not_found',
      );
      expect(mockedWishlistEnqueue).not.toHaveBeenCalled();
    });
  });

  describe('cancella la wishlist di un negozio', () => {
    beforeEach(() =>
      mockedWishlistRunning.mockReset().mockResolvedValue(false),
    );

    const storeList = async (
      accountId: string,
      store: 'gog' | 'steam',
      name: string,
    ) => {
      const [list] = await db
        .insert(schema.playlists)
        .values({
          userId,
          kind: 'store_wishlist',
          name,
          query: null,
          storeAccountId: accountId,
        })
        .returning({ id: schema.playlists.id });
      const game = await createGame();
      await db
        .insert(schema.wishlistItems)
        .values({ listId: list!.id, gameId: game.id });
      await db.insert(schema.wishlistUnresolved).values({
        userId,
        storeAccountId: accountId,
        store,
        externalId: '1',
        name: 'Voce da sistemare',
      });
      return list!.id;
    };

    it('toglie la lista, le sue voci e quelle da sistemare, e riporta l’account com’era; l’altra lista resta', async () => {
      const gog = await linkStoreAccount(userId, 'gog');
      const steam = await linkStoreAccount(userId, 'steam');
      const listId = await storeList(gog.id, 'gog', 'GOG · prova');
      await storeList(steam.id, 'steam', 'Steam · prova');
      await db
        .update(schema.storeAccounts)
        .set({ wishlistSyncedAt: new Date(), wishlistError: 'failed' })
        .where(eq(schema.storeAccounts.id, gog.id));

      await expect(deleteStoreWishlist(userId, listId)).resolves.toBe('ok');

      expect(
        (await db.select().from(schema.playlists)).map((l) => l.name),
      ).toEqual(['Steam · prova']);
      expect(await db.select().from(schema.wishlistItems)).toHaveLength(1);
      expect(
        (await db.select().from(schema.wishlistUnresolved)).map(
          (row) => row.storeAccountId,
        ),
      ).toEqual([steam.id]);
      const [row] = await db
        .select({
          at: schema.storeAccounts.wishlistSyncedAt,
          error: schema.storeAccounts.wishlistError,
          status: schema.storeAccounts.status,
        })
        .from(schema.storeAccounts)
        .where(eq(schema.storeAccounts.id, gog.id));
      // L'account resta collegato; di quella wishlist non resta niente.
      expect(row).toEqual({ at: null, error: null, status: 'ok' });
    });

    it('non la cancella mentre l’import gira: la riscriverebbe', async () => {
      const gog = await linkStoreAccount(userId, 'gog');
      const listId = await storeList(gog.id, 'gog', 'GOG · prova');
      mockedWishlistRunning.mockResolvedValue(true);

      await expect(deleteStoreWishlist(userId, listId)).resolves.toBe(
        'running',
      );

      expect(await db.select().from(schema.playlists)).toHaveLength(1);
      expect(await db.select().from(schema.wishlistUnresolved)).toHaveLength(1);
    });

    it('una lista di un altro utente, una a mano o inesistente non esiste', async () => {
      const other = await createUser();
      const acct = await linkStoreAccount(other, 'gog');
      const [theirs] = await db
        .insert(schema.playlists)
        .values({
          userId: other,
          kind: 'store_wishlist',
          name: 'GOG · loro',
          query: null,
          storeAccountId: acct.id,
        })
        .returning({ id: schema.playlists.id });
      const [manual] = await db
        .insert(schema.playlists)
        .values({ userId, kind: 'wishlist', name: 'A mano', query: null })
        .returning({ id: schema.playlists.id });

      for (const id of [
        theirs!.id,
        manual!.id,
        '00000000-0000-4000-8000-0000000000ff',
      ])
        await expect(deleteStoreWishlist(userId, id)).resolves.toBe(
          'not_found',
        );

      expect(await db.select().from(schema.playlists)).toHaveLength(2);
    });
  });

  describe('aggiorna tutti gli account', () => {
    beforeEach(() => mockedEnqueue.mockClear());

    it('accoda gli account collegati, e salta e conta gli altri', async () => {
      const ok = await linkStoreAccount(userId, 'gog');
      const running = await linkStoreAccount(userId, 'amazon');
      const scaduto = await linkStoreAccount(userId, 'psn');
      const scollegato = await linkStoreAccount(userId, 'epic');
      await db
        .update(schema.storeAccounts)
        .set({ status: 'needs_reauth' })
        .where(eq(schema.storeAccounts.id, scaduto.id));
      await db
        .update(schema.storeAccounts)
        .set({ status: 'unlinked' })
        .where(eq(schema.storeAccounts.id, scollegato.id));
      mockedRunning.mockImplementation(async (id) => id === running.id);

      await expect(syncAllStoreAccounts(userId)).resolves.toEqual({
        queued: 1,
        alreadyRunning: 1,
        needsReauth: 1,
      });
      // Lo scollegato non è nemmeno contato: per l'utente non esiste più.
      expect(mockedEnqueue).toHaveBeenCalledTimes(1);
      expect(mockedEnqueue).toHaveBeenCalledWith('gog', {
        storeAccountId: ok.id,
      });
    });

    it('salta EA, che si reimporta incollando un token nuovo', async () => {
      await linkStoreAccount(userId, 'ea');
      const gog = await linkStoreAccount(userId, 'gog');
      mockedRunning.mockResolvedValue(false);

      await expect(syncAllStoreAccounts(userId)).resolves.toEqual({
        queued: 1,
        alreadyRunning: 0,
        needsReauth: 0,
      });
      expect(mockedEnqueue).toHaveBeenCalledTimes(1);
      expect(mockedEnqueue).toHaveBeenCalledWith('gog', {
        storeAccountId: gog.id,
      });
    });

    it('non tocca gli account di altri utenti', async () => {
      await linkStoreAccount(await createUser(), 'gog');

      await expect(syncAllStoreAccounts(userId)).resolves.toEqual({
        queued: 0,
        alreadyRunning: 0,
        needsReauth: 0,
      });
      expect(mockedEnqueue).not.toHaveBeenCalled();
    });
  });
});

describe('ricollegamento', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedPersona.mockResolvedValue(null);
  });

  it("rifiuta un login fatto con un altro account, e non tocca l'altro", async () => {
    mockedResolve.mockResolvedValue('76561190000000001');
    const giusto = await linkSteamAccount(userId, 'giusto');
    mockedResolve.mockResolvedValue('76561190000000002');
    const altro = await linkSteamAccount(userId, 'altro');
    await db
      .update(schema.storeAccounts)
      .set({ lastSyncAt: new Date() })
      .where(eq(schema.storeAccounts.id, altro.id));

    // Si ricollega `giusto`, ma il negozio rende `altro`: è il caso dei due
    // Amazon legati, con la sessione del sito rimasta sull'altro account.
    await expect(
      linkSteamAccount(userId, 'altro', { relinking: giusto }),
    ).rejects.toBeInstanceOf(StoreAccountMismatchError);

    // Prima si aggiornava in silenzio la riga sbagliata, azzerandone l'import.
    const [riletta] = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, altro.id));
    expect(riletta!.lastSyncAt).not.toBeNull();
  });

  it("ricollega quando il negozio rende l'account atteso", async () => {
    mockedResolve.mockResolvedValue('76561190000000001');
    const account = await linkSteamAccount(userId, 'pippo');

    const ricollegato = await linkSteamAccount(userId, 'pippo', {
      relinking: account,
    });

    expect(ricollegato.id).toBe(account.id);
  });

  it('un collegamento Amazon nuovo prende un dispositivo nuovo ogni volta', () => {
    const primo = storeLoginUrl(userId, 'amazon');
    const secondo = storeLoginUrl(userId, 'amazon');

    expect(primo.state).toMatch(/^[0-9A-F]{32}$/);
    expect(secondo.state).not.toBe(primo.state);
  });

  it("ricollegando Amazon si riusa il dispositivo che l'account aveva", async () => {
    const serial = 'ABCDEF0123456789ABCDEF0123456789';
    const account = await linkStoreAccount(userId, 'amazon');
    const [conCredenziali] = await db
      .update(schema.storeAccounts)
      .set({ credentials: encryptCredentials({ serial }) })
      .where(eq(schema.storeAccounts.id, account.id))
      .returning();

    // Senza, ogni ricollegamento lascerebbe un «AGSLauncher» in più fra i
    // dispositivi dell'account Amazon.
    expect(storeLoginUrl(userId, 'amazon', conCredenziali).state).toBe(serial);
  });

  it('un account senza più credenziali prende un dispositivo nuovo', async () => {
    // Scollegato con `keep`: la riga c'è, il credenziale no.
    const account = await linkStoreAccount(userId, 'amazon');

    expect(storeLoginUrl(userId, 'amazon', account).state).toMatch(
      /^[0-9A-F]{32}$/,
    );
  });

  it('gli altri negozi non hanno uno state', () => {
    expect(storeLoginUrl(userId, 'gog').state).toBeNull();
    expect(storeLoginUrl(userId, 'steam')).toEqual({ url: null, state: null });
  });
});

describe('credenziale Steam (9f)', () => {
  const STEAM_ID = '76561190000000042';
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedPersona.mockResolvedValue(null);
  });

  /** Un account Steam che ha fatto il login: la riga col suo credenziale. */
  async function withLogin(expiresAt: number) {
    const account = await seedAccount(userId, STEAM_ID);
    const [row] = await db
      .update(schema.storeAccounts)
      .set({
        credentials: encryptCredentials({
          accessToken: 'vecchio',
          refreshToken: 'refresh-1',
          expiresAt,
          refreshExpiresAt: Date.now() + 200 * 86_400_000,
        }),
        credentialsExpireAt: new Date(expiresAt),
      })
      .where(eq(schema.storeAccounts.id, account.id))
      .returning();
    return row!;
  }

  const reload = async (id: string) =>
    (
      await db
        .select()
        .from(schema.storeAccounts)
        .where(eq(schema.storeAccounts.id, id))
    )[0]!;

  it("usa l'access token ancora valido senza chiamare Steam", async () => {
    const account = await withLogin(Date.now() + 3_600_000);

    expect(await storeAccessToken(account)).toBe('vecchio');
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it('lo rinnova se è scaduto, e riscrive il credenziale prima di restituirlo', async () => {
    const account = await withLogin(Date.now() - 1_000);
    const scadenza = Date.now() + 88_000_000;
    mockedRefresh.mockResolvedValue({
      accessToken: 'nuovo',
      // Steam ne ha emesso uno nuovo, e il vecchio è già morto: se non finisse
      // in tabella adesso, un import fallito a metà lascerebbe un credenziale
      // inutilizzabile.
      refreshToken: 'refresh-2',
      expiresAt: scadenza,
      refreshExpiresAt: Date.now() + 200 * 86_400_000,
    });

    expect(await storeAccessToken(account)).toBe('nuovo');

    expect(mockedRefresh).toHaveBeenCalledWith('refresh-1');
    const row = await reload(account.id);
    expect(
      decryptCredentials<{ refreshToken: string }>(row.credentials!),
    ).toMatchObject({
      accessToken: 'nuovo',
      refreshToken: 'refresh-2',
    });
    expect(row.credentialsExpireAt?.getTime()).toBe(scadenza);
    expect(row.status).toBe('ok');
  });

  it("un rifiuto di Steam manda l'account in needs_reauth", async () => {
    const account = await withLogin(Date.now() - 1_000);
    mockedRefresh.mockRejectedValue(new SteamAuthError('Steam ha rifiutato'));

    await expect(storeAccessToken(account)).rejects.toThrow(
      StoreReauthRequiredError,
    );

    expect((await reload(account.id)).status).toBe('needs_reauth');
  });

  it('una rete che cade non tocca né lo stato né il credenziale', async () => {
    const account = await withLogin(Date.now() - 1_000);
    mockedRefresh.mockRejectedValue(new Error('rete giù'));

    await expect(storeAccessToken(account)).rejects.toThrow('rete giù');

    // Il job riproverà: mandare l'utente a rifare il QR per una rete andata
    // giù sarebbe il torto peggiore.
    const row = await reload(account.id);
    expect(row.status).toBe('ok');
    expect(sameCredentials(row.credentials, account.credentials)).toBe(true);
  });

  it('un account col solo profilo non ha un access token da dare', async () => {
    const account = await seedAccount(userId, STEAM_ID);

    await expect(storeAccessToken(account)).rejects.toThrow(
      'Nessun account steam collegato',
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it('ricollegare col profilo non cancella il login', async () => {
    // Profilo e login sono due modi di collegare la stessa riga: chi ha fatto
    // il login e poi incolla il profilo non deve perdere la famiglia.
    const account = await withLogin(Date.now() + 3_600_000);
    mockedResolve.mockResolvedValue(STEAM_ID);

    const ricollegato = await linkSteamAccount(userId, 'pippo');

    expect(ricollegato.id).toBe(account.id);
    const row = await reload(account.id);
    expect(sameCredentials(row.credentials, account.credentials)).toBe(true);
    expect(row.credentialsExpireAt?.getTime()).toBe(
      account.credentialsExpireAt?.getTime(),
    );
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(1);
  });

  it('collegando il profilo legge la libreria subito, e un profilo privato non collega', async () => {
    // Un import fallito non arriva alla schermata: meglio dirlo a chi sta
    // collegando, mentre ha il dialogo aperto.
    mockedResolve.mockResolvedValue(STEAM_ID);
    mockedLibrary.mockRejectedValue(new SteamLibraryNotVisibleError(STEAM_ID));

    await expect(linkSteamAccount(userId, 'pippo')).rejects.toThrow(
      SteamLibraryNotVisibleError,
    );

    // Niente da ricordare: l'account non si è scritto.
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(0);
  });

  it('un profilo pubblico collega, dopo averne letto la libreria', async () => {
    mockedResolve.mockResolvedValue(STEAM_ID);
    mockedLibrary.mockResolvedValue([]);

    const account = await linkSteamAccount(userId, 'pippo');

    expect(mockedLibrary).toHaveBeenCalledWith(STEAM_ID);
    expect(account.store).toBe('steam');
  });

  it('con il login già fatto non serve che il profilo sia pubblico', async () => {
    // La libreria si legge col token: a profilo privato va benissimo, e
    // rifiutare il collegamento toglierebbe il profilo a chi ha già il login.
    await withLogin(Date.now() + 3_600_000);
    mockedResolve.mockResolvedValue(STEAM_ID);

    await linkSteamAccount(userId, 'pippo');

    expect(mockedLibrary).not.toHaveBeenCalled();
  });

  it("l'elenco dice se c'è un login, senza mai mostrare la credenziale", async () => {
    await withLogin(Date.now() + 3_600_000);
    await seedAccount(userId, '76561190000000043');

    const righe = await listStoreAccounts(userId);

    expect(righe.map((riga) => riga.hasLogin).sort()).toEqual([false, true]);
    expect(righe.every((riga) => !('credentials' in riga))).toBe(true);
  });

  it('collegare col profilo un account nuovo non ha credenziale, come prima', async () => {
    mockedResolve.mockResolvedValue(STEAM_ID);

    const account = await linkSteamAccount(userId, 'pippo');

    expect((await reload(account.id)).credentials).toBeNull();
  });
});

describe('Nintendo (9d)', () => {
  const ACCOUNT_ID = '3247fa748f1dd367';
  const INDIRIZZO =
    'npf5c38e31cd085304b://auth#session_token_code=IL.CODICE.X&state=lo-state&session_state=ff';
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedExchangeNintendo.mockResolvedValue({
      accessToken: 'accesso',
      refreshToken: 'sessione',
      expiresAt: Date.now() + 840_000,
      accountId: ACCOUNT_ID,
      idToken: 'idtoken',
    });
    mockedProfileNintendo.mockResolvedValue({
      country: 'IT',
      nickname: 'sanvisimo',
    });
  });

  const reload = async (id: string) =>
    (
      await db
        .select()
        .from(schema.storeAccounts)
        .where(eq(schema.storeAccounts.id, id))
    )[0]!;

  it("collega dall'indirizzo incollato, con codice e state e l'utente che lo ha chiesto", async () => {
    const account = await linkNintendoAccount(userId, INDIRIZZO);

    // Lo state sta nell'indirizzo, e con l'utente rifà il verifier.
    expect(mockedExchangeNintendo).toHaveBeenCalledWith(
      userId,
      'IL.CODICE.X',
      'lo-state',
    );
    expect(account).toMatchObject({
      store: 'nintendo',
      externalAccountId: ACCOUNT_ID,
      status: 'ok',
    });
    const riga = await reload(account.id);
    expect(
      decryptCredentials<{ refreshToken: string }>(riga.credentials!),
    ).toMatchObject({
      refreshToken: 'sessione',
    });
  });

  it('un indirizzo senza codice non chiama Nintendo e dice cosa fare', async () => {
    await expect(
      linkNintendoAccount(userId, 'https://accounts.nintendo.com/'),
    ).rejects.toBeInstanceOf(NintendoCodeError);
    expect(mockedExchangeNintendo).not.toHaveBeenCalled();
  });

  it('lo stesso account ricollegato è la stessa riga, non un doppione', async () => {
    const primo = await linkNintendoAccount(userId, INDIRIZZO);
    const secondo = await linkNintendoAccount(userId, INDIRIZZO, {
      relinking: primo,
    });

    expect(secondo.id).toBe(primo.id);
  });

  it('rifiuta un login fatto con un altro account Nintendo', async () => {
    const giusto = await linkStoreAccount(userId, 'nintendo', 'un-altro-id');

    await expect(
      linkNintendoAccount(userId, INDIRIZZO, { relinking: giusto }),
    ).rejects.toBeInstanceOf(StoreAccountMismatchError);
  });

  it('il login si apre con un indirizzo e senza state da riportare', () => {
    const { url, state } = storeLoginUrl(userId, 'nintendo');

    expect(url).toMatch(/^https:\/\/accounts\.nintendo\.com\/connect\//);
    // Lo state è dentro l'indirizzo: il client non ha niente da riportare.
    expect(state).toBeNull();
  });

  it('prende paese e nickname dal profilo e li salva', async () => {
    const account = await linkNintendoAccount(userId, INDIRIZZO);

    expect(mockedProfileNintendo).toHaveBeenCalledWith('accesso');
    expect(account.displayName).toBe('sanvisimo');
    const riga = await reload(account.id);
    expect(
      decryptCredentials<{ country: string; idToken: string }>(
        riga.credentials!,
      ),
    ).toMatchObject({ country: 'IT', idToken: 'idtoken' });
  });

  it('la claim dell’id_token vince sul profilo', async () => {
    mockedExchangeNintendo.mockResolvedValue({
      accessToken: 'accesso',
      refreshToken: 'sessione',
      expiresAt: Date.now() + 840_000,
      accountId: ACCOUNT_ID,
      idToken: 'idtoken',
      country: 'GB',
    });

    const account = await linkNintendoAccount(userId, INDIRIZZO);

    expect(
      decryptCredentials<{ country: string }>(
        (await reload(account.id)).credentials!,
      ).country,
    ).toBe('GB');
  });

  it('un profilo che non risponde non impedisce il collegamento: paese nullo', async () => {
    // L'import salterà le Virtual Game Cards e lo dirà, invece di indovinare.
    mockedProfileNintendo.mockResolvedValue(null);

    const account = await linkNintendoAccount(userId, INDIRIZZO);

    expect(account.status).toBe('ok');
    expect(account.displayName).toBeNull();
    expect(
      decryptCredentials<{ country: string | null }>(
        (await reload(account.id)).credentials!,
      ).country,
    ).toBeNull();
  });

  describe('rinnovo', () => {
    async function collegato(expiresAt: number, country?: string) {
      const account = await linkStoreAccount(userId, 'nintendo', ACCOUNT_ID);
      const [row] = await db
        .update(schema.storeAccounts)
        .set({
          credentials: encryptCredentials({
            accessToken: 'vecchio',
            refreshToken: 'sessione',
            expiresAt,
            accountId: ACCOUNT_ID,
            idToken: 'vecchio-idtoken',
            ...(country ? { country } : {}),
          }),
          credentialsExpireAt: new Date(expiresAt),
        })
        .where(eq(schema.storeAccounts.id, account.id))
        .returning();
      return row!;
    }

    it("usa l'access token ancora valido senza chiamare Nintendo", async () => {
      const account = await collegato(Date.now() + 600_000);

      expect(await storeAccessToken(account)).toBe('vecchio');
      expect(mockedRefreshNintendo).not.toHaveBeenCalled();
    });

    it('lo rinnova col session token, che resta lo stesso', async () => {
      const account = await collegato(Date.now() - 1_000);
      mockedRefreshNintendo.mockResolvedValue({
        accessToken: 'nuovo',
        refreshToken: 'sessione',
        expiresAt: Date.now() + 840_000,
        accountId: ACCOUNT_ID,
        idToken: 'nuovo-idtoken',
      });

      expect(await storeAccessToken(account)).toBe('nuovo');

      expect(mockedRefreshNintendo).toHaveBeenCalledWith('sessione');
      const riga = await reload(account.id);
      expect(
        decryptCredentials<{ accessToken: string; refreshToken: string }>(
          riga.credentials!,
        ),
      ).toMatchObject({ accessToken: 'nuovo', refreshToken: 'sessione' });
    });

    it('il rinnovo non azzera il paese preso al collegamento', async () => {
      const account = await collegato(Date.now() - 1_000, 'IT');
      // Il rinnovo non rende il paese: non lo conosce.
      mockedRefreshNintendo.mockResolvedValue({
        accessToken: 'nuovo',
        refreshToken: 'sessione',
        expiresAt: Date.now() + 840_000,
        accountId: ACCOUNT_ID,
        idToken: 'nuovo-idtoken',
      });

      await storeAccessToken(account);

      expect(
        decryptCredentials<{ country: string; idToken: string }>(
          (await reload(account.id)).credentials!,
        ),
      ).toMatchObject({ country: 'IT', idToken: 'nuovo-idtoken' });
    });

    it('`nintendoCredentials` rende access token, id_token e paese già rinnovati', async () => {
      const account = await collegato(Date.now() - 1_000, 'IT');
      mockedRefreshNintendo.mockResolvedValue({
        accessToken: 'nuovo',
        refreshToken: 'sessione',
        expiresAt: Date.now() + 840_000,
        accountId: ACCOUNT_ID,
        idToken: 'nuovo-idtoken',
      });

      expect(await nintendoCredentials(account)).toMatchObject({
        accessToken: 'nuovo',
        idToken: 'nuovo-idtoken',
        country: 'IT',
      });
    });

    it("un rifiuto di Nintendo manda l'account in needs_reauth", async () => {
      const account = await collegato(Date.now() - 1_000);
      mockedRefreshNintendo.mockRejectedValue(
        new NintendoAuthError('rifiutato'),
      );

      await expect(storeAccessToken(account)).rejects.toThrow(
        StoreReauthRequiredError,
      );

      expect((await reload(account.id)).status).toBe('needs_reauth');
    });

    it('un 429 o una rete che cade non toccano né lo stato né il credenziale', async () => {
      const account = await collegato(Date.now() - 1_000);
      mockedRefreshNintendo.mockRejectedValue(new Error('Nintendo: 429'));

      await expect(storeAccessToken(account)).rejects.toThrow('429');

      const riga = await reload(account.id);
      expect(riga.status).toBe('ok');
      expect(sameCredentials(riga.credentials, account.credentials)).toBe(true);
    });
  });
});

describe('EA (9c)', () => {
  let userId: string;
  const json = (token: string) =>
    `{"access_token":"${token}","token_type":"Bearer","expires_in":"14399"}`;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedEaIdentity.mockResolvedValue({
      accountId: '2292938939',
      displayName: 'sanvisimo',
    });
  });

  it('collega dal JSON incollato, con pd come account e il token per il job', async () => {
    const account = await linkStore(userId, 'ea', json('QVQxOjIuMDoz'));

    expect(account).toMatchObject({
      store: 'ea',
      externalAccountId: '2292938939',
      displayName: 'sanvisimo',
      status: 'ok',
      hasLogin: true,
    });
    expect(mockedEaIdentity).toHaveBeenCalledWith('QVQxOjIuMDoz');

    const [riga] = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, account.id));
    expect(
      decryptCredentials<{ accessToken: string }>(riga!.credentials!)
        .accessToken,
    ).toBe('QVQxOjIuMDoz');
    // Quattro ore, meno il minuto di margine.
    expect(riga!.credentialsExpireAt!.getTime()).toBeGreaterThan(
      Date.now() + 3.9 * 60 * 60 * 1000,
    );
  });

  it('reimportare è ricollegare: stessa riga, token nuovo', async () => {
    const prima = await linkStore(userId, 'ea', json('primo'));
    const dopo = await linkStore(userId, 'ea', json('secondo'), {
      relinking: prima,
    });

    expect(dopo.id).toBe(prima.id);
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(1);
  });

  it('distingue il browser non entrato da un testo che non è il JSON', async () => {
    await expect(
      linkStore(userId, 'ea', '{"error":"login_required"}'),
    ).rejects.toMatchObject({ name: 'EaTokenError', notLoggedIn: true });
    await expect(
      linkStore(userId, 'ea', 'QVQxOjIuMDoz'),
    ).rejects.toBeInstanceOf(EaTokenError);
    expect(mockedEaIdentity).not.toHaveBeenCalled();
  });

  it('la pagina da aprire è quella del token', () => {
    expect(storeLoginUrl(userId, 'ea').url).toMatch(
      /^https:\/\/accounts\.ea\.com\/connect\/auth\?client_id=ORIGIN_JS_SDK/,
    );
  });
});

describe('la soglia «conta come giocato»', () => {
  let userId: string;

  /** Un gioco dell'account, con le sue ore e il suo stato. */
  async function giocato(
    accountId: string,
    playtimeMinutes: number | null,
    status: 'backlog' | 'playing' | 'dropped' = 'backlog',
  ) {
    const game = await createGame();
    const [entry] = await db
      .insert(schema.backlog)
      .values({ userId, gameId: game.id, status })
      .returning({ id: schema.backlog.id });
    await db.insert(schema.ownerships).values({
      backlogId: entry!.id,
      platformSlug: 'pc_windows',
      store: 'steam',
      storeAccountId: accountId,
      playtimeMinutes,
    });
    return entry!.id;
  }

  const statoDi = async (backlogId: string) => {
    const [row] = await db
      .select({ status: schema.backlog.status })
      .from(schema.backlog)
      .where(eq(schema.backlog.id, backlogId));
    return row!.status;
  };

  beforeEach(async () => {
    userId = await createUser();
    mockedRunning.mockResolvedValue(false);
    mockedPersona.mockResolvedValue(null);
    mockedLibrary.mockResolvedValue([]);
  });

  it('si sceglie collegando, e ricollegando senza dirla resta', async () => {
    mockedResolve.mockResolvedValue('76561190000000001');

    const account = await linkSteamAccount(userId, 'pippo', {
      playedMinMinutes: 60,
    });
    expect(account.playedMinMinutes).toBe(60);

    const ricollegato = await linkSteamAccount(userId, 'pippo');
    expect(ricollegato.playedMinMinutes).toBe(60);
  });

  it('salvata, vale subito su ciò che c’è: solo da backlog, solo sopra', async () => {
    const account = await seedAccount(userId);
    const finito = await giocato(account.id, 900);
    const provato = await giocato(account.id, 25);
    const senzaOre = await giocato(account.id, null);
    const lasciato = await giocato(account.id, 900, 'dropped');

    expect(await setPlayedThreshold(userId, account.id, 60)).toBe(1);

    expect(await statoDi(finito)).toBe('played');
    expect(await statoDi(provato)).toBe('backlog');
    expect(await statoDi(senzaOre)).toBe('backlog');
    expect(await statoDi(lasciato)).toBe('dropped');
    const [row] = await listStoreAccounts(userId);
    expect(row!.playedMinMinutes).toBe(60);
  });

  it('spenta, non rimette niente in backlog', async () => {
    const account = await seedAccount(userId);
    const finito = await giocato(account.id, 900);
    await setPlayedThreshold(userId, account.id, 60);

    expect(await setPlayedThreshold(userId, account.id, null)).toBe(0);

    expect(await statoDi(finito)).toBe('played');
    const [row] = await listStoreAccounts(userId);
    expect(row!.playedMinMinutes).toBeNull();
  });

  it('vale anche su EA, che dà i tempi dei soli giochi recenti', async () => {
    const ea = await linkStoreAccount(userId, 'ea');
    const recente = await giocato(ea.id, 300);
    const senzaOre = await giocato(ea.id, null);

    expect(await setPlayedThreshold(userId, ea.id, 60)).toBe(1);

    expect(await statoDi(recente)).toBe('played');
    expect(await statoDi(senzaOre)).toBe('backlog');
  });

  it('non vale su un negozio senza tempi, né su Xbox, né per un altro utente', async () => {
    const gog = await linkStoreAccount(userId, 'gog');
    const xbox = await linkStoreAccount(userId, 'xbox');
    const altro = await seedAccount(await createUser());

    expect(await setPlayedThreshold(userId, gog.id, 60)).toBeNull();
    expect(await setPlayedThreshold(userId, xbox.id, 60)).toBeNull();
    expect(await setPlayedThreshold(userId, altro.id, 60)).toBeNull();
  });
});
