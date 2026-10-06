import { db, schema } from '@repo/db';
import { describe, expect, it, vi } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { searchIgdbGames } from '../external/igdb';
import { searchCatalog, searchIgdbNotInCatalog } from './catalog-search';

vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  findIgdbGameBySlug: vi.fn(),
  searchIgdbGames: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedSearch = vi.mocked(searchIgdbGames);

const hit = (igdbId: number, name: string) => ({
  igdbId,
  name,
  releaseYear: null,
  developer: null,
  gameType: null,
  totalRatingCount: null,
  platformIds: [],
  cover: null,
});

const pagina = { limit: 24, offset: 0 };

describe('searchCatalog', () => {
  it('cerca in tutto il catalogo, non solo nel backlog di chi cerca', async () => {
    const userId = await createUser();
    await createGame({ name: 'Hades' });

    const { games, total } = await searchCatalog(
      { q: 'hades', ...pagina },
      userId,
    );

    expect(total).toBe(1);
    expect(games).toEqual([
      expect.objectContaining({ name: 'Hades', status: null }),
    ]);
  });

  it('da loggati porta lo stato del tuo backlog, e solo del tuo', async () => {
    const [mio, altro] = [await createUser(), await createUser()];
    const game = await createGame({ name: 'Celeste' });
    await db.insert(schema.backlog).values([
      { userId: mio, gameId: game.id, status: 'playing' },
      { userId: altro, gameId: game.id, status: 'completed' },
    ]);

    const loggato = await searchCatalog({ q: 'celeste', ...pagina }, mio);
    const ospite = await searchCatalog({ q: 'celeste', ...pagina }, null);

    expect(loggato.games).toEqual([
      expect.objectContaining({ id: game.id, status: 'playing' }),
    ]);
    expect(ospite.games).toEqual([
      expect.objectContaining({ id: game.id, status: null }),
    ]);
  });

  it('prima il titolo esatto, poi chi comincia così, poi gli altri', async () => {
    await createGame({ name: 'Hades II' });
    await createGame({ name: 'Children of Hades' });
    await createGame({ name: 'Hades' });

    const { games } = await searchCatalog({ q: 'hades', ...pagina }, null);

    expect(games.map((game) => game.name)).toEqual([
      'Hades',
      'Hades II',
      'Children of Hades',
    ]);
  });

  it('un % nella ricerca è un carattere, non un jolly', async () => {
    await createGame({ name: '100% Orange Juice' });
    await createGame({ name: '100 Orange Juice' });

    const { games } = await searchCatalog({ q: '100%', ...pagina }, null);

    expect(games.map((game) => game.name)).toEqual(['100% Orange Juice']);
  });

  it('il totale è prima delle pagine', async () => {
    for (const n of [1, 2, 3]) await createGame({ name: `Zelda ${n}` });

    const { games, total } = await searchCatalog(
      { q: 'zelda', limit: 2, offset: 2 },
      null,
    );

    expect(total).toBe(3);
    expect(games.map((game) => game.name)).toEqual(['Zelda 3']);
  });
});

describe('searchIgdbNotInCatalog', () => {
  it('toglie i giochi che Ludex ha già, senza scrivere niente', async () => {
    await createGame({ igdbId: 1, name: 'Hollow Knight' });
    mockedSearch.mockResolvedValue([
      hit(1, 'Hollow Knight'),
      hit(2, 'Hollow Knight: Silksong'),
    ]);

    const hits = await searchIgdbNotInCatalog('hollow knight');

    expect(hits.map((h) => h.igdbId)).toEqual([2]);
    // La riga nasce quando l'utente sceglie, non quando cerca.
    expect(await db.select().from(schema.games)).toHaveLength(1);
  });
});
