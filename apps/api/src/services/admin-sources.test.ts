import { readFileSync } from 'node:fs';

import { db, schema } from '@repo/db';
import { and, eq, sql } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  createUser,
  hltbDetail,
  hltbHit,
  setSource,
} from '../../test/factories';
import { fetchHltbGameDetail, searchHltbGames } from '../external/hltb';
import { enqueueEnrichment } from '../queue/enrichment';
import {
  findSourceIdOwner,
  listMissing,
  missingSummary,
  parseSourceId,
  retrySource,
  setSourceExternalId,
} from './admin-sources';
import { enrichGameFromHltb } from './hltb-enrichment';

vi.mock('../external/hltb', () => ({
  searchHltbGames: vi.fn(),
  fetchHltbGameDetail: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedSearch = vi.mocked(searchHltbGames);
const mockedDetail = vi.mocked(fetchHltbGameDetail);
const mockedEnqueue = vi.mocked(enqueueEnrichment);

const hltbRow = (gameId: string) =>
  db.query.gameSources.findFirst({
    where: and(
      eq(schema.gameSources.gameId, gameId),
      eq(schema.gameSources.source, 'hltb'),
    ),
  });

const anno = (year: number) => new Date(Date.UTC(year, 0, 1));

// MGS3 è una voce HLTB sola, 5913, che port e originale condividono davvero.
const mgs3 = { hltbId: 5913, name: 'Metal Gear Solid 3: Snake Eater' };

describe('«Inserisci id»', () => {
  it("accetta un id già di un altro gioco, lo marca manuale e l'enrichment va per id", async () => {
    const originale = await createGame({ name: mgs3.name });
    await setSource({
      gameId: originale.id,
      source: 'hltb',
      status: 'ok',
      externalId: '5913',
    });
    const port = await createGame({
      name: 'Metal Gear Solid 3: Snake Eater - Master Collection Version',
      firstReleaseDate: anno(2023),
    });

    await setSourceExternalId(port.id, 'hltb', '5913');

    expect(await hltbRow(port.id)).toMatchObject({
      status: 'pending',
      externalId: '5913',
      manual: true,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith('hltb', port.id);

    mockedDetail.mockResolvedValue(hltbDetail(mgs3));
    const esito = await enrichGameFromHltb(port.id);

    // Per id: la ricerca per nome, quella che aveva bocciato il candidato con
    // 0.37, non si rifà.
    expect(esito).toMatchObject({ status: 'ok' });
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(await hltbRow(port.id)).toMatchObject({
      status: 'ok',
      externalId: '5913',
      manual: true,
    });
  });

  it('vale anche su una fonte `ok` agganciata male, e la riapre', async () => {
    const gioco = await createGame();
    await setSource({
      gameId: gioco.id,
      source: 'hltb',
      status: 'ok',
      externalId: '1',
    });

    await setSourceExternalId(gioco.id, 'hltb', '5913');

    expect(await hltbRow(gioco.id)).toMatchObject({
      status: 'pending',
      externalId: '5913',
      manual: true,
    });
  });

  it('dice di chi è già un id, escluso il gioco stesso', async () => {
    const originale = await createGame({ name: mgs3.name });
    await setSource({
      gameId: originale.id,
      source: 'hltb',
      status: 'ok',
      externalId: '5913',
    });

    expect(await findSourceIdOwner('hltb', '5913')).toMatchObject({
      name: mgs3.name,
    });
    expect(await findSourceIdOwner('hltb', '5913', originale.id)).toBeNull();
  });
});

describe("l'unicità degli id delle fonti", () => {
  it('ferma ancora un match automatico su un id già di un altro gioco automatico', async () => {
    const originale = await createGame({ name: mgs3.name });
    await setSource({
      gameId: originale.id,
      source: 'hltb',
      status: 'ok',
      externalId: '5913',
    });
    const doppione = await createGame({ name: mgs3.name });
    mockedSearch.mockResolvedValue([hltbHit({ ...mgs3, releaseYear: null })]);
    mockedDetail.mockResolvedValue(hltbDetail(mgs3));

    await enrichGameFromHltb(doppione.id);

    expect(await hltbRow(doppione.id)).toMatchObject({
      status: 'not_found',
      reason: 'taken',
      externalId: null,
    });
  });

  it("non ferma l'originale che arriva dopo una riga manuale: la voce è sua", async () => {
    const port = await createGame({ name: 'MGS3 Master Collection' });
    await setSourceExternalId(port.id, 'hltb', '5913');
    const originale = await createGame({ name: mgs3.name });
    mockedSearch.mockResolvedValue([hltbHit({ ...mgs3, releaseYear: null })]);
    mockedDetail.mockResolvedValue(hltbDetail(mgs3));

    await enrichGameFromHltb(originale.id);

    expect(await hltbRow(originale.id)).toMatchObject({
      status: 'ok',
      externalId: '5913',
      manual: false,
    });
  });
});

describe('parseSourceId', () => {
  it("prende l'id nudo o dall'indirizzo della scheda", () => {
    expect(parseSourceId('hltb', '5913')).toBe('5913');
    expect(parseSourceId('hltb', 'https://howlongtobeat.com/game/5913')).toBe(
      '5913',
    );
    expect(
      parseSourceId(
        'opencritic',
        'https://opencritic.com/game/1548/hollow-knight',
      ),
    ).toBe('1548');
    expect(
      parseSourceId(
        'metacritic',
        'https://www.metacritic.com/game/hollow-knight/',
      ),
    ).toBe('hollow-knight');
    expect(parseSourceId('metacritic', 'hollow-knight')).toBe('hollow-knight');
  });

  it('rifiuta ciò che non è un id di quella fonte', () => {
    expect(parseSourceId('hltb', 'hollow knight')).toBeNull();
    expect(
      parseSourceId('hltb', 'https://opencritic.com/game/1548/x'),
    ).toBeNull();
    expect(parseSourceId('opencritic', '0')).toBeNull();
    expect(parseSourceId('metacritic', 'hollow knight')).toBeNull();
  });
});

describe('«Dati mancanti»', () => {
  it('separa il da sistemare dal giusto così, e conta i trovati ma vuoti', async () => {
    const vecchio = await createGame({ name: 'Vecchio' });
    await setSource({
      gameId: vecchio.id,
      source: 'opencritic',
      status: 'not_found',
      reason: 'too_old',
    });
    // «Non ha nulla» è da sistemare: può essere un nome cercato male.
    const nessuno = await createGame({ name: 'Nessuno' });
    await setSource({
      gameId: nessuno.id,
      source: 'opencritic',
      status: 'not_found',
      reason: 'no_results',
    });
    // Un motivo che la migration non ha saputo leggere: meglio mostrarlo.
    const ignoto = await createGame({ name: 'Ignoto' });
    await setSource({
      gameId: ignoto.id,
      source: 'opencritic',
      status: 'not_found',
    });
    const senzaDurata = await createGame({ name: 'Senza durata' });
    await setSource({ gameId: senzaDurata.id, source: 'hltb', status: 'ok' });
    const conDurata = await createGame({ hltbMainMinutes: 600 });
    await setSource({ gameId: conDurata.id, source: 'hltb', status: 'ok' });
    await createGame({ igdbId: null });

    const summary = await missingSummary();
    expect(summary.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'opencritic', fixable: 2, fine: 1 }),
        expect.objectContaining({ source: 'hltb', empty: 1 }),
      ]),
    );
    expect(summary.gamesWithoutIgdb).toBe(1);

    const fixable = await listMissing({
      source: 'opencritic',
      bucket: 'fixable',
      limit: 50,
      offset: 0,
    });
    expect(fixable.total).toBe(2);
    expect(fixable.rows.map((row) => row.name).sort()).toEqual([
      'Ignoto',
      'Nessuno',
    ]);

    const empty = await listMissing({
      source: 'hltb',
      bucket: 'empty',
      limit: 50,
      offset: 0,
    });
    expect(empty.rows.map((row) => row.name)).toEqual(['Senza durata']);
  });

  it('mette prima i giochi che hanno più utenti', async () => {
    const solo = await createGame({ name: 'A, di nessuno' });
    const condiviso = await createGame({ name: 'B, di due' });
    for (const gioco of [solo, condiviso])
      await setSource({
        gameId: gioco.id,
        source: 'hltb',
        status: 'not_found',
        reason: 'ambiguous',
      });
    for (const userId of [await createUser(), await createUser()])
      await db.insert(schema.backlog).values({ userId, gameId: condiviso.id });

    const { rows } = await listMissing({
      source: 'hltb',
      bucket: 'fixable',
      limit: 50,
      offset: 0,
    });

    expect(rows.map((row) => [row.name, row.users])).toEqual([
      ['B, di due', 2],
      ['A, di nessuno', 0],
    ]);
  });

  it('«Ritenta» rimette in coda e dimentica il motivo, tenendo l id', async () => {
    const gioco = await createGame();
    await setSource({
      gameId: gioco.id,
      source: 'hltb',
      status: 'not_found',
      reason: 'gone',
      error: 'la pagina HLTB 1 non esiste più',
      externalId: '1',
    });

    expect(await retrySource(gioco.id, 'hltb')).toBe(true);
    expect(await hltbRow(gioco.id)).toMatchObject({
      status: 'pending',
      reason: null,
      error: null,
      externalId: '1',
    });
    expect(mockedEnqueue).toHaveBeenCalledWith('hltb', gioco.id);
    expect(await retrySource(gioco.id, 'opencritic')).toBe(false);
  });
});

describe('la migration che classifica i `not_found` di prima', () => {
  // Il testo di ogni motivo, com'era scritto in `error` dai servizi al
  // 06/10/2026. La migration è già passata sul database di test quando i casi
  // girano: qui si rilancia la sua UPDATE su righe scritte apposta.
  const casi = [
    [
      'uscito nel 2009: OpenCritic nasce nel 2015 e non lo cerchiamo',
      'too_old',
    ],
    ['HLTB non ha nulla per "Trumpet"', 'no_results'],
    ['OpenCritic non ha nulla per "Trumpet"', 'no_results'],
    [
      'nessun candidato convincente per "Doom II Enhanced": Doom II (8060)',
      'ambiguous',
    ],
    ['nessuna scheda Metacritic convincente per "Toki"', 'ambiguous'],
    ['"Train Valley" (1919) è del 2015, il nostro del 2019', 'year_mismatch'],
    ['la voce HLTB scelta è già agganciata a un altro gioco', 'taken'],
    ['la scheda Metacritic scelta è già agganciata a un altro gioco', 'taken'],
    ['la pagina HLTB 1234 non esiste più', 'gone'],
    ['la scheda OpenCritic 1234 non esiste', 'gone'],
    ["IGDB non conosce l'id 42", 'gone'],
    ['un testo che nessuno ha mai scritto', null],
  ] as const;

  it('dà a ogni testo il suo motivo', async () => {
    const giochi = [];
    for (const [error] of casi) {
      const gioco = await createGame();
      await setSource({
        gameId: gioco.id,
        source: 'opencritic',
        status: 'not_found',
        error,
      });
      giochi.push(gioco.id);
    }

    const file = new URL(
      '../../../../packages/db/drizzle/0036_source_reason_backfill.sql',
      import.meta.url,
    );
    await db.execute(sql.raw(readFileSync(file, 'utf8')));

    const rows = await db
      .select({
        gameId: schema.gameSources.gameId,
        reason: schema.gameSources.reason,
      })
      .from(schema.gameSources);
    const reasonOf = new Map(rows.map((row) => [row.gameId, row.reason]));
    expect(giochi.map((id) => reasonOf.get(id))).toEqual(
      casi.map(([, reason]) => reason),
    );
  });
});

beforeEach(() => {
  mockedSearch.mockResolvedValue([]);
});
