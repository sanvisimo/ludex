import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { addToBacklog, setBacklogHidden } from './backlog';
import { listHomeBands, MIN_GAMES_PER_GENRE } from './home';
import { saveScores } from './scores';

// Si testa ciò che, rompendosi, mente in silenzio: un gioco nella fascia
// sbagliata sul bordo delle durate, OpenCritic che rientra dal voto o
// dall'ordinamento, la home che cambia da chi la guarda, l'estrazione che non
// tiene per tutto il giorno.

const GIORNO = '2026-10-03';

type Bande = Awaited<ReturnType<typeof listHomeBands>>;

function nomi(bande: Bande, kind: Bande[number]['kind']) {
  return bande.find((band) => band.kind === kind)?.games.map((g) => g.name);
}

function gioco(values: Parameters<typeof createGame>[0] = {}) {
  return createGame({ gameType: 'main_game', ...values });
}

describe('durate', () => {
  it('i bordi: 10 h è breve, 35 h è medio, un minuto dopo si cambia fascia', async () => {
    await gioco({ name: '600', hltbMainMinutes: 600 });
    await gioco({ name: '601', hltbMainMinutes: 601 });
    await gioco({ name: '2100', hltbMainMinutes: 2100 });
    await gioco({ name: '2101', hltbMainMinutes: 2101 });

    const bande = await listHomeBands(null, GIORNO);

    expect(nomi(bande, 'short')).toEqual(['600']);
    expect(nomi(bande, 'medium')?.sort()).toEqual(['2100', '601']);
    expect(nomi(bande, 'long')).toEqual(['2101']);
  });

  it('un gioco senza una fine non è una durata, e uno senza durata non c’è', async () => {
    await gioco({
      name: 'Senza campagna',
      hltbMainMinutes: 300,
      hltbHasSolo: false,
    });
    await gioco({ name: 'Senza durata' });
    await gioco({
      name: 'Non ancora visto',
      hltbMainMinutes: 300,
      hltbHasSolo: null,
    });

    const bande = await listHomeBands(null, GIORNO);

    expect(nomi(bande, 'short')).toEqual(['Non ancora visto']);
  });
});

describe('quali giochi', () => {
  it('niente DLC; un gioco senza tipo sta solo fra gli ultimi aggiunti', async () => {
    await gioco({ name: 'Gioco', hltbMainMinutes: 300 });
    await createGame({ name: 'DLC', gameType: 'dlc', hltbMainMinutes: 300 });
    await createGame({
      name: 'Senza tipo',
      gameType: null,
      hltbMainMinutes: 300,
    });

    const bande = await listHomeBands(null, GIORNO);

    expect(nomi(bande, 'latest')?.sort()).toEqual(['Gioco', 'Senza tipo']);
    expect(nomi(bande, 'short')).toEqual(['Gioco']);
  });

  it('gli ultimi aggiunti sono in ordine di arrivo in Ludex', async () => {
    const vecchio = await gioco({ name: 'Vecchio' });
    await gioco({ name: 'Nuovo' });
    await db
      .update(schema.games)
      .set({ createdAt: new Date('2020-01-01') })
      .where(eq(schema.games.id, vecchio.id));

    expect(nomi(await listHomeBands(null, GIORNO), 'latest')).toEqual([
      'Nuovo',
      'Vecchio',
    ]);
  });

  it('una fascia vuota non c’è', async () => {
    await gioco({ name: 'Solo' });

    const bande = await listHomeBands(null, GIORNO);

    expect(bande.map((band) => band.kind)).toEqual(['latest']);
  });
});

describe('meglio votati', () => {
  it('Metacritic, poi IGDB, mai OpenCritic: né nel voto né nell’ordine', async () => {
    const conOpenCritic = await gioco({ name: 'Con OpenCritic' });
    await saveScores(conOpenCritic.id, 'opencritic', [
      { score: 99, reviewCount: 200 },
    ]);
    await saveScores(conOpenCritic.id, 'metacritic', [
      { score: 80, reviewCount: 50 },
    ]);

    const soloIgdb = await gioco({ name: 'Solo IGDB' });
    await saveScores(soloIgdb.id, 'igdb', [{ score: 85, reviewCount: 20 }]);

    const metaEIgdb = await gioco({ name: 'Meta e IGDB' });
    await saveScores(metaEIgdb.id, 'igdb', [{ score: 95, reviewCount: 40 }]);
    await saveScores(metaEIgdb.id, 'metacritic', [
      { score: 70, reviewCount: 40 },
    ]);

    const soloOpenCritic = await gioco({ name: 'Solo OpenCritic' });
    await saveScores(soloOpenCritic.id, 'opencritic', [
      { score: 98, reviewCount: 300 },
    ]);

    const bande = await listHomeBands(null, GIORNO);
    const top = bande.find((band) => band.kind === 'topRated')!.games;

    expect(
      top.map((g) => [g.name, g.criticScore, g.criticScoreSource]),
    ).toEqual([
      ['Solo IGDB', 85, 'igdb'],
      ['Con OpenCritic', 80, 'metacritic'],
      ['Meta e IGDB', 70, 'metacritic'],
    ]);
  });

  it('sotto le 10 recensioni non entra', async () => {
    const poche = await gioco({ name: 'Poche' });
    await saveScores(poche.id, 'metacritic', [{ score: 97, reviewCount: 9 }]);
    const dieci = await gioco({ name: 'Dieci' });
    await saveScores(dieci.id, 'metacritic', [{ score: 75, reviewCount: 10 }]);
    const senzaConteggio = await gioco({ name: 'Senza conteggio' });
    await saveScores(senzaConteggio.id, 'igdb', [{ score: 90 }]);

    expect(nomi(await listHomeBands(null, GIORNO), 'topRated')).toEqual([
      'Dieci',
    ]);
  });

  it('il voto per piattaforma non è il voto del gioco', async () => {
    const mafia = await gioco({ name: 'Mafia' });
    await saveScores(mafia.id, 'metacritic', [
      { score: 66, reviewCount: 33 },
      { platformSlug: 'pc_windows', score: 88, reviewCount: 27 },
    ]);

    const [game] = (await listHomeBands(null, GIORNO)).find(
      (band) => band.kind === 'topRated',
    )!.games;

    expect(game!.criticScore).toBe(66);
  });
});

describe('chi guarda', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('la home è la stessa per tutti; lo stato c’è solo sui giochi tuoi', async () => {
    const mio = await gioco({ name: 'Mio', hltbMainMinutes: 300 });
    await gioco({ name: 'Non mio', hltbMainMinutes: 300 });
    const entryId = await addToBacklog({
      userId,
      gameId: mio.id,
      status: 'playing',
      ownerships: [{ platformSlug: 'pc_windows' }],
    });
    // Nascosto dalla tua lista non vuol dire sparito dal catalogo.
    await setBacklogHidden(userId, entryId, true);
    const altro = await createUser();

    const anonimo = await listHomeBands(null, GIORNO);
    const tuo = await listHomeBands(userId, GIORNO);
    const suo = await listHomeBands(altro, GIORNO);

    const senzaStato = (bande: Bande) =>
      bande.map((band) => ({
        ...band,
        games: band.games.map((game) => ({ ...game, status: null })),
      }));
    expect(senzaStato(tuo)).toEqual(senzaStato(anonimo));
    expect(senzaStato(suo)).toEqual(senzaStato(anonimo));

    const stati = (bande: Bande) =>
      Object.fromEntries(
        bande
          .find((band) => band.kind === 'short')!
          .games.map((g) => [g.name, g.status]),
      );
    expect(stati(tuo)).toEqual({ Mio: 'playing', 'Non mio': null });
    expect(stati(suo)).toEqual({ Mio: null, 'Non mio': null });
    expect(stati(anonimo)).toEqual({ Mio: null, 'Non mio': null });
  });
});

describe('rotazione', () => {
  it('la stessa estrazione per tutto il giorno, un’altra il giorno dopo', async () => {
    for (let n = 0; n < 12; n++) {
      await gioco({ name: `Breve ${n}`, hltbMainMinutes: 60 + n });
    }

    const oggi = nomi(await listHomeBands(null, GIORNO), 'short');
    const ancoraOggi = nomi(await listHomeBands(null, GIORNO), 'short');
    const domani = nomi(await listHomeBands(null, '2026-10-04'), 'short');

    expect(ancoraOggi).toEqual(oggi);
    expect(domani).not.toEqual(oggi);
    expect([...domani!].sort()).toEqual([...oggi!].sort());
  });
});

describe('generi', () => {
  async function genere(igdbId: number, name: string, giochi: number) {
    const [attributo] = await db
      .insert(schema.igdbAttributes)
      .values({ kind: 'genre', igdbId, name })
      .returning({ id: schema.igdbAttributes.id });
    for (let n = 0; n < giochi; n++) {
      const game = await gioco({ name: `${name} ${n}` });
      await db
        .insert(schema.gameAttributes)
        .values({ gameId: game.id, attributeId: attributo!.id });
    }
    return attributo!.id;
  }

  it('solo i generi che riempiono la fascia, e al massimo tre', async () => {
    await genere(1, 'Pochi', MIN_GAMES_PER_GENRE - 1);
    for (const [id, name] of [
      [2, 'Indie'],
      [3, 'RPG'],
      [4, 'Corse'],
      [5, 'Sport'],
    ] as const) {
      await genere(id, name, MIN_GAMES_PER_GENRE);
    }

    const generi = (await listHomeBands(null, GIORNO)).filter(
      (band) => band.kind === 'genre',
    );

    expect(generi).toHaveLength(3);
    for (const band of generi) {
      expect(band.genre!.name).not.toBe('Pochi');
      expect(band.games).toHaveLength(MIN_GAMES_PER_GENRE);
      expect(band.games.every((g) => g.name.startsWith(band.genre!.name))).toBe(
        true,
      );
    }
  });
});
