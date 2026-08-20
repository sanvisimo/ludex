import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  createUser,
  linkSteamAccount,
  steamEntry,
} from '../../test/factories';
import { findIgdbGamesByExternalIds, searchIgdbGames } from '../external/igdb';
import { fetchSteamLibrary } from '../external/steam';
import { enqueueEnrichment } from '../queue/enrichment';
import { importSteamLibrary } from './steam-import';

vi.mock('../external/steam', () => ({ fetchSteamLibrary: vi.fn() }));
vi.mock('../external/igdb', () => ({
  findIgdbGamesByExternalIds: vi.fn(),
  // Il passo 3 del 9a: l'import ora ripiega sul match per nome. Steam non ne ha
  // bisogno — i suoi appid IGDB li mappa — ma il modulo va stubbato tutto, o la
  // prima voce irrisolta uscirebbe in rete davvero.
  searchIgdbGames: vi.fn(),
  igdbSourceFor: () => 1,
}));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedLibrary = vi.mocked(fetchSteamLibrary);
const mockedResolve = vi.mocked(findIgdbGamesByExternalIds);
const mockedSearch = vi.mocked(searchIgdbGames);
const mockedEnqueue = vi.mocked(enqueueEnrichment);

/** Fa finta che IGDB conosca questi appid, con un igdbId derivato dall'appid. */
function igdbKnows(
  entries: { externalId: string; igdbId: number; name?: string }[],
) {
  mockedResolve.mockResolvedValue(
    new Map(
      entries.map((e) => [
        e.externalId,
        { igdbId: e.igdbId, name: e.name ?? `IGDB ${e.igdbId}` },
      ]),
    ),
  );
}

const ownershipsOf = (userId: string) =>
  db
    .select({
      gameId: schema.backlog.gameId,
      status: schema.backlog.status,
      platformSlug: schema.ownerships.platformSlug,
      store: schema.ownerships.store,
      playtimeMinutes: schema.ownerships.playtimeMinutes,
      lastPlayedAt: schema.ownerships.lastPlayedAt,
    })
    .from(schema.backlog)
    .innerJoin(
      schema.ownerships,
      eq(schema.ownerships.backlogId, schema.backlog.id),
    )
    .where(eq(schema.backlog.userId, userId));

const unresolvedOf = (userId: string) =>
  db
    .select()
    .from(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.userId, userId));

describe('importSteamLibrary', () => {
  let userId: string;
  // La riga dell'account, non lo SteamID64: lo SteamID è `externalAccountId` su
  // di lei, e l'import se lo legge da lì invece di farselo passare.
  let account: Awaited<ReturnType<typeof linkSteamAccount>>;

  beforeEach(async () => {
    userId = await createUser();
    account = await linkSteamAccount(userId);
    // Di default IGDB non trova niente per nome: su Steam la risoluzione passa
    // dagli appid, e i test che parlano di irrisolti vogliono restare irrisolti.
    mockedSearch.mockResolvedValue([]);
  });

  it('crea giochi, backlog e possessi con le ore di Steam', async () => {
    const giocato = steamEntry({
      externalId: '220',
      name: 'Half-Life 2',
      playtimeMinutes: 630,
      lastPlayedAt: new Date('2026-01-15T00:00:00Z'),
    });
    mockedLibrary.mockResolvedValue([giocato]);
    igdbKnows([{ externalId: '220', igdbId: 233, name: 'Half-Life 2' }]);

    const report = await importSteamLibrary(account);

    expect(report).toEqual({
      total: 1,
      resolved: 1,
      // Zero: su Steam si risolve per appid, il match per nome del 9a non entra
      // mai in gioco.
      resolvedByName: 0,
      unresolved: 0,
      newGames: 1,
      newEntries: 1,
    });
    expect(await ownershipsOf(userId)).toMatchObject([
      {
        // Tutto come `backlog`: le ore non bastano a dire "giocato", e allo step
        // 7 `played` pesa.
        status: 'backlog',
        platformSlug: 'pc_windows',
        store: 'steam',
        playtimeMinutes: 630,
        lastPlayedAt: new Date('2026-01-15T00:00:00Z'),
      },
    ]);
  });

  it('rieseguito lascia lo stesso stato', async () => {
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);

    await importSteamLibrary(account);
    const secondo = await importSteamLibrary(account);

    // Niente si accumula: né la riga games, né il backlog, né il possesso.
    expect(await db.select().from(schema.games)).toHaveLength(1);
    expect(await ownershipsOf(userId)).toHaveLength(1);
    expect(secondo).toMatchObject({ resolved: 1, newGames: 0, newEntries: 0 });
  });

  it('aggiorna le ore al reimport', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220', playtimeMinutes: 60 }),
    ]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);
    await importSteamLibrary(account);

    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220', playtimeMinutes: 240 }),
    ]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);
    await importSteamLibrary(account);

    expect(await ownershipsOf(userId)).toMatchObject([
      { playtimeMinutes: 240 },
    ]);
  });

  it('non tocca lo stato di un gioco già nel backlog, aggiunge solo il possesso', async () => {
    const game = await createGame({ igdbId: 233 });
    const [entry] = await db
      .insert(schema.backlog)
      .values({ userId, gameId: game.id, status: 'playing' })
      .returning({ id: schema.backlog.id });
    // Aggiunto a mano su Switch, senza store.
    await db
      .insert(schema.ownerships)
      .values({ backlogId: entry!.id, platformSlug: 'nintendo_switch' });

    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220', playtimeMinutes: 90 }),
    ]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);
    await importSteamLibrary(account);

    const righe = await ownershipsOf(userId);
    expect(righe).toHaveLength(2);
    // Lo stato resta `playing` su entrambe le righe: è una riga di backlog sola.
    expect(righe.every((r) => r.status === 'playing')).toBe(true);
    // Il possesso manuale non si porta via le ore di quello Steam, né viceversa.
    expect(righe).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformSlug: 'nintendo_switch',
          store: null,
          playtimeMinutes: null,
        }),
        expect.objectContaining({
          platformSlug: 'pc_windows',
          store: 'steam',
          playtimeMinutes: 90,
        }),
      ]),
    );
  });

  it('regge due appid che puntano allo stesso gioco', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220', playtimeMinutes: 30 }),
      steamEntry({ externalId: '221', playtimeMinutes: 30 }),
    ]);
    igdbKnows([
      { externalId: '220', igdbId: 233 },
      { externalId: '221', igdbId: 233 },
    ]);

    const report = await importSteamLibrary(account);

    // Succede davvero su una libreria vera: 445 giochi IGDB distinti per 447
    // appid. Due mappature esterne, una riga games, una riga di backlog.
    expect(await db.select().from(schema.games)).toHaveLength(1);
    expect(await db.select().from(schema.externalIds)).toHaveLength(2);
    // Un possesso solo, con le ore sommate: sono due voci di libreria dello
    // stesso gioco, e il tempo speso è la somma dei due.
    expect(await ownershipsOf(userId)).toMatchObject([{ playtimeMinutes: 60 }]);
    expect(report).toMatchObject({ resolved: 2, newGames: 1, newEntries: 1 });
  });

  it('mette gli irrisolti in tabella a parte, non in games', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({
        externalId: '931180',
        name: 'Conan Exiles - Public Beta Client',
        playtimeMinutes: 12,
      }),
    ]);
    igdbKnows([]);

    const report = await importSteamLibrary(account);

    expect(report).toMatchObject({
      total: 1,
      resolved: 0,
      unresolved: 1,
      newGames: 0,
    });
    // `games` è condivisa fra tutti: i client beta di uno non sono catalogo di tutti.
    expect(await db.select().from(schema.games)).toHaveLength(0);
    expect(await unresolvedOf(userId)).toMatchObject([
      {
        externalId: '931180',
        name: 'Conan Exiles - Public Beta Client',
        playtimeMinutes: 12,
      },
    ]);
  });

  it('toglie dagli irrisolti ciò che IGDB nel frattempo conosce', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '1588530', name: 'Dungeon Alchemist' }),
    ]);
    igdbKnows([]);
    await importSteamLibrary(account);
    expect(await unresolvedOf(userId)).toHaveLength(1);

    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '1588530', name: 'Dungeon Alchemist' }),
    ]);
    igdbKnows([{ externalId: '1588530', igdbId: 999 }]);
    await importSteamLibrary(account);

    // IGDB cresce: la voce va tolta, non lasciata lì a chiedere un intervento
    // manuale che non serve più.
    expect(await unresolvedOf(userId)).toHaveLength(0);
    expect(await ownershipsOf(userId)).toHaveLength(1);
  });

  it('non interroga IGDB per gli appid già mappati', async () => {
    const game = await createGame({ igdbId: 233 });
    await db
      .insert(schema.externalIds)
      .values({ gameId: game.id, source: 'steam', externalId: '220' });

    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([]);

    const report = await importSteamLibrary(account);

    // Prima il nostro DB: è ciò che rende quasi gratis l'import del secondo
    // utente che possiede gli stessi giochi del primo.
    expect(mockedResolve).toHaveBeenCalledWith('steam', []);
    expect(report).toMatchObject({ resolved: 1, newGames: 0, newEntries: 1 });
  });

  it("riusa il gioco importato da un altro utente e non riaccoda l'enrichment", async () => {
    const altro = await createUser();
    const suoAccount = await linkSteamAccount(altro, '76561190000000001');
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);
    await importSteamLibrary(suoAccount);
    mockedEnqueue.mockClear();

    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);
    const report = await importSteamLibrary(account);

    // Il costo dell'enrichment si paga una volta sola: è il vantaggio che cresce
    // col numero di utenti.
    expect(await db.select().from(schema.games)).toHaveLength(1);
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(report).toMatchObject({ newGames: 0, newEntries: 1 });
  });

  it("accoda l'enrichment solo per i giochi nuovi", async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220' }),
      steamEntry({ externalId: '70' }),
    ]);
    igdbKnows([
      { externalId: '220', igdbId: 233 },
      { externalId: '70', igdbId: 231 },
    ]);

    await importSteamLibrary(account);

    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
  });

  it("segna l'ultima sincronizzazione sull'account collegato", async () => {
    mockedLibrary.mockResolvedValue([]);
    igdbKnows([]);

    await importSteamLibrary(account);

    const [aggiornato] = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, account.id));
    expect(aggiornato?.lastSyncAt).toBeInstanceOf(Date);
  });
});
