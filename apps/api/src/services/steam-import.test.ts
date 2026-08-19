import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  createUser,
  linkSteamAccount,
  steamEntry,
} from '../../test/factories';
import { findIgdbGamesBySteamAppIds } from '../external/igdb';
import { fetchSteamLibrary } from '../external/steam';
import { enqueueEnrichment } from '../queue/enrichment';
import { importSteamLibrary } from './steam-import';

vi.mock('../external/steam', () => ({ fetchSteamLibrary: vi.fn() }));
vi.mock('../external/igdb', () => ({ findIgdbGamesBySteamAppIds: vi.fn() }));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedLibrary = vi.mocked(fetchSteamLibrary);
const mockedResolve = vi.mocked(findIgdbGamesBySteamAppIds);
const mockedEnqueue = vi.mocked(enqueueEnrichment);

/** Fa finta che IGDB conosca questi appid, con un igdbId derivato dall'appid. */
function igdbKnows(
  entries: { appId: string; igdbId: number; name?: string }[],
) {
  mockedResolve.mockResolvedValue(
    new Map(
      entries.map((e) => [
        e.appId,
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
  let steamId: string;

  beforeEach(async () => {
    userId = await createUser();
    steamId = await linkSteamAccount(userId);
  });

  it('crea giochi, backlog e possessi con le ore di Steam', async () => {
    const giocato = steamEntry({
      appId: '220',
      name: 'Half-Life 2',
      playtimeMinutes: 630,
      lastPlayedAt: new Date('2026-01-15T00:00:00Z'),
    });
    mockedLibrary.mockResolvedValue([giocato]);
    igdbKnows([{ appId: '220', igdbId: 233, name: 'Half-Life 2' }]);

    const report = await importSteamLibrary(userId, steamId);

    expect(report).toEqual({
      total: 1,
      resolved: 1,
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
    mockedLibrary.mockResolvedValue([steamEntry({ appId: '220' })]);
    igdbKnows([{ appId: '220', igdbId: 233 }]);

    await importSteamLibrary(userId, steamId);
    const secondo = await importSteamLibrary(userId, steamId);

    // Niente si accumula: né la riga games, né il backlog, né il possesso.
    expect(await db.select().from(schema.games)).toHaveLength(1);
    expect(await ownershipsOf(userId)).toHaveLength(1);
    expect(secondo).toMatchObject({ resolved: 1, newGames: 0, newEntries: 0 });
  });

  it('aggiorna le ore al reimport', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ appId: '220', playtimeMinutes: 60 }),
    ]);
    igdbKnows([{ appId: '220', igdbId: 233 }]);
    await importSteamLibrary(userId, steamId);

    mockedLibrary.mockResolvedValue([
      steamEntry({ appId: '220', playtimeMinutes: 240 }),
    ]);
    igdbKnows([{ appId: '220', igdbId: 233 }]);
    await importSteamLibrary(userId, steamId);

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
      steamEntry({ appId: '220', playtimeMinutes: 90 }),
    ]);
    igdbKnows([{ appId: '220', igdbId: 233 }]);
    await importSteamLibrary(userId, steamId);

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
      steamEntry({ appId: '220', playtimeMinutes: 30 }),
      steamEntry({ appId: '221', playtimeMinutes: 30 }),
    ]);
    igdbKnows([
      { appId: '220', igdbId: 233 },
      { appId: '221', igdbId: 233 },
    ]);

    const report = await importSteamLibrary(userId, steamId);

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
        appId: '931180',
        name: 'Conan Exiles - Public Beta Client',
        playtimeMinutes: 12,
      }),
    ]);
    igdbKnows([]);

    const report = await importSteamLibrary(userId, steamId);

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
      steamEntry({ appId: '1588530', name: 'Dungeon Alchemist' }),
    ]);
    igdbKnows([]);
    await importSteamLibrary(userId, steamId);
    expect(await unresolvedOf(userId)).toHaveLength(1);

    mockedLibrary.mockResolvedValue([
      steamEntry({ appId: '1588530', name: 'Dungeon Alchemist' }),
    ]);
    igdbKnows([{ appId: '1588530', igdbId: 999 }]);
    await importSteamLibrary(userId, steamId);

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

    mockedLibrary.mockResolvedValue([steamEntry({ appId: '220' })]);
    igdbKnows([]);

    const report = await importSteamLibrary(userId, steamId);

    // Prima il nostro DB: è ciò che rende quasi gratis l'import del secondo
    // utente che possiede gli stessi giochi del primo.
    expect(mockedResolve).toHaveBeenCalledWith([]);
    expect(report).toMatchObject({ resolved: 1, newGames: 0, newEntries: 1 });
  });

  it("riusa il gioco importato da un altro utente e non riaccoda l'enrichment", async () => {
    const altro = await createUser();
    await linkSteamAccount(altro, '76561190000000001');
    mockedLibrary.mockResolvedValue([steamEntry({ appId: '220' })]);
    igdbKnows([{ appId: '220', igdbId: 233 }]);
    await importSteamLibrary(altro, '76561190000000001');
    mockedEnqueue.mockClear();

    mockedLibrary.mockResolvedValue([steamEntry({ appId: '220' })]);
    igdbKnows([{ appId: '220', igdbId: 233 }]);
    const report = await importSteamLibrary(userId, steamId);

    // Il costo dell'enrichment si paga una volta sola: è il vantaggio che cresce
    // col numero di utenti.
    expect(await db.select().from(schema.games)).toHaveLength(1);
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(report).toMatchObject({ newGames: 0, newEntries: 1 });
  });

  it("accoda l'enrichment solo per i giochi nuovi", async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ appId: '220' }),
      steamEntry({ appId: '70' }),
    ]);
    igdbKnows([
      { appId: '220', igdbId: 233 },
      { appId: '70', igdbId: 231 },
    ]);

    await importSteamLibrary(userId, steamId);

    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
  });

  it("segna l'ultima sincronizzazione sull'account collegato", async () => {
    mockedLibrary.mockResolvedValue([]);
    igdbKnows([]);

    await importSteamLibrary(userId, steamId);

    const [account] = await db
      .select()
      .from(schema.storeAccounts)
      .where(
        and(
          eq(schema.storeAccounts.userId, userId),
          eq(schema.storeAccounts.store, 'steam'),
        ),
      );
    expect(account?.lastSyncAt).toBeInstanceOf(Date);
  });
});
