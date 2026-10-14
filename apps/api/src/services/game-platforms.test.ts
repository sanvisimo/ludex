import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame } from '../../test/factories';
import { fetchIgdbGamePlatforms } from '../external/igdb';
import {
  backfillGamePlatforms,
  countGamesWithoutPlatforms,
} from './game-platforms';

// Stubbato al confine del modulo esterno, come per il tipo: il client vero
// serializza le richieste e si porta dietro un token in cache.
vi.mock('../external/igdb', () => ({ fetchIgdbGamePlatforms: vi.fn() }));

const mockedFetch = vi.mocked(fetchIgdbGamePlatforms);

const platformsOf = async (id: string) =>
  (await db.query.games.findFirst({ where: eq(schema.games.id, id) }))
    ?.platformIgdbIds ?? null;

describe('backfillGamePlatforms', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('riempie i giochi mai chiesti, in una richiesta sola', async () => {
    const a = await createGame({ igdbId: 1877 });
    const b = await createGame({ igdbId: 2000 });
    mockedFetch.mockResolvedValue(
      new Map([
        [1877, [6, 48, 167]],
        [2000, [165]],
      ]),
    );

    await expect(backfillGamePlatforms()).resolves.toMatchObject({
      scritti: 2,
    });

    expect(mockedFetch).toHaveBeenCalledOnce();
    expect(await platformsOf(a.id)).toEqual([6, 48, 167]);
    expect(await platformsOf(b.id)).toEqual([165]);
  });

  it('la lista vuota di IGDB chiude il gioco, che non si richiede', async () => {
    const game = await createGame({ igdbId: 1877 });
    mockedFetch.mockResolvedValue(new Map([[1877, []]]));
    await backfillGamePlatforms();
    mockedFetch.mockClear();

    await expect(backfillGamePlatforms()).resolves.toEqual({
      candidati: 0,
      trovati: 0,
      scritti: 0,
    });
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(await platformsOf(game.id)).toEqual([]);
  });

  it('un gioco che IGDB non conosce resta da chiedere', async () => {
    const game = await createGame({ igdbId: 4242 });
    mockedFetch.mockResolvedValue(new Map());

    await expect(backfillGamePlatforms()).resolves.toMatchObject({
      candidati: 1,
      scritti: 0,
    });
    expect(await platformsOf(game.id)).toBeNull();
    expect(await countGamesWithoutPlatforms()).toBe(1);
  });

  it('salta i giochi senza igdbId, che IGDB non saprebbe cercare', async () => {
    await createGame({ igdbId: null });
    mockedFetch.mockResolvedValue(new Map());

    await expect(backfillGamePlatforms()).resolves.toEqual({
      candidati: 0,
      trovati: 0,
      scritti: 0,
    });
    expect(await countGamesWithoutPlatforms()).toBe(0);
  });
});
