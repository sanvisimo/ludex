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
import { fetchSteamPersonaName, resolveSteamId } from '../external/steam';
import { isImportRunning } from '../queue/imports';
import {
  linkSteamAccount,
  listStoreAccounts,
  renameStoreAccount,
  unlinkImpact,
  unlinkStoreAccount,
} from './store-accounts';

vi.mock('../external/steam', () => ({
  resolveSteamId: vi.fn(),
  fetchSteamPersonaName: vi.fn(),
}));
vi.mock('../queue/imports', () => ({ isImportRunning: vi.fn() }));

const mockedResolve = vi.mocked(resolveSteamId);
const mockedPersona = vi.mocked(fetchSteamPersonaName);
const mockedRunning = vi.mocked(isImportRunning);

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
    const catalogo = await db.select({ id: schema.games.id }).from(schema.games);
    expect(catalogo.map((row) => row.id).sort()).toEqual(
      [solo.gameId, anche.gameId].sort(),
    );

    expect(await db.select().from(schema.storeAccounts)).toHaveLength(0);
  });

  it('conta cosa porterebbe via lo scollegamento, prima di portarlo via', async () => {
    const account = await linkStoreAccount(userId, 'amazon');
    // Sta solo qui e ha un voto: è la riga che fa esitare.
    await ownedGame(userId, account.id, 'amazon', { rating: 4 });
    // Sta solo qui e non ha niente di suo.
    await ownedGame(userId, account.id);
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

  it("l'etichetta la scrive l'utente e vince sul nome del negozio", async () => {
    // È il caso Amazon: due account della stessa persona rendono lo stesso
    // `given_name`, quindi il negozio da solo non li separa.
    const account = await linkStoreAccount(userId, 'amazon');
    await db
      .update(schema.storeAccounts)
      .set({ displayName: 'Simone' })
      .where(eq(schema.storeAccounts.id, account.id));

    const rinominato = await renameStoreAccount(userId, account.id, ' di famiglia ');

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
});
