import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, igdbMetadata } from '../../test/factories';
import { fetchIgdbGamesMetadata } from '../external/igdb';
import {
  backfillGameMedia,
  countGamesWithoutMedia,
  mediaCoverage,
} from './game-media';

// Stubbato al confine del modulo esterno, come per l'enrichment: il client vero
// serializza le richieste e si porta dietro un token in cache.
vi.mock('../external/igdb', () => ({ fetchIgdbGamesMetadata: vi.fn() }));
// La scrittura è quella dell'enrichment, che si porta dietro la coda.
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedFetch = vi.mocked(fetchIgdbGamesMetadata);

const gameOf = (id: string) =>
  db.query.games.findFirst({ where: eq(schema.games.id, id) });

describe('backfillGameMedia', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('riempie i giochi mai passati dai campi nuovi, in una richiesta sola', async () => {
    const primo = await createGame({ igdbId: 1877 });
    const secondo = await createGame({ igdbId: 2000 });
    mockedFetch.mockResolvedValue(
      new Map([
        [
          1877,
          igdbMetadata({
            igdbId: 1877,
            artworkImageIds: ['ar1'],
            related: [
              { kind: 'remake', igdbId: 9, name: 'Remake', coverImageId: null },
            ],
          }),
        ],
        // IGDB non ne ha: la lista vuota è la risposta, e il gioco esce dai
        // candidati.
        [2000, igdbMetadata({ igdbId: 2000 })],
      ]),
    );

    await expect(backfillGameMedia()).resolves.toMatchObject({ scritti: 2 });

    expect(mockedFetch).toHaveBeenCalledOnce();
    expect(await gameOf(primo.id)).toMatchObject({ artworkImageIds: ['ar1'] });
    expect(await gameOf(secondo.id)).toMatchObject({ artworkImageIds: [] });
    expect(await countGamesWithoutMedia()).toBe(0);
    expect(await mediaCoverage()).toMatchObject({
      giochi: 2,
      artwork: 1,
      remake: 1,
      simili: 0,
    });
  });

  it('al secondo giro non richiede niente', async () => {
    await createGame({ igdbId: 1877 });
    mockedFetch.mockResolvedValue(
      new Map([[1877, igdbMetadata({ igdbId: 1877 })]]),
    );
    await backfillGameMedia();
    mockedFetch.mockClear();

    await expect(backfillGameMedia()).resolves.toEqual({
      candidati: 0,
      trovati: 0,
      scritti: 0,
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('salta i giochi senza igdbId, e lascia candidato chi IGDB non conosce', async () => {
    await createGame({ igdbId: null });
    const sparito = await createGame({ igdbId: 3000 });
    mockedFetch.mockResolvedValue(new Map());

    await expect(backfillGameMedia()).resolves.toEqual({
      candidati: 1,
      trovati: 0,
      scritti: 0,
    });
    expect(mockedFetch).toHaveBeenCalledWith([3000]);
    expect(await gameOf(sparito.id)).toMatchObject({ artworkImageIds: null });
  });
});
