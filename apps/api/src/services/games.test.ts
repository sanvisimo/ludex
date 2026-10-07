import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it, vi } from 'vitest';

import { createGame, createUser, setSource } from '../../test/factories';
import {
  findIgdbGameById,
  findIgdbGameBySlug,
  searchIgdbGames,
} from '../external/igdb';
import { enqueueEnrichment } from '../queue/enrichment';
import {
  findGameDetailById,
  parseSearchTerm,
  resolveGameFromIgdb,
  searchGames,
} from './games';

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
  platformIds: [],
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

describe('findGameDetailById: ciò che serve alla pagina del gioco (12d)', () => {
  it('dice quali giochi legati hai: solo quelli sono cliccabili', async () => {
    const userId = await createUser();
    const game = await createGame({ igdbId: 10 });
    // Il remake è in `games` ed è tuo; il simile è in `games` ma di nessuno;
    // l'altro simile in `games` non c'è proprio.
    const remake = await createGame({ igdbId: 20 });
    const simile = await createGame({ igdbId: 30 });
    await db
      .insert(schema.backlog)
      .values({ userId, gameId: remake.id, status: 'playing' });
    await db.insert(schema.gameRelated).values([
      {
        gameId: game.id,
        kind: 'similar',
        igdbId: 40,
        name: 'Fuori',
        position: 1,
      },
      {
        gameId: game.id,
        kind: 'similar',
        igdbId: 30,
        name: 'Simile',
        position: 0,
      },
      {
        gameId: game.id,
        kind: 'remake',
        igdbId: 20,
        name: 'Remake',
        position: 0,
      },
    ]);

    const dettaglio = await findGameDetailById(game.id, userId);

    expect(dettaglio?.related).toEqual([
      expect.objectContaining({
        igdbId: 20,
        gameId: remake.id,
        owned: true,
        status: 'playing',
      }),
      expect.objectContaining({
        igdbId: 30,
        gameId: simile.id,
        owned: false,
        status: null,
      }),
      expect.objectContaining({
        igdbId: 40,
        gameId: null,
        owned: false,
        status: null,
      }),
    ]);

    // Da sloggati nessuno possiede niente.
    const anonimo = await findGameDetailById(game.id);
    expect(anonimo?.related.map((row) => row.owned)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('trova il gioco padre di un DLC, se è in games', async () => {
    const padre = await createGame({ igdbId: 1877, name: 'The Witcher 3' });
    const dlc = await createGame({ igdbId: 2000 });
    const orfano = await createGame({ igdbId: 2001 });
    await db
      .update(schema.games)
      .set({ parentIgdbId: 1877 })
      .where(eq(schema.games.id, dlc.id));
    await db
      .update(schema.games)
      .set({ parentIgdbId: 9999 })
      .where(eq(schema.games.id, orfano.id));

    expect((await findGameDetailById(dlc.id))?.parent).toEqual({
      id: padre.id,
      slug: padre.slug,
      name: 'The Witcher 3',
    });
    // Di un padre che non abbiamo non sappiamo nemmeno il nome.
    expect((await findGameDetailById(orfano.id))?.parent).toBeNull();
  });

  it('compone i link delle fonti da ciò che hanno agganciato', async () => {
    const game = await createGame();
    await db
      .update(schema.games)
      .set({ igdbSlug: 'cyberpunk-2077' })
      .where(eq(schema.games.id, game.id));
    await setSource({
      gameId: game.id,
      source: 'hltb',
      status: 'ok',
      externalId: '2127',
    });
    await setSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'ok',
      externalId: '8525',
    });

    expect((await findGameDetailById(game.id))?.links).toEqual({
      igdb: 'https://www.igdb.com/games/cyberpunk-2077',
      hltb: 'https://howlongtobeat.com/game/2127',
      // Lo slug di OpenCritic non lo salviamo: quello IGDB va bene, perché
      // OpenCritic guarda solo l'id.
      opencritic: 'https://opencritic.com/game/8525/cyberpunk-2077',
      metacritic: null,
    });
  });

  it('dà un link per negozio, solo dove una pagina ufficiale c’è', async () => {
    const game = await createGame();
    const userId = await createUser();
    await db.insert(schema.externalIds).values([
      { gameId: game.id, source: 'steam', externalId: '1091500' },
      // Due id dello stesso negozio: ne esce uno, sempre lo stesso.
      { gameId: game.id, source: 'psn', externalId: '10002' },
      { gameId: game.id, source: 'psn', externalId: '10001' },
      // GOG con la pagina che un import ha salvato su una copia.
      { gameId: game.id, source: 'gog', externalId: '1207658924' },
      // Senza pagina GOG dall'id non dà un link ufficiale; Epic mai.
      { gameId: game.id, source: 'epic', externalId: 'abc' },
    ]);
    const [entry] = await db
      .insert(schema.backlog)
      .values({ userId, gameId: game.id })
      .returning({ id: schema.backlog.id });
    await db.insert(schema.ownerships).values({
      backlogId: entry!.id,
      platformSlug: 'pc_windows',
      store: 'gog',
      storePage: '/en/game/cyberpunk_2077',
    });

    // L'ordine è quello dell'enum dei negozi, che è anche quello della card.
    expect((await findGameDetailById(game.id))?.storeLinks).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/1091500' },
      { store: 'gog', url: 'https://www.gog.com/en/game/cyberpunk_2077' },
      {
        store: 'psn',
        url: 'https://store.playstation.com/it-it/concept/10001',
      },
    ]);
  });

  it('senza id di negozio non dà nessun link', async () => {
    const game = await createGame();

    expect((await findGameDetailById(game.id))?.storeLinks).toEqual([]);
  });
});
