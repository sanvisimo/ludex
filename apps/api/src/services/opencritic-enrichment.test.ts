import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, openCriticGame, setSource } from '../../test/factories';
import {
  OpenCriticQuotaError,
  fetchOpenCriticGame,
  searchOpenCriticGames,
} from '../external/opencritic';
import { enrichGameFromOpenCritic } from './opencritic-enrichment';

// Stubbato al confine del modulo esterno e non su `fetch`: il client vero si
// porta dietro il ritmatore e il contatore del budget, due cose che in un test
// sono solo attesa e stato condiviso fra casi.
vi.mock('../external/opencritic', async (importOriginal) => {
  const vero = await importOriginal<typeof import('../external/opencritic')>();
  return {
    // La classe dell'errore di budget arriva da quella vera: il servizio la
    // riconosce con `instanceof`, e una copia non sarebbe la stessa classe.
    OpenCriticQuotaError: vero.OpenCriticQuotaError,
    searchOpenCriticGames: vi.fn(),
    fetchOpenCriticGame: vi.fn(),
    openCriticQuota: vi.fn(() => ({ requests: 100, searches: 10 })),
  };
});

const mockedSearch = vi.mocked(searchOpenCriticGames);
const mockedDetail = vi.mocked(fetchOpenCriticGame);

beforeEach(() => {
  mockedSearch.mockReset();
  mockedDetail.mockReset();
});

const anno = (year: number) => new Date(Date.UTC(year, 0, 1));

function sourceRow(gameId: string) {
  return db.query.gameSources.findFirst({
    where: and(
      eq(schema.gameSources.gameId, gameId),
      eq(schema.gameSources.source, 'opencritic'),
    ),
  });
}

function scoreRows(gameId: string) {
  return db
    .select()
    .from(schema.gameScores)
    .where(eq(schema.gameScores.gameId, gameId));
}

function gameRow(gameId: string) {
  return db.query.games.findFirst({ where: eq(schema.games.id, gameId) });
}

describe('enrichGameFromOpenCritic', () => {
  it("va dritto alla scheda quando l'id è già agganciato, senza cercare", async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    await setSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'pending',
      externalId: '4002',
    });
    mockedDetail.mockResolvedValue(openCriticGame());

    const esito = await enrichGameFromOpenCritic(game.id);

    expect(esito).toMatchObject({ status: 'ok', openCriticId: 4002, via: 'id' });
    // È il punto di tutto lo step: l'aggancio da Wikidata costa zero ricerche.
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(await scoreRows(game.id)).toMatchObject([
      {
        source: 'opencritic',
        platformSlug: null,
        score: 89.5,
        reviewCount: 74,
        tier: 'Mighty',
      },
    ]);
    expect(await gameRow(game.id)).toMatchObject({
      criticScore: 89.5,
      criticScoreSource: 'opencritic',
    });
  });

  it('cerca per nome solo quando un id non ce l\'ha', async () => {
    const game = await createGame({
      name: 'Hollow Knight',
      firstReleaseDate: anno(2017),
    });
    mockedSearch.mockResolvedValue([
      { id: 4002, name: 'Hollow Knight' },
      { id: 6664, name: 'Hollow Knight: Voidheart Edition' },
    ]);
    mockedDetail.mockResolvedValue(openCriticGame());

    const esito = await enrichGameFromOpenCritic(game.id);

    expect(esito).toMatchObject({ status: 'ok', via: 'nome' });
    expect(await sourceRow(game.id)).toMatchObject({
      status: 'ok',
      externalId: '4002',
    });
  });

  it("rifiuta il candidato quando l'anno della scheda non torna", async () => {
    const game = await createGame({
      name: 'Resident Evil 4',
      firstReleaseDate: anno(2005),
    });
    mockedSearch.mockResolvedValue([{ id: 13724, name: 'Resident Evil 4' }]);
    mockedDetail.mockResolvedValue(
      openCriticGame({ id: 13724, name: 'Resident Evil 4', releaseYear: 2023 }),
    );

    const esito = await enrichGameFromOpenCritic(game.id);

    expect(esito).toMatchObject({ status: 'not_found' });
    const riga = await sourceRow(game.id);
    expect(riga).toMatchObject({ status: 'not_found', externalId: null });
    expect(riga?.error).toContain('2023');
    expect(await scoreRows(game.id)).toEqual([]);
  });

  it('non aggancia niente quando la ricerca restituisce solo titoli lontani', async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    // La ricerca di OpenCritic è larga: su "hollow knight" restituisce davvero
    // "Box Knight" e "Type Knight". Nessuno di questi somiglia abbastanza, e
    // agganciarne uno significherebbe attribuire a un gioco il voto di un
    // altro — peggio che non avere un voto.
    mockedSearch.mockResolvedValue([
      { id: 21225, name: 'Box Knight' },
      { id: 8552, name: 'Type Knight' },
    ]);

    const esito = await enrichGameFromOpenCritic(game.id);

    expect(esito).toMatchObject({ status: 'not_found' });
    // Non si spende nemmeno la richiesta della scheda: si è già deciso di no.
    expect(mockedDetail).not.toHaveBeenCalled();
    expect(await sourceRow(game.id)).toMatchObject({ status: 'not_found' });
  });

  it('aggancia anche un gioco senza recensioni, ma senza scrivergli un voto', async () => {
    const game = await createGame({ name: 'Gioco Nuovo' });
    await setSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'pending',
      externalId: '9999',
    });
    mockedDetail.mockResolvedValue(
      openCriticGame({ id: 9999, topCriticScore: null, numReviews: 0 }),
    );

    const esito = await enrichGameFromOpenCritic(game.id);

    // `ok` e non `not_found`: la voce l'abbiamo trovata, è il voto che non c'è
    // ancora. Segnarlo altrimenti vorrebbe dire ricercarlo per sempre.
    expect(esito).toMatchObject({ status: 'ok' });
    expect(await scoreRows(game.id)).toEqual([]);
    expect(await gameRow(game.id)).toMatchObject({ criticScore: null });
  });

  it('col budget esaurito non annota niente e rimanda a domani', async () => {
    const game = await createGame({ name: 'Hollow Knight' });
    mockedSearch.mockRejectedValue(new OpenCriticQuotaError('ricerche'));

    const esito = await enrichGameFromOpenCritic(game.id);

    expect(esito).toMatchObject({ status: 'deferred' });
    // Nessuna riga: se si scrivesse `failed`, `attempted_at` terrebbe indietro
    // il gioco di ventiquattr'ore per un muro che si apre da solo.
    expect(await sourceRow(game.id)).toBeUndefined();
  });

  it("rifiuta un id già agganciato a un altro gioco", async () => {
    const primo = await createGame({ name: 'Gioco Uno' });
    await setSource({
      gameId: primo.id,
      source: 'opencritic',
      status: 'ok',
      externalId: '4002',
    });

    const secondo = await createGame({ name: 'Hollow Knight' });
    mockedSearch.mockResolvedValue([{ id: 4002, name: 'Hollow Knight' }]);
    mockedDetail.mockResolvedValue(openCriticGame());

    const esito = await enrichGameFromOpenCritic(secondo.id);

    expect(esito).toMatchObject({ status: 'not_found' });
    expect(await sourceRow(secondo.id)).toMatchObject({
      status: 'not_found',
      externalId: null,
    });
    // E il gioco che l'aveva per primo non è stato toccato.
    expect(await sourceRow(primo.id)).toMatchObject({ externalId: '4002' });
  });
});
