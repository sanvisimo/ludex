import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  linkSteamAppId,
  metacriticGame,
  setSource,
} from '../../test/factories';
import { fetchMetacriticGame, searchMetacriticGames } from '../external/metacritic';
import { fetchSteamMetacriticSlug } from '../external/steam';
import { enrichGameFromMetacritic } from './metacritic-enrichment';

vi.mock('../external/metacritic', () => ({
  searchMetacriticGames: vi.fn(),
  fetchMetacriticGame: vi.fn(),
}));

// Stubbato anche Steam: qui si prova che il link della scheda venga usato e
// verificato, non che il negozio risponda.
vi.mock('../external/steam', () => ({ fetchSteamMetacriticSlug: vi.fn() }));

const mockedSearch = vi.mocked(searchMetacriticGames);
const mockedDetail = vi.mocked(fetchMetacriticGame);
const mockedSteam = vi.mocked(fetchSteamMetacriticSlug);

beforeEach(() => {
  mockedSearch.mockReset();
  mockedDetail.mockReset();
  mockedSteam.mockReset();
  mockedSteam.mockResolvedValue(null);
});

const anno = (year: number) => new Date(Date.UTC(year, 0, 1));

function scoreRows(gameId: string) {
  return db
    .select()
    .from(schema.gameScores)
    .where(eq(schema.gameScores.gameId, gameId));
}

function sourceRow(gameId: string) {
  return db.query.gameSources.findFirst({
    where: and(
      eq(schema.gameSources.gameId, gameId),
      eq(schema.gameSources.source, 'metacritic'),
    ),
  });
}

describe('enrichGameFromMetacritic', () => {
  it('scrive il complessivo e una riga per piattaforma tradotta', async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    await setSource({
      gameId: game.id,
      source: 'metacritic',
      status: 'pending',
      externalId: 'hollow-knight',
    });
    mockedDetail.mockResolvedValue(metacriticGame());

    const esito = await enrichGameFromMetacritic(game.id);

    expect(esito).toMatchObject({ status: 'ok', via: 'slug', platforms: 2 });

    const righe = await scoreRows(game.id);
    // Due righe e non tre: iOS non è nella nostra tabella `platforms`, e un
    // voto per una piattaforma che nessuno può possedere non serve a niente.
    expect(righe.length).toBe(2);
    expect(righe.find((riga) => riga.platformSlug === null)).toMatchObject({
      score: 90,
      reviewCount: 30,
      positiveCount: 28,
      sentiment: 'Universal acclaim',
    });
    expect(
      righe.find((riga) => riga.platformSlug === 'pc_windows'),
    ).toMatchObject({ score: 87, reviewCount: 27 });
  });

  it('scarta la piattaforma su cui Metacritic si contraddice, e scrive il resto', async () => {
    // Il caso vero, su *Alien Breed*: la stessa pagina elenca due volte
    // `playstation-vita`, con lo stesso nome e le stesse nove recensioni ma
    // voti diversi. Prima faceva fallire **tutta** la scrittura — Postgres
    // rifiuta una ON CONFLICT che tocchi due volte la stessa riga — e il gioco
    // restava senza nessun voto, complessivo compreso.
    const game = await createGame({ name: 'Hollow Knight' });
    await setSource({
      gameId: game.id,
      source: 'metacritic',
      status: 'pending',
      externalId: 'hollow-knight',
    });

    const vita = (score: number, positiveCount: number) => ({
      slug: 'playstation-vita',
      name: 'PlayStation Vita',
      score: {
        score,
        reviewCount: 9,
        positiveCount,
        neutralCount: 5,
        negativeCount: 0,
        sentiment: 'Mixed or average',
      },
    });

    const base = metacriticGame();
    mockedDetail.mockResolvedValue({
      ...base,
      platforms: [...base.platforms, vita(64, 2), vita(68, 4)],
    });

    const esito = await enrichGameFromMetacritic(game.id);
    expect(esito).toMatchObject({ status: 'ok' });

    const righe = await scoreRows(game.id);
    // La Vita non c'è: fra due voti discordi non tocca a noi scegliere, e
    // mediarli darebbe un 66 che nessuno ha pubblicato.
    expect(righe.find((riga) => riga.platformSlug === 'sony_vita')).toBeUndefined();
    // Ma il complessivo e il PC sì: il dato rotto è di quella piattaforma sola.
    expect(righe.find((riga) => riga.platformSlug === null)).toMatchObject({
      score: 90,
    });
    expect(
      righe.find((riga) => riga.platformSlug === 'pc_windows'),
    ).toMatchObject({ score: 87 });
  });

  it('un doppione identico non è una contraddizione: si scrive una riga sola', async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    await setSource({
      gameId: game.id,
      source: 'metacritic',
      status: 'pending',
      externalId: 'hollow-knight',
    });

    const base = metacriticGame();
    mockedDetail.mockResolvedValue({
      ...base,
      platforms: [...base.platforms, base.platforms[0]!],
    });

    const esito = await enrichGameFromMetacritic(game.id);

    expect(esito).toMatchObject({ status: 'ok' });
    expect(
      (await scoreRows(game.id)).filter(
        (riga) => riga.platformSlug === 'pc_windows',
      ),
    ).toHaveLength(1);
  });

  it('usa il link della scheda Steam quando regge', async () => {
    const game = await createGame({
      name: 'Hollow Knight',
      firstReleaseDate: anno(2017),
    });
    await linkSteamAppId(game.id, '367520');
    mockedSteam.mockResolvedValue('hollow-knight');
    mockedDetail.mockResolvedValue(metacriticGame());

    const esito = await enrichGameFromMetacritic(game.id);

    expect(esito).toMatchObject({ status: 'ok', via: 'steam' });
    // Non si è cercato: il link ha fatto risparmiare la ricerca.
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(await sourceRow(game.id)).toMatchObject({
      status: 'ok',
      externalId: 'hollow-knight',
    });
  });

  it('non si fida del link Steam quando porta a un altro gioco', async () => {
    // Il caso vero: la scheda Steam di "Kingdom: Classic" dichiara `kingdom`,
    // che su Metacritic è un gioco diverso.
    const game = await createGame({
      name: 'Kingdom: Classic',
      firstReleaseDate: anno(2015),
    });
    await linkSteamAppId(game.id, '368230');
    mockedSteam.mockResolvedValue('kingdom');
    mockedDetail.mockImplementation(async (slug) =>
      slug === 'kingdom'
        ? metacriticGame({
            slug: 'kingdom',
            name: 'Kingdom Hearts',
            releaseYear: 2002,
          })
        : metacriticGame({
            slug: 'kingdom-classic',
            name: 'Kingdom: Classic',
            releaseYear: 2015,
          }),
    );
    mockedSearch.mockResolvedValue([
      { slug: 'kingdom-classic', name: 'Kingdom: Classic', releaseYear: 2015 },
    ]);

    const esito = await enrichGameFromMetacritic(game.id);

    expect(esito).toMatchObject({ status: 'ok', slug: 'kingdom-classic' });
  });

  it("sceglie fra due omonimi con l'anno", async () => {
    const game = await createGame({
      name: 'Resident Evil 4',
      firstReleaseDate: anno(2005),
    });
    mockedSearch.mockResolvedValue([
      { slug: 'resident-evil-4', name: 'Resident Evil 4', releaseYear: 2023 },
      {
        slug: 'resident-evil-4-2005',
        name: 'Resident Evil 4 (2005)',
        releaseYear: 2005,
      },
    ]);
    mockedDetail.mockResolvedValue(
      metacriticGame({
        slug: 'resident-evil-4-2005',
        name: 'Resident Evil 4 (2005)',
        releaseYear: 2005,
      }),
    );

    const esito = await enrichGameFromMetacritic(game.id);

    // Il remake del 2023 ha il titolo identico al nostro e perde comunque: la
    // penalità sull'anno vale più della somiglianza del nome.
    expect(esito).toMatchObject({ status: 'ok', slug: 'resident-evil-4-2005' });
  });

  it('non aggancia niente quando nessun candidato convince', async () => {
    const game = await createGame({ name: 'Gioco Oscuro' });
    mockedSearch.mockResolvedValue([
      { slug: 'tutt-altro', name: "Tutt'altra Cosa", releaseYear: 2012 },
    ]);

    const esito = await enrichGameFromMetacritic(game.id);

    expect(esito).toMatchObject({ status: 'not_found' });
    expect(await scoreRows(game.id)).toEqual([]);
    expect(await sourceRow(game.id)).toMatchObject({
      status: 'not_found',
      externalId: null,
    });
  });
});
