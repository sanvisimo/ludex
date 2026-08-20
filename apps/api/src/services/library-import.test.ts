import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser, linkStoreAccount } from '../../test/factories';
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
  totalRatingCount?: number | null;
}) {
  return {
    igdbId: over.igdbId,
    name: over.name,
    releaseYear: over.releaseYear ?? null,
    developer: null,
    gameType: over.gameType ?? null,
    totalRatingCount: over.totalRatingCount ?? null,
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
  // L'import parte dalla riga dell'account, non da `(negozio, utente)`: è lei
  // che dice a quale dei due account Amazon appartiene ciò che si sta scrivendo.
  let account: Awaited<ReturnType<typeof linkStoreAccount>>;

  beforeEach(async () => {
    userId = await createUser();
    account = await linkStoreAccount(userId, 'gog');
    mockedById.mockResolvedValue(new Map());
    mockedSearch.mockResolvedValue([]);
    // GOG ha una sorgente su IGDB; i test che vogliono il caso "negozio che
    // IGDB non mappa" la spengono.
    mockedSource.mockReturnValue(5);
  });

  it('aggancia per nome ciò che l id non ha risolto', async () => {
    mockedSearch.mockResolvedValue([hit({ igdbId: 1234, name: 'Frostpunk' })]);

    const report = await importLibrary(account, [
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
    await importLibrary(account, [
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

    const report = await importLibrary(account, [
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

    const report = await importLibrary(account, [
      { externalId: '1779703219', name: 'Shadow Sorcerer', releaseYear: 1991 },
    ]);

    expect(report).toMatchObject({ resolved: 0, unresolved: 1 });
  });

  it('tollera lo scarto di qualche anno, che è il negozio che data la sua edizione', async () => {
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 9, name: 'Builders of Egypt', releaseYear: 2025 }),
    ]);

    const report = await importLibrary(account, [
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

    const report = await importLibrary(account, [
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

    const report = await importLibrary(account, [
      { externalId: '1180139263', name: intero },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
  });

  it('non aggancia un nome che si ripete: è un etichetta, non un titolo', async () => {
    // Il caso vero, e il peggiore capitato finora. Su una libreria Epic 266
    // voci su 705 arrivavano chiamate «Live» — progetti Unreal e isole di
    // Fortnite Creative — e IGDB un gioco chiamato *Live* ce l'ha davvero, con
    // corrispondenza esatta e unica. Sono state agganciate tutte allo stesso
    // gioco, scrivendo mappature false in `external_ids`, che è condivisa fra
    // tutti gli utenti.
    mockedSearch.mockResolvedValue([hit({ igdbId: 85682, name: 'Live' })]);

    const epic = await linkStoreAccount(userId, 'epic');
    const report = await importLibrary(epic, [
      { externalId: 'a', name: 'Live' },
      { externalId: 'b', name: 'Live' },
      { externalId: 'c', name: 'Live' },
    ]);

    expect(report).toMatchObject({ resolved: 0, unresolved: 3 });
    // E soprattutto: nessuna mappatura scritta nel catalogo di tutti.
    expect(
      await db
        .select()
        .from(schema.externalIds)
        .where(eq(schema.externalIds.source, 'epic')),
    ).toHaveLength(0);
    // Non si è nemmeno sprecata la ricerca.
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('un nome unico continua ad agganciarsi normalmente', async () => {
    mockedSearch.mockResolvedValue([hit({ igdbId: 1, name: 'Celeste' })]);

    const report = await importLibrary(account, [
      { externalId: 'a', name: 'Celeste' },
      { externalId: 'b', name: 'Live' },
      { externalId: 'c', name: 'Live' },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
  });

  it('a parità di titolo sceglie la scheda vissuta, non il doppione vuoto', async () => {
    // IGDB ha tre schede intitolate «Inside». Senza anno — Epic non lo dà — il
    // giudizio per nome rinuncia, giustamente. Ma due delle tre sono gusci
    // vuoti, e questo lo dice il numero di recensioni.
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 1, name: 'Inside', releaseYear: 2016, totalRatingCount: 1666 }),
      hit({ igdbId: 2, name: 'Inside', totalRatingCount: 0 }),
      hit({ igdbId: 3, name: 'Inside', totalRatingCount: null }),
    ]);

    const report = await importLibrary(account, [
      { externalId: 'x', name: 'Inside' },
    ]);

    expect(report).toMatchObject({ resolved: 1, resolvedByName: 1 });
    expect(await gamesOf(userId)).toEqual([{ name: 'Inside', igdbId: 1 }]);
  });

  it('a parità di titolo non sceglie se entrambe le schede sono vissute', async () => {
    // È il caso in cui decidere non tocca a noi: due giochi veri, omonimi. Lì
    // la lista degli scarti è la risposta giusta.
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 1, name: 'Observer', totalRatingCount: 174 }),
      hit({ igdbId: 2, name: 'Observer', totalRatingCount: 120 }),
    ]);

    const report = await importLibrary(account, [
      { externalId: 'x', name: 'Observer' },
    ]);

    expect(report).toMatchObject({ resolved: 0, unresolved: 1 });
  });

  it('toglie dagli scarti la voce che non è più nella libreria', async () => {
    // Una voce può sparire perché l'utente l'ha tolta dal negozio, o perché
    // abbiamo imparato a riconoscerla come non-gioco. Senza questa pulizia
    // resterebbe negli scarti per sempre, e l'utente dovrebbe scartare a mano
    // roba che nessuno gli sta più proponendo.
    await importLibrary(account, [
      { externalId: 'sparita', name: 'coolgrey Production' },
      { externalId: 'resta', name: 'Celeste' },
    ]);
    expect(await unresolvedOf(userId)).toHaveLength(2);

    await importLibrary(account, [
      { externalId: 'resta', name: 'Celeste' },
    ]);

    expect(await unresolvedOf(userId)).toMatchObject([{ name: 'Celeste' }]);
  });

  it('butta i DLC che la ricerca restituisce', async () => {
    mockedSearch.mockResolvedValue([
      hit({ igdbId: 7, name: 'Inkulinati Goodies Pack', gameType: 'DLC' }),
    ]);

    const report = await importLibrary(account, [
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

    const amazon = await linkStoreAccount(userId, 'amazon');
    const report = await importLibrary(amazon, [
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

    await importLibrary(account, [entry]);
    const secondo = await importLibrary(account, [entry]);

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

    await importLibrary(account, [entry]);
    expect(await unresolvedOf(userId)).toHaveLength(1);

    // IGDB cresce, e un gioco che oggi non c'è può esserci fra un mese.
    mockedSearch.mockResolvedValue([hit({ igdbId: 42, name: 'Ghost Song' })]);
    await importLibrary(account, [entry]);

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
