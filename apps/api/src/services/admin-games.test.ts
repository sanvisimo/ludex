import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import {
  findIgdbGameById,
  findIgdbGamesByExternalIds,
  findIgdbGamesBySource,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import {
  gameAdminDetail,
  linkGameToIgdb,
  listUnlinkedGames,
  previewRepoint,
  repointLink,
} from './admin-games';
import { importLibrary } from './library-import';
import { createReports, openReportsForGame } from './reports';

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

const mockedFindById = vi.mocked(findIgdbGameById);

beforeEach(() => {
  vi.mocked(findIgdbGamesByExternalIds).mockResolvedValue(new Map());
  vi.mocked(findIgdbGamesBySource).mockResolvedValue(new Map());
  vi.mocked(igdbSourceFor).mockReturnValue(null);
  vi.mocked(searchIgdbGames).mockResolvedValue([]);
});

/** Un risultato IGDB, per il gioco giusto che il catalogo non ha ancora. */
function igdbHit(igdbId: number, name: string) {
  return {
    igdbId,
    name,
    releaseYear: 2018,
    developer: null,
    cover: null,
    gameType: 'remake' as const,
    totalRatingCount: null,
    platformIds: [130],
  };
}

// Il caso Toki: la voce Nintendo agganciata all'arcade del 1989, mentre la
// copia è il remake del 2018.
const TOKI_NINTENDO = '0100f3400a432000';

async function tokiSbagliato() {
  const arcade = await createGame({ igdbId: 12228, name: 'Toki' });
  const [link] = await db
    .insert(schema.externalIds)
    .values({
      gameId: arcade.id,
      source: 'nintendo',
      externalId: TOKI_NINTENDO,
    })
    .returning({ id: schema.externalIds.id });
  return { arcade, linkId: link!.id };
}

/** Una riga di backlog con le sue copie, scritta dritta. */
async function riga(
  userId: string,
  gameId: string,
  copie: { store: 'nintendo' | 'steam'; accountId: string | null }[],
  extra: { rating?: number; notes?: string } = {},
) {
  const [backlog] = await db
    .insert(schema.backlog)
    .values({ userId, gameId, ...extra })
    .returning({ id: schema.backlog.id });
  for (const copia of copie)
    await db.insert(schema.ownerships).values({
      backlogId: backlog!.id,
      platformSlug:
        copia.store === 'nintendo' ? 'nintendo_switch' : 'pc_windows',
      store: copia.store,
      storeAccountId: copia.accountId,
      medium: 'digital',
    });
  return backlog!.id;
}

const righeDi = (userId: string) =>
  db
    .select({
      id: schema.backlog.id,
      gameId: schema.backlog.gameId,
      rating: schema.backlog.rating,
      notes: schema.backlog.notes,
    })
    .from(schema.backlog)
    .where(eq(schema.backlog.userId, userId));

const copieDi = (backlogId: string) =>
  db
    .select({ store: schema.ownerships.store })
    .from(schema.ownerships)
    .where(eq(schema.ownerships.backlogId, backlogId));

describe('«Non è questo gioco»', () => {
  it('sposta la riga intera di chi aveva solo quella copia, con voto, note e tag', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    const remake = await createGame({ igdbId: 94084, name: 'Toki' });
    const userId = await createUser();
    const account = await linkStoreAccount(userId, 'nintendo');
    const backlogId = await riga(
      userId,
      arcade.id,
      [{ store: 'nintendo', accountId: account.id }],
      { rating: 4, notes: 'il remake è bello' },
    );
    const [tag] = await db
      .insert(schema.userTags)
      .values({ userId, kind: 'tag', name: 'platform' })
      .returning({ id: schema.userTags.id });
    await db.insert(schema.backlogTags).values({ backlogId, tagId: tag!.id });

    expect(await repointLink(userId, linkId, 94084)).toEqual({
      status: 'ok',
      wholeRows: 1,
      copies: 1,
    });

    // Stessa riga, gioco giusto: il voto l'aveva dato al gioco che credeva
    // di avere.
    expect(await righeDi(userId)).toEqual([
      {
        id: backlogId,
        gameId: remake.id,
        rating: 4,
        notes: 'il remake è bello',
      },
    ]);
    expect(
      await db
        .select()
        .from(schema.backlogTags)
        .where(eq(schema.backlogTags.backlogId, backlogId)),
    ).toHaveLength(1);
    const [link] = await db
      .select({ gameId: schema.externalIds.gameId })
      .from(schema.externalIds)
      .where(eq(schema.externalIds.id, linkId));
    expect(link!.gameId).toBe(remake.id);
  });

  it('sposta solo le copie di chi ne ha altre, e i rifiuti di quel negozio le seguono', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    const remake = await createGame({ igdbId: 94084 });
    const userId = await createUser();
    const nintendo = await linkStoreAccount(userId, 'nintendo');
    const steam = await linkStoreAccount(userId, 'steam');
    const sbagliata = await riga(userId, arcade.id, [
      { store: 'nintendo', accountId: nintendo.id },
      { store: 'steam', accountId: steam.id },
    ]);
    // Aveva tolto il disco: il prossimo import non deve rimetterglielo.
    await db.insert(schema.ownershipRejections).values({
      backlogId: sbagliata,
      platformSlug: 'nintendo_switch',
      store: 'nintendo',
      storeAccountId: nintendo.id,
      medium: 'physical',
    });

    expect(await repointLink(userId, linkId, 94084)).toMatchObject({
      wholeRows: 0,
      copies: 1,
    });

    const righe = await righeDi(userId);
    const giusta = righe.find((r) => r.gameId === remake.id)!;
    expect(await copieDi(sbagliata)).toEqual([{ store: 'steam' }]);
    expect(await copieDi(giusta.id)).toEqual([{ store: 'nintendo' }]);
    const rifiuti = await db
      .select({ backlogId: schema.ownershipRejections.backlogId })
      .from(schema.ownershipRejections);
    expect(rifiuti).toEqual([{ backlogId: giusta.id }]);
  });

  it('chi ha già il gioco giusto riceve la copia, e la riga sbagliata resta', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    const remake = await createGame({ igdbId: 94084 });
    const userId = await createUser();
    const account = await linkStoreAccount(userId, 'nintendo');
    const sbagliata = await riga(userId, arcade.id, [
      { store: 'nintendo', accountId: account.id },
    ]);
    const giusta = await riga(userId, remake.id, []);

    await repointLink(userId, linkId, 94084);

    expect(await copieDi(giusta)).toEqual([{ store: 'nintendo' }]);
    expect(await copieDi(sbagliata)).toEqual([]);
    expect(await righeDi(userId)).toHaveLength(2);
  });

  it('ripetuto non cambia niente, e il reimport legge la riga nuova', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    const remake = await createGame({ igdbId: 94084 });
    const userId = await createUser();
    const account = await linkStoreAccount(userId, 'nintendo');
    await riga(userId, arcade.id, [
      { store: 'nintendo', accountId: account.id },
    ]);

    await repointLink(userId, linkId, 94084);
    const prima = await righeDi(userId);
    expect(await repointLink(userId, linkId, 94084)).toEqual({
      status: 'ok',
      wholeRows: 0,
      copies: 0,
    });
    expect(await righeDi(userId)).toEqual(prima);

    await importLibrary(account, [
      {
        externalId: TOKI_NINTENDO,
        name: 'Toki',
        platformSlug: 'nintendo_switch',
      },
    ]);
    expect((await righeDi(userId)).map((r) => r.gameId)).toEqual([remake.id]);
  });

  it('crea il gioco giusto se il catalogo non ce l ha, ma solo alla conferma', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    mockedFindById.mockResolvedValue(igdbHit(94084, 'Toki'));
    const userId = await createUser();
    const account = await linkStoreAccount(userId, 'nintendo');
    await riga(userId, arcade.id, [
      { store: 'nintendo', accountId: account.id },
    ]);

    const anteprima = await previewRepoint(linkId, 94084);
    expect(anteprima).toMatchObject({
      status: 'ok',
      to: { id: null, name: 'Toki', inCatalog: false },
      moves: [
        { wholeRow: true, copies: [{ platformSlug: 'nintendo_switch' }] },
      ],
    });
    // L'anteprima non scrive niente.
    expect(await db.select().from(schema.games)).toHaveLength(1);

    await repointLink(userId, linkId, 94084);
    expect(await db.select().from(schema.games)).toHaveLength(2);
  });

  it('l anteprima avvisa degli altri id dello stesso negozio sul gioco sbagliato', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    await createGame({ igdbId: 94084 });
    await db.insert(schema.externalIds).values({
      gameId: arcade.id,
      source: 'nintendo',
      externalId: '0100aaaa00000000',
    });

    expect(await previewRepoint(linkId, 94084)).toMatchObject({
      otherIdsSameStore: [{ externalId: '0100aaaa00000000' }],
    });
  });

  it('chiude le segnalazioni su quella copia, non le altre', async () => {
    const { arcade, linkId } = await tokiSbagliato();
    await createGame({ igdbId: 94084 });
    const userId = await createUser();
    const account = await linkStoreAccount(userId, 'nintendo');
    await riga(userId, arcade.id, [
      { store: 'nintendo', accountId: account.id },
    ]);
    await createReports(userId, {
      gameId: arcade.id,
      targets: [{ store: 'nintendo' }, { source: 'metacritic' }],
      suggestedIgdbId: 94084,
    });

    await repointLink(userId, linkId, 94084);

    expect(
      (await openReportsForGame(userId, arcade.id)).map((r) => r.source),
    ).toEqual(['metacritic']);
  });
});

describe('«Collega a IGDB»', () => {
  it('collega un gioco senza id e lo mette in coda', async () => {
    const gioco = await createGame({ igdbId: null, name: 'Inserito a mano' });
    mockedFindById.mockResolvedValue(igdbHit(555, 'Il gioco vero'));

    expect(await listUnlinkedGames({ limit: 50, offset: 0 })).toMatchObject({
      total: 1,
    });
    expect(await linkGameToIgdb(gioco.id, 555)).toEqual({ status: 'ok' });

    const [riga] = await db
      .select({ igdbId: schema.games.igdbId })
      .from(schema.games)
      .where(eq(schema.games.id, gioco.id));
    expect(riga!.igdbId).toBe(555);
    const igdb = await db.query.gameSources.findFirst({
      where: and(
        eq(schema.gameSources.gameId, gioco.id),
        eq(schema.gameSources.source, 'igdb'),
      ),
    });
    expect(igdb?.status).toBe('pending');
  });

  it("si rifiuta se l'id è già di un altro gioco: quella è una fusione", async () => {
    await createGame({ igdbId: 555, name: 'Il gioco vero' });
    const gioco = await createGame({ igdbId: null });

    expect(await linkGameToIgdb(gioco.id, 555)).toEqual({
      status: 'taken',
      game: 'Il gioco vero',
    });
  });
});

describe('la scheda admin di un gioco', () => {
  it('conta copie e utenti per negozio, e mostra le segnalazioni aperte', async () => {
    const { arcade } = await tokiSbagliato();
    const userId = await createUser();
    const account = await linkStoreAccount(userId, 'nintendo');
    await riga(userId, arcade.id, [
      { store: 'nintendo', accountId: account.id },
    ]);
    await createReports(userId, {
      gameId: arcade.id,
      targets: [{ store: 'nintendo' }],
      suggestedName: 'Toki 2018',
    });

    await db
      .insert(schema.externalIds)
      .values({ gameId: arcade.id, source: 'steam', externalId: '1058320' });
    await db
      .insert(schema.gameSources)
      .values({
        gameId: arcade.id,
        source: 'hltb',
        status: 'ok',
        externalId: '5023',
      });

    const detail = await gameAdminDetail(arcade.slug);

    expect(detail).toMatchObject({
      game: { name: 'Toki', users: 1 },
      // Nintendo un link non lo dà; Steam lo si ricava dall'appid.
      links: expect.arrayContaining([
        expect.objectContaining({
          source: 'nintendo',
          externalId: TOKI_NINTENDO,
          users: 1,
          copies: 1,
          url: null,
        }),
        expect.objectContaining({
          source: 'steam',
          url: 'https://store.steampowered.com/app/1058320',
        }),
      ]),
      sources: [
        expect.objectContaining({
          source: 'hltb',
          url: 'https://howlongtobeat.com/game/5023',
        }),
      ],
      reports: [
        {
          store: 'nintendo',
          users: 1,
          suggestions: [{ igdbId: null, name: 'Toki 2018' }],
        },
      ],
    });
  });
});
