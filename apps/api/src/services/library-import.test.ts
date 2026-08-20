import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser } from '../../test/factories';
import {
  findIgdbGamesByExternalIds,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import { importLibrary, platformFor } from './library-import';

vi.mock('../external/igdb', () => ({
  findIgdbGamesByExternalIds: vi.fn(),
  searchIgdbGames: vi.fn(),
  igdbSourceFor: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedById = vi.mocked(findIgdbGamesByExternalIds);
const mockedSearch = vi.mocked(searchIgdbGames);
const mockedSource = vi.mocked(igdbSourceFor);

/** Un risultato di ricerca IGDB, ridotto a ciò che il matcher guarda. */
function hit(over: {
  igdbId: number;
  name: string;
  releaseYear?: number | null;
  gameType?: string | null;
}) {
  return {
    igdbId: over.igdbId,
    name: over.name,
    releaseYear: over.releaseYear ?? null,
    developer: null,
    gameType: over.gameType ?? null,
  };
}

const unresolvedOf = (userId: string) =>
  db
    .select()
    .from(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.userId, userId));

const gamesOf = (userId: string) =>
  db
    .select({ name: schema.games.name, igdbId: schema.games.igdbId })
    .from(schema.backlog)
    .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
    .where(eq(schema.backlog.userId, userId));

describe('importLibrary: risoluzione per nome (passo 3)', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
    mockedById.mockResolvedValue(new Map());
    mockedSearch.mockResolvedValue([]);
    // GOG ha una sorgente su IGDB; i test che vogliono il caso "negozio che
    // IGDB non mappa" la spengono.
    mockedSource.mockReturnValue(5);
  });

  it('aggancia per nome ciò che l id non ha risolto', async () => {
    mockedSearch.mockResolvedValue([hit({ igdbId: 1234, name: 'Frostpunk' })]);

    const report = await importLibrary('gog', userId, [
      { externalId: '1648559910', name: 'Frostpunk' },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
    // Il nome salvato è quello di IGDB, non quello del negozio: `games` è
    // condivisa fra tutti gli utenti, e i negozi decorano i titoli.
    expect(await gamesOf(userId)).toEqual([
      { name: 'Frostpunk', igdbId: 1234 },
    ]);
    expect(await unresolvedOf(userId)).toHaveLength(0);
  });

  it("scrive la mappatura, così il prossimo import non ripassa dalla ricerca", async () => {
    mockedSearch.mockResolvedValue([hit({ igdbId: 1234, name: 'Frostpunk' })]);
    await importLibrary('gog', userId, [
      { externalId: '1648559910', name: 'Frostpunk' },
    ]);

    // È la parte che conta più della riga di backlog: da qui in avanti quel
    // product id è risolto **per tutti**, e la ricerca non si spende più.
    const [mappatura] = await db
      .select()
      .from(schema.externalIds)
      .where(eq(schema.externalIds.externalId, '1648559910'));
    expect(mappatura).toMatchObject({ source: 'gog' });
  });

  it('non sceglie quando nessun candidato convince', async () => {
    // I candidati veri che IGDB ha restituito per "Dragons of Flame" sulla
    // libreria di prova: si somigliano tutti e nessuno è quello giusto. Meglio
    // la lista degli scarti che un gioco sbagliato scritto in silenzio dentro
    // `games`, che è condivisa fra tutti gli utenti.
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 1, name: 'Flame Dragon Plus: Marks of Wind' }),
      hit({ igdbId: 2, name: 'Advanced Dungeons & Dragons: Dragons of Flame' }),
      hit({ igdbId: 3, name: 'Flame Dragon 2: Legend of Golden Castle' }),
    ]);

    const report = await importLibrary('gog', userId, [
      { externalId: '1321890219', name: 'Dragons of Flame' },
    ]);

    expect(report).toMatchObject({ resolved: 0, unresolved: 1 });
    expect(await unresolvedOf(userId)).toMatchObject([
      { store: 'gog', name: 'Dragons of Flame' },
    ]);
  });

  it("affonda il candidato che dista decenni: è il remake, non il gioco", async () => {
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 9, name: 'Shadow Sorcerer', releaseYear: 2021 }),
    ]);

    const report = await importLibrary('gog', userId, [
      { externalId: '1779703219', name: 'Shadow Sorcerer', releaseYear: 1991 },
    ]);

    expect(report).toMatchObject({ resolved: 0, unresolved: 1 });
  });

  it('tollera lo scarto di qualche anno, che è il negozio che data la sua edizione', async () => {
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 9, name: 'Builders of Egypt', releaseYear: 2025 }),
    ]);

    const report = await importLibrary('gog', userId, [
      { externalId: '1212177362', name: 'Builders of Egypt', releaseYear: 2022 },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
  });

  it('riprova col titolo accorciato quando quello intero non trova niente', async () => {
    // Il caso vero: GOG vende «Legend of Keepers: Prologue» come voce a sé,
    // IGDB lo tiene sotto il titolo del gioco. Cercando il titolo intero non
    // esce niente, e senza il ripiego cinque giochi su 435 finivano negli
    // scarti pur essendo su IGDB.
    mockedSearch.mockImplementation(async (term: string) =>
      term.toLowerCase().includes('prologue')
        ? []
        : [hit({ igdbId: 77, name: 'Legend of Keepers' })],
    );

    const report = await importLibrary('gog', userId, [
      { externalId: '2020648154', name: 'Legend of Keepers: Prologue' },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
    expect(mockedSearch).toHaveBeenCalledTimes(2);
  });

  it('giudica anche sulla forma con cui ha cercato, non solo sul titolo intero', async () => {
    // «Wargame Construction Set III: Age of Rifles 1846-1905 + Campaigns» non
    // somiglia abbastanza al titolo IGDB per superare la soglia. Somiglia la
    // testa, ed è per questo che `searchedAs` deve arrivare al giudizio.
    const intero =
      'Wargame Construction Set III: Age of Rifles 1846-1905 + Campaigns';
    mockedSearch.mockImplementation(async (term: string) =>
      term === intero
        ? []
        : [
            hit({
              igdbId: 88,
              name: 'Wargame Construction Set III: Age of Rifles 1846-1905',
            }),
          ],
    );

    const report = await importLibrary('gog', userId, [
      { externalId: '1180139263', name: intero },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
  });

  it('butta i DLC che la ricerca restituisce', async () => {
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 7, name: 'Inkulinati Goodies Pack', gameType: 'DLC' }),
    ]);

    const report = await importLibrary('gog', userId, [
      { externalId: '1174117468', name: 'Inkulinati Goodies Pack' },
    ]);

    expect(report).toMatchObject({ resolved: 0, unresolved: 1 });
  });

  it('con un negozio che IGDB non mappa non interroga gli id e va dritto ai nomi', async () => {
    // È il caso di Amazon: la sorgente su IGDB esiste ma è vuota in pratica, e
    // **tutte** le voci passano dal match per nome. Interrogare per id sarebbe
    // una richiesta spesa per sapere quello che si sa già.
    mockedSource.mockReturnValue(null);
    mockedSearch.mockResolvedValue([hit({ igdbId: 55, name: 'Heaven Dust 2' })]);

    const report = await importLibrary('amazon', userId, [
      {
        externalId: 'amzn1.adg.product.625256c0',
        name: 'Heaven Dust 2',
      },
    ]);

    expect(mockedById).toHaveBeenCalledWith('amazon', []);
    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
  });

  it('rieseguito lascia lo stesso stato', async () => {
    mockedSearch.mockResolvedValue([hit({ igdbId: 1234, name: 'Frostpunk' })]);
    const entry = { externalId: '1648559910', name: 'Frostpunk' };

    await importLibrary('gog', userId, [entry]);
    const secondo = await importLibrary('gog', userId, [entry]);

    // Al secondo giro lo risolve il passo 1 dal nostro DB: niente ricerca, e
    // nessuna riga in più da nessuna parte.
    expect(secondo).toMatchObject({
      resolved: 1,
      resolvedByName: 0,
      newGames: 0,
      newEntries: 0,
    });
    expect(await gamesOf(userId)).toHaveLength(1);
  });

  it('toglie dagli scarti la voce che la ricerca ha imparato a risolvere', async () => {
    const entry = { externalId: '1305299338', name: 'Ghost Song' };

    await importLibrary('gog', userId, [entry]);
    expect(await unresolvedOf(userId)).toHaveLength(1);

    // IGDB cresce, e un gioco che oggi non c'è può esserci fra un mese.
    mockedSearch.mockResolvedValue([hit({ igdbId: 42, name: 'Ghost Song' })]);
    await importLibrary('gog', userId, [entry]);

    expect(await unresolvedOf(userId)).toHaveLength(0);
  });
});

describe('platformFor', () => {
  it('dà PC ai negozi PC', () => {
    expect(platformFor('gog')).toBe('pc_windows');
    expect(platformFor('steam')).toBe('pc_windows');
  });

  it('si rifiuta di indovinare per i negozi console', () => {
    // Scrivere `pc_windows` su un gioco PSN sarebbe un dato sbagliato dentro la
    // colonna su cui il motore decisionale filtra. Chi aggiunge PSN deve
    // decidere, non ereditare un default.
    expect(() => platformFor('psn')).toThrow('psn');
    expect(() => platformFor('nintendo')).toThrow('nintendo');
  });
});
