import { db, schema } from '@repo/db';
import { describe, expect, it, vi } from 'vitest';

import { createGame } from '../../test/factories';
import { findIgdbGameById } from '../external/igdb';
import { pickSlugs, retryOnSlugConflict, slugify } from './game-slug';
import {
  createGame as createUnresolvedGame,
  linkExternalGames,
  resolveGameFromIgdb,
} from './games';

vi.mock('../external/igdb', () => ({ findIgdbGameById: vi.fn() }));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedFindById = vi.mocked(findIgdbGameById);

describe('slugify', () => {
  it.each([
    ['Hollow Knight', 'hollow-knight'],
    ["Assassin's Creed® Unity", 'assassins-creed-unity'],
    // NFKD avrebbe fatto di «™» due lettere: `bioshocktm-remastered`.
    ['BioShock™ Remastered', 'bioshock-remastered'],
    ['Pokémon Rubí — Édition', 'pokemon-rubi-edition'],
    ['  -Ori- ', 'ori'],
    ['ファイナルファンタジー', 'game'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('non supera gli 80 caratteri e non finisce con un trattino', () => {
    const slug = slugify(`${'a'.repeat(79)} b`);
    expect(slug).toBe('a'.repeat(79));
  });
});

describe('pickSlugs', () => {
  it('al doppione dà l’anno, poi l’id IGDB, poi un suffisso casuale', async () => {
    await createGame({ name: 'God of War', slug: 'god-of-war' });
    await createGame({ name: 'God of War', slug: 'god-of-war-2018' });

    const [conAnno, senzaAnno, annoPreso, nonRisolto] = await pickSlugs([
      { name: 'God of War', releaseYear: 2005, igdbId: 1 },
      { name: 'God of War', releaseYear: null, igdbId: 2 },
      { name: 'God of War', releaseYear: 2018, igdbId: 3 },
      { name: 'God of War' },
    ]);

    expect(conAnno).toBe('god-of-war-2005');
    expect(senzaAnno).toBe('god-of-war-2');
    expect(annoPreso).toBe('god-of-war-3');
    expect(nonRisolto).toMatch(/^god-of-war-[0-9a-f]{8}$/);
  });

  it('tiene distinti due omonimi della stessa scrittura', async () => {
    const slugs = await pickSlugs([
      { name: 'Inside', releaseYear: 2016, igdbId: 10 },
      { name: 'Inside', releaseYear: 2016, igdbId: 11 },
      { name: 'Inside', releaseYear: 2016, igdbId: 12 },
    ]);

    // Il primo arrivato tiene il nome, il secondo l'anno; il terzo ha lo
    // stesso anno, quindi passa all'id.
    expect(slugs).toEqual(['inside', 'inside-2016', 'inside-12']);
  });
});

describe('retryOnSlugConflict', () => {
  it('chi perde la corsa sullo slug rilegge e riscrive', async () => {
    let tentativi = 0;

    const row = await retryOnSlugConflict(async () => {
      tentativi++;
      const [slug] = await pickSlugs([{ name: 'Celeste', igdbId: 5 }]);
      // Al primo giro un altro import scrive lo stesso slug fra la lettura e
      // la scrittura.
      if (tentativi === 1) await createGame({ name: 'Celeste', slug: slug! });
      const [inserted] = await db
        .insert(schema.games)
        .values({ name: 'Celeste', igdbId: 5, slug: slug! })
        .returning({ slug: schema.games.slug });
      return inserted!;
    });

    expect(tentativi).toBe(2);
    expect(row.slug).toBe('celeste-5');
  });

  it('non riprova gli altri vincoli', async () => {
    await createGame({ igdbId: 6 });
    let tentativi = 0;

    await expect(
      retryOnSlugConflict(async () => {
        tentativi++;
        await db
          .insert(schema.games)
          .values({ name: 'Doppio', igdbId: 6, slug: 'doppio' });
      }),
    ).rejects.toThrow();
    expect(tentativi).toBe(1);
  });
});

describe('lo slug di chi crea un gioco', () => {
  it('createGame lo calcola dal nome', async () => {
    const game = await createUnresolvedGame('Outer Wilds');
    expect(game!.slug).toBe('outer-wilds');
  });

  it("resolveGameFromIgdb usa l'anno del risultato IGDB ai doppioni", async () => {
    await createGame({ name: 'Prey', slug: 'prey' });
    mockedFindById.mockResolvedValue({
      igdbId: 20,
      name: 'Prey',
      releaseYear: 2017,
      developer: null,
      cover: null,
      gameType: null,
      totalRatingCount: null,
    });

    const game = await resolveGameFromIgdb(20);

    expect(game!.slug).toBe('prey-2017');
  });

  it("linkExternalGames non spreca lo slug su un gioco che c'era già", async () => {
    // Il gioco 30 c'è già: se gli si scegliesse uno slug, il nome pulito
    // andrebbe a lui e il nuovo omonimo prenderebbe l'anno per niente.
    await createGame({ igdbId: 30, name: 'Hitman', slug: 'hitman-2016' });

    const { createdGameIds } = await linkExternalGames('steam', [
      { externalId: 'a', igdbId: 30, name: 'Hitman', releaseYear: 2016 },
      { externalId: 'b', igdbId: 31, name: 'Hitman', releaseYear: 2007 },
    ]);

    expect(createdGameIds).toHaveLength(1);
    const rows = await db
      .select({ igdbId: schema.games.igdbId, slug: schema.games.slug })
      .from(schema.games)
      .orderBy(schema.games.igdbId);
    expect(rows).toEqual([
      { igdbId: 30, slug: 'hitman-2016' },
      { igdbId: 31, slug: 'hitman' },
    ]);
  });
});
