import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ago,
  createGame,
  createUser,
  linkSteamAccount,
  setSource,
  steamEntry,
} from '../../test/factories';
import { findIgdbGamesByExternalIds, searchIgdbGames } from '../external/igdb';
import {
  fetchSteamFamilyLibrary,
  fetchSteamLibrary,
  type SteamFamilyLibrary,
  type SteamSharedApp,
  SteamUnauthorizedError,
} from '../external/steam';
import { enqueueEnrichment, enqueuePostImport } from '../queue/enrichment';
import { importSteamLibrary } from './steam-import';
import { StoreReauthRequiredError, storeAccessToken } from './store-accounts';

// Il confine è il client di Steam, non `fetch`: le classi d'errore restano vere,
// perché l'import ci fa `instanceof`.
vi.mock('../external/steam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/steam')>()),
  fetchSteamLibrary: vi.fn(),
  fetchSteamFamilyLibrary: vi.fn(),
}));
// Il rinnovo del token è un altro test (`store-accounts.test.ts`): qui interessa
// cosa l'import fa col token, non come lo si ottiene.
vi.mock('./store-accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store-accounts')>()),
  storeAccessToken: vi.fn(),
}));
vi.mock('../external/igdb', () => ({
  findIgdbGamesByExternalIds: vi.fn(),
  // Il passo 3 del 9a: l'import ora ripiega sul match per nome. Steam non ne ha
  // bisogno — i suoi appid IGDB li mappa — ma il modulo va stubbato tutto, o la
  // prima voce irrisolta uscirebbe in rete davvero.
  searchIgdbGames: vi.fn(),
  igdbSourceFor: () => 1,
}));
vi.mock('../queue/enrichment', () => ({
  enqueueEnrichment: vi.fn(),
  enqueuePostImport: vi.fn(),
}));

const mockedLibrary = vi.mocked(fetchSteamLibrary);
const mockedFamily = vi.mocked(fetchSteamFamilyLibrary);
const mockedToken = vi.mocked(storeAccessToken);
const mockedResolve = vi.mocked(findIgdbGamesByExternalIds);
const mockedSearch = vi.mocked(searchIgdbGames);
const mockedEnqueue = vi.mocked(enqueueEnrichment);
const mockedPostImport = vi.mocked(enqueuePostImport);

/** Fa finta che IGDB conosca questi appid, con un igdbId derivato dall'appid. */
function igdbKnows(
  entries: { externalId: string; igdbId: number; name?: string }[],
) {
  mockedResolve.mockResolvedValue(
    new Map(
      entries.map((e) => [
        e.externalId,
        {
          igdbId: e.igdbId,
          name: e.name ?? `IGDB ${e.igdbId}`,
          releaseYear: null,
        },
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
      subscription: schema.ownerships.subscription,
      acquiredAt: schema.ownerships.acquiredAt,
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

  it("un appid nuovo su un gioco che c'era già riapre i suoi not_found", async () => {
    // Il gioco era arrivato da GOG, senza appid: HLTB aveva provato col nome e
    // aveva detto di no. L'import Steam porta la prova che mancava.
    const game = await createGame({ igdbId: 233 });
    await setSource({
      gameId: game.id,
      source: 'hltb',
      status: 'not_found',
      attemptedAt: ago.days(3),
    });
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);

    await importSteamLibrary(account);

    const [hltb] = await db
      .select({ status: schema.gameSources.status })
      .from(schema.gameSources)
      .where(eq(schema.gameSources.gameId, game.id));
    expect(hltb).toEqual({ status: 'pending' });
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
    mockedPostImport.mockClear();

    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);
    const report = await importSteamLibrary(account);

    // Il costo dell'enrichment si paga una volta sola: è il vantaggio che cresce
    // col numero di utenti.
    expect(await db.select().from(schema.games)).toHaveLength(1);
    expect(mockedEnqueue).not.toHaveBeenCalled();
    // Nessun gioco nuovo, niente da agganciare: il seguito non parte.
    expect(mockedPostImport).not.toHaveBeenCalled();
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

    mockedPostImport.mockClear();
    await importSteamLibrary(account);

    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
    // Uno per import e non uno per gioco, e dopo gli IGDB: è l'ordine della
    // coda che gli fa trovare gli slug appena scritti.
    expect(mockedPostImport).toHaveBeenCalledTimes(1);
    expect(mockedPostImport.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockedEnqueue.mock.invocationCallOrder[1]!,
    );
  });

  it('senza credenziale non chiede né il token né la famiglia', async () => {
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    igdbKnows([{ externalId: '220', igdbId: 233 }]);

    const report = await importSteamLibrary(account);

    // Il profilo pubblico resta com'è: la chiave dell'applicazione, e basta.
    expect(mockedToken).not.toHaveBeenCalled();
    expect(mockedFamily).not.toHaveBeenCalled();
    expect(mockedLibrary).toHaveBeenCalledWith(account.externalAccountId);
    expect(report.family).toBeUndefined();
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

// --- 9f: col login, e la famiglia ---

const ME = '76561190000000000';
const OTHER = '76561190000000001';

/** Un'app della famiglia come la restituisce il client: di un altro membro. */
function sharedApp(over: Partial<SteamSharedApp> & { externalId: string }) {
  return {
    name: `Gioco ${over.externalId}`,
    ownerSteamIds: [OTHER],
    excludeReason: null,
    playtimeMinutes: 0,
    lastPlayedAt: null,
    // La data del proprietario, antica apposta: l'import non deve usarla.
    acquiredAt: new Date('2008-02-20T00:00:00Z'),
    ...over,
  } satisfies SteamSharedApp;
}

const family = (
  apps: Parameters<typeof sharedApp>[0][],
  inGroup = true,
  joinedAt: Date | null = new Date('2024-09-12T00:00:00Z'),
): SteamFamilyLibrary => ({ inGroup, joinedAt, apps: apps.map(sharedApp) });

/** Chi ha un possesso, per appid: più leggibile dei gameId. */
const byApp = async (userId: string) => {
  const rows = await db
    .select({
      appId: schema.externalIds.externalId,
      subscription: schema.ownerships.subscription,
      playtimeMinutes: schema.ownerships.playtimeMinutes,
      acquiredAt: schema.ownerships.acquiredAt,
      store: schema.ownerships.store,
    })
    .from(schema.backlog)
    .innerJoin(
      schema.ownerships,
      eq(schema.ownerships.backlogId, schema.backlog.id),
    )
    .innerJoin(
      schema.externalIds,
      and(
        eq(schema.externalIds.gameId, schema.backlog.gameId),
        eq(schema.externalIds.source, 'steam'),
      ),
    )
    .where(eq(schema.backlog.userId, userId));
  return new Map(rows.map((row) => [row.appId, row]));
};

const backlogOf = (userId: string) =>
  db.select().from(schema.backlog).where(eq(schema.backlog.userId, userId));

describe('importSteamLibrary col login (9f)', () => {
  let userId: string;
  let account: Awaited<ReturnType<typeof linkSteamAccount>>;

  /** Un account Steam che ha fatto il login: ha una credenziale. */
  async function withLogin(owner: string, steamId: string) {
    const row = await linkSteamAccount(owner, steamId);
    const [conCredenziale] = await db
      .update(schema.storeAccounts)
      .set({ credentials: Buffer.from('credenziale') })
      .where(eq(schema.storeAccounts.id, row.id))
      .returning();
    return conCredenziale!;
  }

  /** IGDB conosce questi appid, e ciascuno è un gioco a sé. */
  const igdbKnowsAll = (appIds: string[]) =>
    igdbKnows(appIds.map((id) => ({ externalId: id, igdbId: Number(id) })));

  beforeEach(async () => {
    userId = await createUser();
    account = await withLogin(userId, ME);
    mockedToken.mockResolvedValue('token');
    mockedSearch.mockResolvedValue([]);
    mockedLibrary.mockResolvedValue([]);
  });

  it('scrive le copie della famiglia come steam_family, e non le proprie', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220', playtimeMinutes: 630 }),
    ]);
    mockedFamily.mockResolvedValue(
      family([
        // Una mia, che la risposta elenca perché `include_own=true`.
        { externalId: '220', ownerSteamIds: [ME] },
        { externalId: '400', playtimeMinutes: 90 },
        { externalId: '500', ownerSteamIds: [OTHER, '76561190000000002'] },
      ]),
    );
    igdbKnowsAll(['220', '400', '500']);

    const report = await importSteamLibrary(account);

    const copie = await byApp(userId);
    expect(copie.get('220')).toMatchObject({
      subscription: null,
      playtimeMinutes: 630,
      // La sua: l'utente è fra i proprietari.
      acquiredAt: new Date('2008-02-20T00:00:00Z'),
    });
    // Le ore sono quelle dell'utente, e la data d'acquisto **non** si scrive: è
    // del proprietario, e farebbe arretrare `backlog.added_at` per sempre.
    expect(copie.get('400')).toMatchObject({
      subscription: 'steam_family',
      playtimeMinutes: 90,
      // Una stima: il più recente fra la data del proprietario (2008) e quella in
      // cui l'utente è entrato nella famiglia.
      acquiredAt: new Date('2024-09-12T00:00:00Z'),
      store: 'steam',
    });
    expect(copie.get('500')).toMatchObject({ subscription: 'steam_family' });
    expect(report.family).toEqual({ copies: 2, removed: 0, kept: 0 });
    // Col token, non con la chiave: a profilo privato la chiave risponde vuota.
    expect(mockedLibrary).toHaveBeenCalledWith(ME, 'token');
    expect(mockedFamily).toHaveBeenCalledWith('token', ME);
  });

  it('la data d’acquisto delle copie proprie porta indietro `aggiunto il`, quella della famiglia no', async () => {
    mockedLibrary.mockResolvedValue([
      steamEntry({ externalId: '220' }),
      steamEntry({ externalId: '500' }),
    ]);
    mockedFamily.mockResolvedValue(
      family([
        // Il caso insidioso: l'app è anche nella mia libreria, ma la famiglia
        // la elenca con un altro proprietario soltanto, e con la **sua** data.
        // Non è la mia, e scriverla farebbe arretrare `aggiunto il` al 2008.
        { externalId: '500', acquiredAt: new Date('2008-02-20T00:00:00Z') },
        // Un'app in comune con un parente: la risposta con `include_own=true`
        // rende la data dell'utente, non quella del proprietario (*Portal*:
        // 2025 contro il 2011 dell'altro, e la pagina delle licenze dice 2025).
        {
          externalId: '220',
          ownerSteamIds: [OTHER, ME],
          acquiredAt: new Date('2025-07-02T00:00:00Z'),
        },
        // Solo del parente: la data è sua, e non deve arretrare il backlog.
        { externalId: '400', acquiredAt: new Date('2008-02-20T00:00:00Z') },
      ]),
    );
    igdbKnowsAll(['220', '400', '500']);

    await importSteamLibrary(account);

    const copie = await byApp(userId);
    expect(copie.get('500')?.acquiredAt).toBeNull();
    expect(copie.get('220')?.acquiredAt).toEqual(
      new Date('2025-07-02T00:00:00Z'),
    );
    expect(copie.get('400')?.acquiredAt).toEqual(
      new Date('2024-09-12T00:00:00Z'),
    );

    const aggiunti = (await backlogOf(userId)).map((riga) =>
      riga.addedAt.getUTCFullYear(),
    );
    // Il 2025 della copia propria: né il 2008 del parente, né oggi.
    expect(aggiunti).toContain(2025);
    expect(aggiunti).not.toContain(2008);
  });

  it('una copia propria che la famiglia non elenca resta senza data', async () => {
    // Succede: pochi giochi della libreria propria non stanno nella risposta
    // della famiglia (5 su 453 sul primo account misurato).
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    mockedFamily.mockResolvedValue(family([]));
    igdbKnowsAll(['220']);

    await importSteamLibrary(account);

    expect((await byApp(userId)).get('220')?.acquiredAt).toBeNull();
  });

  it('non scrive come famiglia ciò che hai già o che Steam esclude', async () => {
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    mockedFamily.mockResolvedValue(
      family([
        // Il caso di confine misurato: un altro membro ha l'app, ma è anche
        // nella mia libreria. Il proprietario elencato non sono io, e non è
        // una copia della famiglia.
        { externalId: '220', ownerSteamIds: [OTHER] },
        { externalId: '90', excludeReason: 3 },
        { externalId: '400' },
      ]),
    );
    igdbKnowsAll(['220', '90', '400']);

    const report = await importSteamLibrary(account);

    const copie = await byApp(userId);
    expect(copie.get('220')?.subscription).toBeNull();
    expect(copie.has('90')).toBe(false);
    expect(copie.get('400')?.subscription).toBe('steam_family');
    expect(report.family?.copies).toBe(1);
  });

  it('rieseguito lascia lo stesso stato', async () => {
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);

    await importSteamLibrary(account);
    const secondo = await importSteamLibrary(account);

    expect(await ownershipsOf(userId)).toHaveLength(1);
    expect(await backlogOf(userId)).toHaveLength(1);
    expect(secondo.family).toEqual({ copies: 1, removed: 0, kept: 0 });
  });

  it('un gioco che esce dalla famiglia se ne va, con la sua riga di backlog', async () => {
    mockedFamily.mockResolvedValue(
      family([{ externalId: '400' }, { externalId: '500' }]),
    );
    igdbKnowsAll(['400', '500']);
    await importSteamLibrary(account);

    mockedFamily.mockResolvedValue(family([{ externalId: '500' }]));
    const report = await importSteamLibrary(account);

    expect([...(await byApp(userId)).keys()]).toEqual(['500']);
    // Era solo il riflesso della famiglia: la riga non ha niente dell'utente.
    expect(await backlogOf(userId)).toHaveLength(1);
    expect(report.family).toEqual({ copies: 1, removed: 1, kept: 0 });
  });

  it('se la riga ha dati dell’utente la copia resta', async () => {
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);
    await importSteamLibrary(account);
    // Un voto: roba che l'utente ha scritto, e che non sparisce perché un parente
    // ha tolto la licenza.
    await db.update(schema.backlog).set({ rating: 4.5 });

    mockedFamily.mockResolvedValue(family([]));
    const report = await importSteamLibrary(account);

    expect((await byApp(userId)).get('400')?.subscription).toBe('steam_family');
    expect(await backlogOf(userId)).toMatchObject([{ rating: 4.5 }]);
    expect(report.family).toEqual({ copies: 0, removed: 0, kept: 1 });
  });

  it('con un’altra copia, esce solo quella della famiglia', async () => {
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);
    await importSteamLibrary(account);
    // Lo stesso gioco comprato anche su GOG.
    const [riga] = await backlogOf(userId);
    await db.insert(schema.ownerships).values({
      backlogId: riga!.id,
      platformSlug: 'pc_windows',
      store: 'gog',
    });

    mockedFamily.mockResolvedValue(family([]));
    await importSteamLibrary(account);

    const righe = await ownershipsOf(userId);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ store: 'gog', subscription: null });
    // La riga di backlog resta: ha ancora un possesso.
    expect(await backlogOf(userId)).toHaveLength(1);
  });

  it('un gioco comprato dopo averlo avuto dalla famiglia smette di esserlo', async () => {
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);
    await importSteamLibrary(account);

    // Adesso è nella mia libreria, e la famiglia lo elenca con me fra i
    // proprietari. La chiave del possesso è la stessa: si riscrive senza COALESCE.
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '400' })]);
    mockedFamily.mockResolvedValue(
      family([{ externalId: '400', ownerSteamIds: [ME, OTHER] }]),
    );
    const report = await importSteamLibrary(account);

    const righe = await ownershipsOf(userId);
    expect(righe).toHaveLength(1);
    expect(righe[0]?.subscription).toBeNull();
    expect(report.family).toEqual({ copies: 0, removed: 0, kept: 0 });
  });

  it('chi esce da ogni gruppo perde tutte le copie della famiglia', async () => {
    mockedFamily.mockResolvedValue(
      family([{ externalId: '400' }, { externalId: '500' }]),
    );
    igdbKnowsAll(['400', '500']);
    await importSteamLibrary(account);

    mockedFamily.mockResolvedValue(family([], false));
    const report = await importSteamLibrary(account);

    expect(await ownershipsOf(userId)).toHaveLength(0);
    expect(report.family?.removed).toBe(2);
  });

  it('se la famiglia non si legge non si pota niente', async () => {
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);
    await importSteamLibrary(account);

    // Una rete che cade non è un'uscita dalla famiglia.
    mockedFamily.mockRejectedValue(new Error('rete giù'));
    await expect(importSteamLibrary(account)).rejects.toThrow('rete giù');

    expect((await byApp(userId)).get('400')?.subscription).toBe('steam_family');
  });

  it('un rifiuto di Steam manda l’account in needs_reauth', async () => {
    mockedFamily.mockRejectedValue(
      new SteamUnauthorizedError('GetSharedLibraryApps', 401),
    );

    await expect(importSteamLibrary(account)).rejects.toThrow(
      StoreReauthRequiredError,
    );

    const [riga] = await db
      .select({ status: schema.storeAccounts.status })
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, account.id));
    expect(riga?.status).toBe('needs_reauth');
  });

  it('un rifiuto sulla libreria propria è lo stesso rifiuto', async () => {
    mockedLibrary.mockRejectedValue(
      new SteamUnauthorizedError('GetOwnedGames', 401),
    );

    await expect(importSteamLibrary(account)).rejects.toThrow(
      StoreReauthRequiredError,
    );
    expect(mockedFamily).not.toHaveBeenCalled();
  });

  it('una copia tolta a mano non rientra al reimport', async () => {
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);
    await importSteamLibrary(account);

    // «Questa copia non ce l'ho»: il gesto di `docs/import-librerie.md`.
    const [riga] = await backlogOf(userId);
    await db
      .delete(schema.ownerships)
      .where(eq(schema.ownerships.backlogId, riga!.id));
    await db.insert(schema.ownershipRejections).values({
      backlogId: riga!.id,
      platformSlug: 'pc_windows',
      store: 'steam',
      storeAccountId: account.id,
      medium: 'digital',
    });

    await importSteamLibrary(account);

    expect(await ownershipsOf(userId)).toHaveLength(0);
  });

  it('un appid proprio e uno della famiglia sullo stesso gioco restano una copia comprata', async () => {
    // Succede davvero: 445 giochi per 447 appid. Le righe si fondono e vince il
    // `subscription` della prima, quindi le proprie devono stare davanti — o un
    // acquisto uscirebbe marcato famiglia, e la potatura lo butterebbe.
    mockedLibrary.mockResolvedValue([steamEntry({ externalId: '220' })]);
    mockedFamily.mockResolvedValue(family([{ externalId: '221' }]));
    igdbKnows([
      { externalId: '220', igdbId: 233 },
      { externalId: '221', igdbId: 233 },
    ]);

    await importSteamLibrary(account);

    const righe = await ownershipsOf(userId);
    expect(righe).toHaveLength(1);
    expect(righe[0]?.subscription).toBeNull();

    // E la potatura non lo tocca, nemmeno a famiglia vuota.
    mockedFamily.mockResolvedValue(family([]));
    await importSteamLibrary(account);
    expect(await ownershipsOf(userId)).toHaveLength(1);
  });

  describe('con un possesso scritto a mano', () => {
    /** Il gioco era già nel backlog, con «PC» a mano e nessun negozio. */
    async function manualEntry() {
      const game = await createGame({ igdbId: 400 });
      const [entry] = await db
        .insert(schema.backlog)
        .values({ userId, gameId: game.id })
        .returning({ id: schema.backlog.id });
      await db
        .insert(schema.ownerships)
        .values({ backlogId: entry!.id, platformSlug: 'pc_windows' });
      return entry!.id;
    }

    it('non lo adotta: restano due righe', async () => {
      await manualEntry();
      mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
      igdbKnowsAll(['400']);

      await importSteamLibrary(account);

      const righe = await ownershipsOf(userId);
      expect(righe).toHaveLength(2);
      expect(righe).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ store: null, subscription: null }),
          expect.objectContaining({
            store: 'steam',
            subscription: 'steam_family',
          }),
        ]),
      );
    });

    it('se la famiglia lo toglie esce solo la copia della famiglia', async () => {
      await manualEntry();
      mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
      igdbKnowsAll(['400']);
      await importSteamLibrary(account);

      mockedFamily.mockResolvedValue(family([]));
      await importSteamLibrary(account);

      // Quello scritto a mano resta, con la sua riga di backlog: è dell'utente.
      const righe = await ownershipsOf(userId);
      expect(righe).toHaveLength(1);
      expect(righe[0]).toMatchObject({ store: null, subscription: null });
      expect(await backlogOf(userId)).toHaveLength(1);
    });

    it('se poi lo compri si fonde con l’acquisto, come sempre', async () => {
      await manualEntry();
      mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
      igdbKnowsAll(['400']);
      await importSteamLibrary(account);

      // Adesso è nella libreria propria: la copia ha la chiave di quella della
      // famiglia, e lì l'adozione riprende — la riga a mano era la stessa copia.
      mockedLibrary.mockResolvedValue([steamEntry({ externalId: '400' })]);
      mockedFamily.mockResolvedValue(
        family([{ externalId: '400', ownerSteamIds: [ME, OTHER] }]),
      );
      await importSteamLibrary(account);

      const righe = await ownershipsOf(userId);
      expect(righe).toHaveLength(1);
      expect(righe[0]).toMatchObject({ store: 'steam', subscription: null });
    });
  });

  it('la potatura è dell’account: le copie di un altro utente restano', async () => {
    const altro = await createUser();
    const suoAccount = await withLogin(altro, '76561190000000009');
    mockedFamily.mockResolvedValue(family([{ externalId: '400' }]));
    igdbKnowsAll(['400']);
    await importSteamLibrary(suoAccount);
    await importSteamLibrary(account);

    mockedFamily.mockResolvedValue(family([]));
    await importSteamLibrary(account);

    expect(await ownershipsOf(userId)).toHaveLength(0);
    expect((await byApp(altro)).get('400')?.subscription).toBe('steam_family');
  });
});
