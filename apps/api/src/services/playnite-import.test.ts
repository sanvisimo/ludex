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
import { importPlayniteFile } from './playnite-import';

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
      externalAccountId: 'playnite',
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

async function link(gameId: string, source: Store, externalId: string) {
  await db.insert(schema.externalIds).values({ gameId, source, externalId });
}

describe('importPlayniteFile', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('accoda una scheda da file per negozio e salta ciò che non sa dove mettere', async () => {
    const testo = readFileSync(
      new URL(
        '../../test/fixtures/playnite-export-2026-08.csv',
        import.meta.url,
      ),
      'utf8',
    );

    const report = await importPlayniteFile(userId, testo);

    // Le cinque Xbox portano più piattaforme per riga: fuori, per ora.
    expect(report.noPlatform).toBe(5);
    expect(
      report.queued.map(({ store, entries }) => ({ store, entries })),
    ).toEqual(
      expect.arrayContaining([
        { store: 'amazon', entries: 12 },
        { store: 'ubisoft', entries: 3 },
      ]),
    );
    expect(report.queued).toHaveLength(2);

    const schede = await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.userId, userId));
    expect(schede).toHaveLength(2);
    for (const scheda of schede) {
      expect(scheda).toMatchObject({
        externalAccountId: 'playnite',
        fromFile: true,
        autoSync: false,
        status: 'ok',
      });
    }

    const [, job] = vi
      .mocked(enqueueFileImport)
      .mock.calls.find(([store]) => store === 'ubisoft')!;
    expect(job.entries[0]).toMatchObject({
      retryWithoutYear: true,
      platformSlug: null,
    });
  });

  it('ricaricando il file ritrova la stessa scheda, anche scollegata', async () => {
    const testo = 'Nome,Id del gioco,Sorgenti\nUNO,1,Ubisoft Connect\n';
    const prima = await importPlayniteFile(userId, testo);
    await db
      .update(schema.storeAccounts)
      .set({ status: 'unlinked' })
      .where(eq(schema.storeAccounts.id, prima.queued[0]!.storeAccountId));

    const dopo = await importPlayniteFile(userId, testo);

    expect(dopo.queued[0]!.storeAccountId).toBe(
      prima.queued[0]!.storeAccountId,
    );
    const [scheda] = await db
      .select({ status: schema.storeAccounts.status })
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, prima.queued[0]!.storeAccountId));
    expect(scheda!.status).toBe('ok');
  });

  it('le schede da file non si aggiornano da sole', async () => {
    await fileAccount(userId, 'ubisoft');

    const dovuti = await findAccountsDueForImport();

    expect(dovuti).toHaveLength(0);
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

  it('stato e categorie di Playnite solo per le righe che nascono', async () => {
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

    await runFileImportJob(scheda.id, [
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
      .where(eq(schema.userTags.userId, userId));
    expect(tag).toEqual([{ name: 'worth to play', kind: 'category' }]);
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

    await runFileImportJob(scheda.id, [
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

    await runFileImportJob(scheda.id, [
      voce({ externalId: '400', name: 'Portal' }),
    ]);

    expect(await copie(userId)).toEqual([
      expect.objectContaining({ store: 'steam', storeAccountId: steam.id }),
    ]);
  });

  it('un collegamento vero si prende la copia del file', async () => {
    const scheda = await fileAccount(userId, 'ea');
    const { id: game } = await createGame({ igdbId: 6, name: 'Mass Effect' });
    await link(game, 'ea', 'mass-effect');
    await runFileImportJob(scheda.id, [
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
    await runFileImportJob(ubisoft.id, [
      voce({ externalId: 'u', name: 'Ignoto U' }),
    ]);
    await runFileImportJob(ea.id, [
      voce({ externalId: 'e', name: 'Ignoto E' }),
    ]);

    await runFileImportJob(ubisoft.id, [
      voce({ externalId: 'u', name: 'Ignoto U' }),
    ]);

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

  it('rifiuta un account che non è da file', async () => {
    const steam = await linkStoreAccount(userId, 'steam');

    await expect(
      runFileImportJob(steam.id, [voce({ externalId: '1' })]),
    ).rejects.toThrow('non è una scheda da file');
  });
});
