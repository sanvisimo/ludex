import { readFileSync } from 'node:fs';

import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import {
  findIgdbGamesByExternalIds,
  findIgdbGamesBySource,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import { enqueueFileImport, type FileJobEntry } from '../queue/imports';
import { runFileImportJob } from './import-jobs';
import { importLibrary } from './library-import';
import { findAccountsDueForImport } from './library-sync';
import { csvImportStatus, importCsvFile, previewCsvFile } from './csv-import';
import { listStoreAccounts } from './store-accounts';
import { resolveUnresolvedImport } from './unresolved-imports';

// Contro un Postgres vero; IGDB e le code stubbati al confine del modulo, come
// per i negozi.

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
vi.mock('../queue/imports', () => ({
  enqueueFileImport: vi.fn(),
  isImportRunning: vi.fn(),
}));

const mockedSearch = vi.mocked(searchIgdbGames);
const mockedBySource = vi.mocked(findIgdbGamesBySource);

const hit = (
  igdbId: number,
  name: string,
  releaseYear: number | null = null,
) => ({
  igdbId,
  name,
  releaseYear,
  developer: null,
  cover: null,
  gameType: null,
  totalRatingCount: null,
  platformIds: [],
});

const voce = (
  over: Partial<FileJobEntry> & { externalId: string },
): FileJobEntry => ({
  name: over.externalId,
  retryWithoutYear: true,
  ...over,
});

async function fileAccount(userId: string, store: Store) {
  const [row] = await db
    .insert(schema.storeAccounts)
    .values({
      userId,
      store,
      externalAccountId: 'csv',
      fromFile: true,
      autoSync: false,
    })
    .returning();
  return row!;
}

async function copie(userId: string) {
  return db
    .select({
      name: schema.games.name,
      store: schema.ownerships.store,
      storeAccountId: schema.ownerships.storeAccountId,
      status: schema.backlog.status,
    })
    .from(schema.ownerships)
    .innerJoin(
      schema.backlog,
      eq(schema.backlog.id, schema.ownerships.backlogId),
    )
    .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
    .where(eq(schema.backlog.userId, userId))
    .orderBy(schema.games.name, schema.ownerships.store);
}

const TAG = 'Importato il 19/10/2026';
const runJob = (storeAccountId: string, entries: FileJobEntry[]) =>
  runFileImportJob(storeAccountId, entries, TAG);

async function link(gameId: string, source: Store, externalId: string) {
  await db.insert(schema.externalIds).values({ gameId, source, externalId });
}

describe('importCsvFile', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('accoda un import per negozio e salta ciò che non sa dove mettere', async () => {
    const testo = readFileSync(
      new URL(
        '../../test/fixtures/playnite-export-2026-08.csv',
        import.meta.url,
      ),
      'utf8',
    );

    const report = await importCsvFile(userId, testo, TAG);

    // Le cinque Xbox portano più piattaforme per riga: fuori, per ora.
    expect(report.noPlatform).toBe(5);
    expect(report.queued).toEqual(
      expect.arrayContaining([
        { store: 'amazon', entries: 12 },
        { store: 'ubisoft', entries: 3 },
      ]),
    );
    expect(report.queued).toHaveLength(2);

    const interni = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.userId, userId));
    expect(interni).toHaveLength(2);
    for (const account of interni) {
      expect(account).toMatchObject({
        externalAccountId: 'csv',
        fromFile: true,
        autoSync: false,
        status: 'ok',
      });
    }

    const [, job] = vi
      .mocked(enqueueFileImport)
      .mock.calls.find(([store]) => store === 'ubisoft')!;
    expect(job.tag).toBe(TAG);
    expect(job.entries[0]).toMatchObject({
      retryWithoutYear: true,
      platformSlug: null,
    });
  });

  it('senza id la voce è il nome; la piattaforma console si legge dal nome', async () => {
    await importCsvFile(
      userId,
      'Name,Sources,Platforms\nAstro  Bot,PlayStation,Sony PlayStation 5\nAstro Bot,PlayStation,Sony PlayStation 5\n',
      TAG,
    );

    const [, job] = vi.mocked(enqueueFileImport).mock.calls[0]!;
    // Due righe con lo stesso nome sono la stessa voce.
    expect(job.entries).toEqual([
      expect.objectContaining({
        externalId: 'name:astro bot',
        platformSlug: 'sony_playstation5',
      }),
    ]);
  });

  it('salta le righe escluse nell’anteprima e i doppioni nel file', async () => {
    const report = await importCsvFile(
      userId,
      'Name,Sources,Game Id\nUNO,Ubisoft,1\nUNO bis,Ubisoft,1\nFor Honor,Ubisoft,2\nAnno 1800,Ubisoft,3\n',
      TAG,
      [2],
    );

    expect(report).toMatchObject({
      queued: [{ store: 'ubisoft', entries: 2 }],
      duplicates: 1,
    });
    const [, job] = vi.mocked(enqueueFileImport).mock.calls[0]!;
    expect(job.entries.map((entry) => entry.name)).toEqual([
      'UNO',
      'Anno 1800',
    ]);
  });

  it('niente da accodare: nessun tag, nessun account', async () => {
    const report = await importCsvFile(
      userId,
      'Name,Sources\nUNO,Ubisoft\n',
      TAG,
      [0],
    );

    expect(report).toMatchObject({ tagId: null, queued: [] });
    expect(vi.mocked(enqueueFileImport)).not.toHaveBeenCalled();
  });

  it('non è una libreria: non compare fra gli account e non si aggiorna da sola', async () => {
    await importCsvFile(userId, 'Name,Sources\nUNO,Ubisoft Connect\n', TAG);

    expect(await listStoreAccounts(userId)).toEqual([]);
    expect(await findAccountsDueForImport()).toHaveLength(0);
  });

  it('lo stato dice l’ultimo import finito', async () => {
    expect(await csvImportStatus(userId)).toEqual({
      lastImportAt: null,
      syncing: false,
    });

    const account = await fileAccount(userId, 'ubisoft');
    const quando = new Date('2026-10-19T10:00:00Z');
    await db
      .update(schema.storeAccounts)
      .set({ lastSyncAt: quando })
      .where(eq(schema.storeAccounts.id, account.id));

    expect(await csvImportStatus(userId)).toEqual({
      lastImportAt: quando,
      syncing: false,
    });
  });
});

describe('previewCsvFile', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('dice per ogni riga cosa farebbe l’import, senza scrivere niente', async () => {
    const { id: nuovo } = await createGame({ igdbId: 10, name: 'Anno 1800' });
    const { id: gia } = await createGame({ igdbId: 11, name: 'Far Cry 5' });
    await link(nuovo, 'ubisoft', '3');
    await link(gia, 'ubisoft', '4');
    await db.insert(schema.backlog).values({ userId, gameId: gia });

    const rows = await previewCsvFile(
      userId,
      [
        'Name,Sources,Game Id,Platforms,Completion Status',
        'Anno 1800,Ubisoft Connect,3,,Completed',
        'Far Cry 5,Ubisoft Connect,4,,',
        'Hungry Shark World,Ubisoft Connect,5,,',
        'Anno 1800 di nuovo,Ubisoft Connect,3,,',
        'Halo,Xbox,6,"Microsoft Xbox One, PC (Windows)",',
        'Balatro,itch.io,7,,',
        'Astro Bot,PlayStation,,Sony PlayStation 5,',
      ].join('\n'),
    );

    expect(
      rows.map(({ index, outcome, skipReason, game, platform, status }) => ({
        index,
        outcome,
        skipReason,
        game: game?.name ?? null,
        platform,
        status,
      })),
    ).toEqual([
      {
        index: 0,
        outcome: 'new',
        skipReason: null,
        game: 'Anno 1800',
        platform: 'PC (Windows)',
        status: 'completed',
      },
      {
        index: 1,
        outcome: 'in_backlog',
        skipReason: null,
        game: 'Far Cry 5',
        platform: 'PC (Windows)',
        status: 'backlog',
      },
      {
        index: 2,
        outcome: 'unknown',
        skipReason: null,
        game: null,
        platform: 'PC (Windows)',
        status: 'backlog',
      },
      {
        index: 3,
        outcome: 'skipped',
        skipReason: 'duplicate',
        game: null,
        platform: 'PC (Windows)',
        status: 'backlog',
      },
      {
        index: 4,
        outcome: 'skipped',
        skipReason: 'platform',
        game: null,
        platform: null,
        status: 'backlog',
      },
      {
        index: 5,
        outcome: 'skipped',
        skipReason: 'no_store',
        game: null,
        platform: null,
        status: 'backlog',
      },
      {
        index: 6,
        outcome: 'unknown',
        skipReason: null,
        game: null,
        platform: 'Sony PlayStation 5',
        status: 'backlog',
      },
    ]);

    const scritti = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.userId, userId));
    expect(scritti).toEqual([]);
  });
});

describe('runFileImportJob', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
    vi.mocked(findIgdbGamesByExternalIds).mockResolvedValue(new Map());
    vi.mocked(igdbSourceFor).mockReturnValue(null);
    mockedSearch.mockResolvedValue([]);
    mockedBySource.mockResolvedValue(new Map());
  });

  it('stato, categorie e tag del file solo per le righe che nascono', async () => {
    const scheda = await fileAccount(userId, 'ubisoft');
    const { id: gia } = await createGame({ igdbId: 2, name: 'Far Cry 5' });
    await db
      .insert(schema.backlog)
      .values({ userId, gameId: gia, status: 'playing' });
    mockedSearch.mockImplementation(async (term) =>
      term.includes('valiant')
        ? [hit(1, 'Valiant Hearts')]
        : [hit(2, 'Far Cry 5')],
    );

    await runJob(scheda.id, [
      voce({
        externalId: '10',
        name: 'Valiant Hearts',
        status: 'completed',
        categories: ['worth to play'],
        playtimeMinutes: 90,
        lastPlayedAt: '2024-04-24T00:00:00.000Z',
      }),
      voce({ externalId: '11', name: 'Far Cry 5', status: 'excluded' }),
    ]);

    expect(await copie(userId)).toEqual([
      {
        name: 'Far Cry 5',
        store: 'ubisoft',
        storeAccountId: scheda.id,
        status: 'playing',
      },
      {
        name: 'Valiant Hearts',
        store: 'ubisoft',
        storeAccountId: scheda.id,
        status: 'completed',
      },
    ]);

    const tag = await db
      .select({ name: schema.userTags.name, kind: schema.userTags.kind })
      .from(schema.backlogTags)
      .innerJoin(
        schema.userTags,
        eq(schema.userTags.id, schema.backlogTags.tagId),
      )
      .where(eq(schema.userTags.userId, userId))
      .orderBy(schema.userTags.kind);
    // Solo sul gioco nato col file: Far Cry 5 c'era già, e non li prende.
    expect(tag).toEqual([
      { name: 'Importato il 19/10/2026', kind: 'tag' },
      { name: 'worth to play', kind: 'category' },
    ]);
  });

  it('il nome prima, poi il nome senza l’anno, poi l’appid', async () => {
    const scheda = await fileAccount(userId, 'ubisoft');
    mockedSearch.mockImplementation(async (term) => {
      if (term.includes('liberation')) return [hit(20, 'Liberation HD', 2014)];
      if (term.includes('ii')) return [hit(21, "Assassin's Creed II", 2009)];
      return [];
    });
    mockedBySource.mockResolvedValue(
      new Map([
        // L'appid di _Liberation HD_ porta a un altro gioco: il nome vince.
        ['300', { igdbId: 99, name: 'Liberation', releaseYear: 2012 }],
        ['301', { igdbId: 22, name: 'For Honor', releaseYear: 2017 }],
        [
          '302',
          {
            igdbId: 23,
            name: 'Una raccolta',
            releaseYear: null,
            gameType: 'bundle' as const,
          },
        ],
      ]),
    );

    await runJob(scheda.id, [
      voce({
        externalId: 'a',
        name: 'Liberation HD',
        releaseYear: 2014,
        igdbHint: { source: 1, uid: '300' },
      }),
      // Playnite la data alla riedizione: con l'anno non si trova.
      voce({ externalId: 'b', name: "Assassin's Creed II", releaseYear: 2016 }),
      voce({
        externalId: 'c',
        name: 'FOR HONOR',
        igdbHint: { source: 1, uid: '301' },
      }),
      // Una raccolta trovata per indizio non vale.
      voce({
        externalId: 'd',
        name: 'Qualcosa',
        igdbHint: { source: 1, uid: '302' },
      }),
    ]);

    expect((await copie(userId)).map((copia) => copia.name)).toEqual([
      "Assassin's Creed II",
      'For Honor',
      'Liberation HD',
    ]);
    const scarti = await db
      .select({ externalId: schema.unresolvedImports.externalId })
      .from(schema.unresolvedImports)
      .where(eq(schema.unresolvedImports.storeAccountId, scheda.id));
    expect(scarti).toEqual([{ externalId: 'd' }]);
  });

  it('non scrive la copia che un collegamento vero ha già', async () => {
    const steam = await linkStoreAccount(userId, 'steam');
    const scheda = await fileAccount(userId, 'steam');
    const { id: game } = await createGame({ igdbId: 5, name: 'Portal' });
    await link(game, 'steam', '400');
    await importLibrary(steam, [{ externalId: '400', name: 'Portal' }]);

    await runJob(scheda.id, [voce({ externalId: '400', name: 'Portal' })]);

    expect(await copie(userId)).toEqual([
      expect.objectContaining({ store: 'steam', storeAccountId: steam.id }),
    ]);
  });

  it('un collegamento vero si prende la copia del file', async () => {
    const scheda = await fileAccount(userId, 'ea');
    const { id: game } = await createGame({ igdbId: 6, name: 'Mass Effect' });
    await link(game, 'ea', 'mass-effect');
    await runJob(scheda.id, [
      voce({
        externalId: 'mass-effect',
        name: 'Mass Effect',
        status: 'played',
      }),
    ]);

    const ea = await linkStoreAccount(userId, 'ea');
    await importLibrary(ea, [
      { externalId: 'mass-effect', name: 'Mass Effect' },
    ]);

    expect(await copie(userId)).toEqual([
      {
        name: 'Mass Effect',
        store: 'ea',
        storeAccountId: ea.id,
        status: 'played',
      },
    ]);
  });

  it('reimportare un negozio non tocca gli scarti dell’altro', async () => {
    const ubisoft = await fileAccount(userId, 'ubisoft');
    const ea = await fileAccount(userId, 'ea');
    await runJob(ubisoft.id, [voce({ externalId: 'u', name: 'Ignoto U' })]);
    await runJob(ea.id, [voce({ externalId: 'e', name: 'Ignoto E' })]);

    await runJob(ubisoft.id, [voce({ externalId: 'u', name: 'Ignoto U' })]);

    const scarti = await db
      .select({ store: schema.unresolvedImports.store })
      .from(schema.unresolvedImports)
      .where(
        and(
          eq(schema.unresolvedImports.userId, userId),
          eq(schema.unresolvedImports.store, 'ea'),
        ),
      );
    expect(scarti).toHaveLength(1);
  });

  it('uno scarto del CSV collegato a mano nasce con stato, categorie e tag del file', async () => {
    const scheda = await fileAccount(userId, 'ubisoft');
    await createGame({ igdbId: 30, name: 'Prince of Persia' });
    const { id: gia } = await createGame({ igdbId: 31, name: 'MONOPOLY' });
    await db.insert(schema.backlog).values({ userId, gameId: gia });

    // Nessun risultato su IGDB: tutte e due negli scarti.
    await runJob(scheda.id, [
      voce({
        externalId: '277',
        name: 'Prince of Persia',
        status: 'completed',
        categories: ['worth to play'],
      }),
      voce({ externalId: '926', name: 'MONOPOLY', status: 'played' }),
    ]);
    const scarti = await db
      .select({
        id: schema.unresolvedImports.id,
        externalId: schema.unresolvedImports.externalId,
        atBirth: schema.unresolvedImports.atBirth,
      })
      .from(schema.unresolvedImports)
      .where(eq(schema.unresolvedImports.storeAccountId, scheda.id))
      .orderBy(schema.unresolvedImports.externalId);
    expect(scarti.map((scarto) => scarto.atBirth)).toEqual([
      {
        status: 'completed',
        categories: ['worth to play'],
        tags: [TAG],
      },
      { status: 'played', tags: [TAG] },
    ]);

    await resolveUnresolvedImport(userId, scarti[0]!.id, 30);
    // Su un gioco che c'era già, la riga resta com'è.
    await resolveUnresolvedImport(userId, scarti[1]!.id, 31);

    expect(
      (await copie(userId)).map(({ name, status }) => ({ name, status })),
    ).toEqual([
      { name: 'MONOPOLY', status: 'backlog' },
      { name: 'Prince of Persia', status: 'completed' },
    ]);
    const tag = await db
      .select({ game: schema.games.name, name: schema.userTags.name })
      .from(schema.backlogTags)
      .innerJoin(
        schema.userTags,
        eq(schema.userTags.id, schema.backlogTags.tagId),
      )
      .innerJoin(
        schema.backlog,
        eq(schema.backlog.id, schema.backlogTags.backlogId),
      )
      .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
      .where(eq(schema.userTags.userId, userId))
      .orderBy(schema.userTags.name);
    expect(tag).toEqual([
      { game: 'Prince of Persia', name: TAG },
      { game: 'Prince of Persia', name: 'worth to play' },
    ]);
  });

  it('rifiuta un account che non è da file', async () => {
    const steam = await linkStoreAccount(userId, 'steam');

    await expect(runJob(steam.id, [voce({ externalId: '1' })])).rejects.toThrow(
      'non è un account da file',
    );
  });
});
