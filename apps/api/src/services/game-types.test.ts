import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame } from '../../test/factories';
import { fetchIgdbGameTypes } from '../external/igdb';
import { backfillGameTypes, countGamesWithoutType } from './game-types';

// Stubbato al confine del modulo esterno, come per l'enrichment: il client vero
// serializza le richieste e si porta dietro un token in cache.
vi.mock('../external/igdb', () => ({ fetchIgdbGameTypes: vi.fn() }));

const mockedFetch = vi.mocked(fetchIgdbGameTypes);

const typeOf = async (id: string) =>
  (await db.query.games.findFirst({ where: eq(schema.games.id, id) }))
    ?.gameType ?? null;

describe('backfillGameTypes', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('riempie i giochi senza tipo, in una richiesta sola', async () => {
    const gioco = await createGame({ igdbId: 1877 });
    const dlc = await createGame({ igdbId: 2000 });
    mockedFetch.mockResolvedValue(
      new Map([
        [1877, { gameType: 'main_game' as const, parentIgdbId: null }],
        [2000, { gameType: 'dlc' as const, parentIgdbId: 1877 }],
      ]),
    );

    await expect(backfillGameTypes()).resolves.toMatchObject({ scritti: 2 });

    // Una chiamata per tutti: è la ragione per cui questo arnese esiste invece
    // di aspettare il rinfresco, che è un job per gioco.
    expect(mockedFetch).toHaveBeenCalledOnce();
    expect(await typeOf(gioco.id)).toBe('main_game');
    expect(
      await db.query.games.findFirst({ where: eq(schema.games.id, dlc.id) }),
    ).toMatchObject({ gameType: 'dlc', parentIgdbId: 1877 });
  });

  it('non richiede i giochi che il tipo ce l hanno già', async () => {
    const game = await createGame({ igdbId: 1877 });
    mockedFetch.mockResolvedValue(
      new Map([[1877, { gameType: 'remaster' as const, parentIgdbId: null }]]),
    );
    await backfillGameTypes();
    mockedFetch.mockClear();

    await expect(backfillGameTypes()).resolves.toEqual({
      candidati: 0,
      trovati: 0,
      scritti: 0,
    });
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(await typeOf(game.id)).toBe('remaster');
  });

  it('salta i giochi senza igdbId, che IGDB non saprebbe cercare', async () => {
    const manuale = await createGame({ igdbId: null });
    mockedFetch.mockResolvedValue(new Map());

    await expect(backfillGameTypes()).resolves.toEqual({
      candidati: 0,
      trovati: 0,
      scritti: 0,
    });
    expect(await typeOf(manuale.id)).toBeNull();
    expect(await countGamesWithoutType()).toBe(0);
  });

  it('un tipo che non sappiamo tradurre resta «non lo so», e si riprova', async () => {
    // IGDB può aggiungere un tipo dopo di noi: scrivere null sopra null non
    // servirebbe a niente, e il gioco deve restare candidato.
    const game = await createGame({ igdbId: 4242 });
    mockedFetch.mockResolvedValue(
      new Map([[4242, { gameType: null, parentIgdbId: null }]]),
    );

    await expect(backfillGameTypes()).resolves.toMatchObject({
      candidati: 1,
      trovati: 1,
      scritti: 0,
    });
    expect(await typeOf(game.id)).toBeNull();
    expect(await countGamesWithoutType()).toBe(1);
  });
});
