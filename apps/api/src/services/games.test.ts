import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it, vi } from 'vitest';

import { createGame } from '../../test/factories';
import {
  findIgdbGameById,
  findIgdbGameBySlug,
  searchIgdbGames,
} from '../external/igdb';
import { enqueueEnrichment } from '../queue/enrichment';
import { parseSearchTerm, resolveGameFromIgdb, searchGames } from './games';

vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  findIgdbGameBySlug: vi.fn(),
  searchIgdbGames: vi.fn(),
}));
// Stubbata per non aprire Redis nei test: qui interessa *se* si accoda, non che
// BullMQ funzioni — quello è già suo.
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedFindById = vi.mocked(findIgdbGameById);
const mockedFindBySlug = vi.mocked(findIgdbGameBySlug);
const mockedSearch = vi.mocked(searchIgdbGames);
const mockedEnqueue = vi.mocked(enqueueEnrichment);

const hit = (igdbId: number, name: string) => ({
  igdbId,
  name,
  releaseYear: null,
  developer: null,
  gameType: null,
  totalRatingCount: null,
  cover: null,
});

describe('resolveGameFromIgdb', () => {
  it('riusa la riga esistente invece di crearne una seconda', async () => {
    const esistente = await createGame({ igdbId: 4242, name: 'Hollow Knight' });

    const risolto = await resolveGameFromIgdb(4242);

    // È la regola che fa risparmiare l'enrichment quando il secondo utente
    // importa un gioco che il primo aveva già: `games` è condivisa.
    expect(risolto?.id).toBe(esistente.id);
    const righe = await db
      .select()
      .from(schema.games)
      .where(eq(schema.games.igdbId, 4242));
    expect(righe).toHaveLength(1);
    // Né si richiama IGDB, né si riaccoda: il lavoro è già stato pagato.
    expect(mockedFindById).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("crea la riga e accoda l'enrichment quando il gioco è nuovo", async () => {
    mockedFindById.mockResolvedValue(hit(777, 'Celeste'));

    const risolto = await resolveGameFromIgdb(777);

    expect(risolto).toMatchObject({ igdbId: 777, name: 'Celeste' });
    // L'accodamento sta nel servizio e non nella procedura oRPC perché vale per
    // qualunque strada porti a un gioco nuovo, import Steam compreso.
    expect(mockedEnqueue).toHaveBeenCalledWith('igdb', risolto!.id);
  });

  it("restituisce null se IGDB non conosce l'id", async () => {
    mockedFindById.mockResolvedValue(null);

    await expect(resolveGameFromIgdb(999_999)).resolves.toBeNull();
    expect(await db.select().from(schema.games)).toHaveLength(0);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});

describe('parseSearchTerm', () => {
  it("riconosce l'URL di una scheda IGDB, con o senza protocollo", () => {
    expect(
      parseSearchTerm('https://www.igdb.com/games/hollow-knight?foo=1'),
    ).toEqual({ kind: 'slug', slug: 'hollow-knight' });
    expect(parseSearchTerm(' igdb.com/games/Celeste/ ')).toEqual({
      kind: 'slug',
      slug: 'celeste',
    });
  });

  it('riconosce un id, e lascia per nome tutto il resto', () => {
    expect(parseSearchTerm('1942')).toEqual({ kind: 'id', igdbId: 1942 });
    expect(parseSearchTerm('198X')).toEqual({ kind: 'name' });
    expect(parseSearchTerm('0')).toEqual({ kind: 'name' });
    expect(parseSearchTerm('https://example.com/games/x')).toEqual({
      kind: 'name',
    });
  });
});

describe('searchGames', () => {
  it('con un URL cerca solo lo slug, non il nome', async () => {
    mockedFindBySlug.mockResolvedValue(hit(14593, 'Hollow Knight'));

    const risultati = await searchGames(
      'https://www.igdb.com/games/hollow-knight',
    );

    expect(risultati).toEqual([hit(14593, 'Hollow Knight')]);
    expect(mockedFindBySlug).toHaveBeenCalledWith('hollow-knight');
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("con un numero mette davanti il gioco con quell'id e tiene la ricerca per nome", async () => {
    // *1942* è un titolo vero: un numero non può essere soltanto un id.
    mockedFindById.mockResolvedValue(hit(1942, 'The Witcher 3'));
    mockedSearch.mockResolvedValue([
      hit(5, '1942'),
      hit(1942, 'The Witcher 3'),
    ]);

    const risultati = await searchGames('1942');

    expect(risultati.map((r) => r.igdbId)).toEqual([1942, 5]);
  });

  it('con un numero che IGDB non conosce come id resta la ricerca per nome', async () => {
    mockedFindById.mockResolvedValue(null);
    mockedSearch.mockResolvedValue([hit(5, '1942')]);

    expect(await searchGames('1942')).toEqual([hit(5, '1942')]);
  });
});
