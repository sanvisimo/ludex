import type { BacklogQueryInput } from '@repo/contracts';
import { BacklogQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { addToBacklog, setBacklogHidden, updateBacklogEntry } from './backlog';
import { listBacklogFilterOptions, searchBacklog } from './backlog-search';

// Si testa quello che, rompendosi, mente all'utente senza dirglielo: i NULL
// trattati come zeri, l'AND che duplica righe, l'ordinamento che sparisce fra le
// due fasi della query, e la paginazione che salta un gioco. Il resto è WHERE.

/**
 * Passa dallo schema Zod invece di costruire l'oggetto a mano: `sort`,
 * `direction`, `limit` e `offset` hanno un default lì, e un test che se li
 * scrivesse da sé verificherebbe una query che nessuno esegue davvero.
 */
function search(userId: string, input: BacklogQueryInput = {}) {
  return searchBacklog(userId, BacklogQuerySchema.parse(input));
}

async function nomi(userId: string, input: BacklogQueryInput = {}) {
  const { entries } = await search(userId, input);
  return entries.map((entry) => entry.game.name);
}

describe('filtri sui multi-valore', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('più tag sono in AND, e un gioco non esce una volta per tag', async () => {
    const entrambi = await aggiungi(userId, { name: 'Entrambi' });
    const soloUno = await aggiungi(userId, { name: 'Solo uno' });

    await updateBacklogEntry(userId, {
      id: entrambi,
      tags: [
        { kind: 'tag', name: 'corto' },
        { kind: 'tag', name: 'stanco' },
      ],
    });
    await updateBacklogEntry(userId, {
      id: soloUno,
      tags: [{ kind: 'tag', name: 'corto' }],
    });

    const vocabolario = await db
      .select({ id: schema.userTags.id, name: schema.userTags.name })
      .from(schema.userTags);
    const idDi = (name: string) =>
      vocabolario.find((tag) => tag.name === name)!.id;

    // Un tag solo: il gioco che ne ha due non deve comparire due volte.
    const uno = await search(userId, { tags: [idDi('corto')] });
    expect(uno.entries.map((entry) => entry.game.name)).toEqual([
      'Solo uno',
      'Entrambi',
    ]);
    expect(uno.total).toBe(2);

    expect(
      await nomi(userId, { tags: [idDi('corto'), idDi('stanco')] }),
    ).toEqual(['Entrambi']);
  });

  it('il tag di un altro utente non pesca niente', async () => {
    const altro = await createUser();
    const suo = await aggiungi(altro, { name: 'Suo' });
    await updateBacklogEntry(altro, {
      id: suo,
      tags: [{ kind: 'tag', name: 'roba sua' }],
    });
    await aggiungi(userId, { name: 'Mio' });

    const [tag] = await db
      .select({ id: schema.userTags.id })
      .from(schema.userTags);

    expect(await nomi(userId, { tags: [tag!.id] })).toEqual([]);
  });

  it('più piattaforme sono in AND: le vuole tutte', async () => {
    const gioco = await createGame({ name: 'Su due' });
    await addToBacklog({
      userId,
      gameId: gioco.id,
      status: 'backlog',
      ownerships: [
        { platformSlug: 'pc_windows' },
        { platformSlug: 'nintendo_switch' },
      ],
    });
    await aggiungi(userId, { name: 'Solo PC' });

    expect(await nomi(userId, { platforms: ['pc_windows'] })).toEqual([
      'Solo PC',
      'Su due',
    ]);
    expect(
      await nomi(userId, { platforms: ['pc_windows', 'nintendo_switch'] }),
    ).toEqual(['Su due']);
  });
});

describe('filtro per abbonamento', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('trova chi ha una copia della famiglia Steam, e non chi ha solo copie comprate', async () => {
    await conAbbonamento(userId, 'Del fratello', [
      {
        platformSlug: 'pc_windows',
        store: 'steam',
        subscription: 'steam_family',
      },
    ]);
    await conAbbonamento(userId, 'Comprato', [
      { platformSlug: 'pc_windows', store: 'steam', subscription: null },
    ]);
    await aggiungi(userId, { name: 'A mano' });

    expect(await nomi(userId, { subscriptions: ['steam_family'] })).toEqual([
      'Del fratello',
    ]);
  });

  it('più abbonamenti sono in AND: servono tutti e due, anche su copie diverse', async () => {
    await conAbbonamento(userId, 'Tutti e due', [
      {
        platformSlug: 'pc_windows',
        store: 'steam',
        subscription: 'steam_family',
      },
      {
        platformSlug: 'sony_playstation5',
        store: 'psn',
        subscription: 'ps_plus',
      },
    ]);
    await conAbbonamento(userId, 'Solo Plus', [
      {
        platformSlug: 'sony_playstation5',
        store: 'psn',
        subscription: 'ps_plus',
      },
    ]);

    expect(
      await nomi(userId, { subscriptions: ['steam_family', 'ps_plus'] }),
    ).toEqual(['Tutti e due']);
    expect(await nomi(userId, { subscriptions: ['ps_plus'] })).toEqual([
      'Solo Plus',
      'Tutti e due',
    ]);
  });

  it('un gioco esce una volta sola anche con due copie dello stesso abbonamento', async () => {
    await conAbbonamento(userId, 'Due console', [
      {
        platformSlug: 'sony_playstation4',
        store: 'psn',
        subscription: 'ps_plus',
      },
      {
        platformSlug: 'sony_playstation5',
        store: 'psn',
        subscription: 'ps_plus',
      },
    ]);

    const risultato = await search(userId, { subscriptions: ['ps_plus'] });
    expect(risultato.entries).toHaveLength(1);
    expect(risultato.total).toBe(1);
  });

  it('si combina con lo store: la famiglia Steam su Steam, non quella PSN', async () => {
    await conAbbonamento(userId, 'Famiglia', [
      {
        platformSlug: 'pc_windows',
        store: 'steam',
        subscription: 'steam_family',
      },
    ]);
    await conAbbonamento(userId, 'Plus', [
      {
        platformSlug: 'sony_playstation5',
        store: 'psn',
        subscription: 'ps_plus',
      },
    ]);

    expect(
      await nomi(userId, {
        stores: ['steam'],
        subscriptions: ['steam_family'],
      }),
    ).toEqual(['Famiglia']);
    expect(
      await nomi(userId, { stores: ['psn'], subscriptions: ['steam_family'] }),
    ).toEqual([]);
  });
});

describe('i NULL non sono zeri', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('il filtro durata lascia fuori i giochi senza durata', async () => {
    await aggiungi(userId, {
      name: 'Corto',
      hltbMainMinutes: 120,
      hltbHasSolo: true,
    });
    await aggiungi(userId, { name: 'Non arricchito' });

    expect(await nomi(userId, { durationMax: 300 })).toEqual(['Corto']);
    // Senza filtro c'è di nuovo: è escluso dal criterio, non nascosto.
    expect((await nomi(userId)).sort()).toEqual(['Corto', 'Non arricchito']);
  });

  it('un gioco senza fine non è un gioco lungo: le sue ore non sono una durata', async () => {
    await aggiungi(userId, {
      name: 'Counter-Strike',
      hltbMainMinutes: 8_580,
      hltbHasSolo: false,
    });
    await aggiungi(userId, {
      name: 'Persona',
      hltbMainMinutes: 6_000,
      hltbHasSolo: true,
    });

    expect(await nomi(userId, { durationMin: 3_000 })).toEqual(['Persona']);
  });

  it('la durata sconosciuta non blocca il filtro: hasSolo nullo resta ammesso', async () => {
    // HLTB non è ancora passato a dire se ha una campagna, ma la durata c'è.
    await aggiungi(userId, {
      name: 'Durata senza flag',
      hltbMainMinutes: 200,
      hltbHasSolo: null,
    });

    expect(await nomi(userId, { durationMax: 300 })).toEqual([
      'Durata senza flag',
    ]);
  });

  it('il filtro sul voto lascia fuori i non votati', async () => {
    const votato = await aggiungi(userId, { name: 'Votato' });
    await aggiungi(userId, { name: 'Non votato' });
    await updateBacklogEntry(userId, { id: votato, rating: 4 });

    expect(await nomi(userId, { ratingMin: 3 })).toEqual(['Votato']);
  });

  it('mai giocato comprende i possessi senza ore, che non sono zero ore', async () => {
    await aggiungi(userId, { name: 'Aggiunto a mano' });
    const giocato = await aggiungi(userId, { name: 'Giocato' });

    await db
      .update(schema.ownerships)
      .set({ playtimeMinutes: 600 })
      .where(eq(schema.ownerships.backlogId, giocato));

    // L'aggiunto a mano ha il possesso con ore NULL: nessuno ha mai detto che l'ha
    // giocato, quindi sta fra i non cominciati.
    expect(await nomi(userId, { neverPlayed: true })).toEqual([
      'Aggiunto a mano',
    ]);
  });
});

describe('voto della critica', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('filtra e ordina sul voto scelto, non su una fonte in particolare', async () => {
    await aggiungi(userId, { name: 'Acclamato', criticScore: 92 });
    await aggiungi(userId, { name: 'Mediocre', criticScore: 61 });
    // Non arricchito: `critic_score` è nullo, e un voto che non c'è non è uno
    // zero — deve restare fuori dal filtro senza sparire dalla lista.
    await aggiungi(userId, { name: 'Senza voto' });

    expect(await nomi(userId, { criticMin: 80 })).toEqual(['Acclamato']);
    expect(
      await nomi(userId, { sort: 'criticRating', direction: 'desc' }),
    ).toEqual(['Acclamato', 'Mediocre', 'Senza voto']);
  });

  it('la lista porta il voto scelto con la sua fonte, e il nullo resta nullo', async () => {
    // La card lo mostra quando l'utente non ha votato: senza la fonte il
    // numero non si legge, perché OpenCritic e Metacritic non stanno sulla
    // stessa scala.
    await aggiungi(userId, {
      name: 'Acclamato',
      criticScore: 92,
      criticScoreSource: 'opencritic',
    });
    await aggiungi(userId, { name: 'Senza voto' });

    const { entries } = await search(userId, {
      sort: 'name',
      direction: 'asc',
    });
    expect(
      entries.map(({ game }) => [
        game.name,
        game.criticScore,
        game.criticScoreSource,
      ]),
    ).toEqual([
      ['Acclamato', 92, 'opencritic'],
      ['Senza voto', null, null],
    ]);
  });
});

describe('stato completato', () => {
  it('si salva e si filtra come gli altri stati', async () => {
    // Il valore è arrivato con una migration su un enum di Postgres: se non
    // fosse applicata, l'inserimento fallirebbe qui.
    const userId = await createUser();
    const game = await createGame({ name: 'Platinato' });
    await addToBacklog({
      userId,
      gameId: game.id,
      status: 'completed',
      ownerships: [{ platformSlug: 'pc_windows' }],
    });
    await aggiungi(userId, { name: 'Da giocare' });

    expect(await nomi(userId, { status: ['completed'] })).toEqual([
      'Platinato',
    ]);
  });
});

describe('ordinamento e paginazione', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('i NULL vanno in fondo, in entrambe le direzioni', async () => {
    await aggiungi(userId, { name: 'Lungo', hltbMainMinutes: 6_000 });
    await aggiungi(userId, { name: 'Corto', hltbMainMinutes: 120 });
    await aggiungi(userId, { name: 'Ignoto' });

    expect(await nomi(userId, { sort: 'duration', direction: 'asc' })).toEqual([
      'Corto',
      'Lungo',
      'Ignoto',
    ]);
    expect(await nomi(userId, { sort: 'duration', direction: 'desc' })).toEqual(
      ['Lungo', 'Corto', 'Ignoto'],
    );
  });

  it("l'ordine sopravvive all'idratazione della seconda fase", async () => {
    await aggiungi(userId, { name: 'Cesare' });
    await aggiungi(userId, { name: 'anna' });
    await aggiungi(userId, { name: 'Bruno' });

    // Il caso che conta è che l'ordine NON sia quello di inserimento: la
    // seconda query rende le righe come vuole, e il riordino è a carico nostro.
    expect(await nomi(userId, { sort: 'name', direction: 'asc' })).toEqual([
      'anna',
      'Bruno',
      'Cesare',
    ]);
  });

  it('«aggiunto» ordina per la data di aggiunta, non per quando è nata la riga', async () => {
    await aggiungi(userId, { name: 'Vecchio' });
    const corretto = await aggiungi(userId, { name: 'Nuovo' });
    // Nato dopo, ma entrato in libreria anni prima: è il caso di ogni import.
    await updateBacklogEntry(userId, {
      id: corretto,
      addedAt: new Date('2010-01-01Z'),
    });

    expect(await nomi(userId, { sort: 'addedAt', direction: 'desc' })).toEqual([
      'Vecchio',
      'Nuovo',
    ]);
  });

  it('il totale è quello prima del limite', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await aggiungi(userId, { name });
    }

    const page = await search(userId, { limit: 2 });
    expect(page.entries).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('paginando su una chiave tutta pari non si salta né si ripete niente', async () => {
    // Cinque giochi senza voto: la chiave di ordinamento pareggia su tutti, ed
    // è esattamente il caso in cui senza spareggio Postgres può rendere lo
    // stesso insieme in ordine diverso a ogni pagina.
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await aggiungi(userId, { name });
    }

    const visti: string[] = [];
    for (let offset = 0; offset < 5; offset += 2) {
      const page = await search(userId, { sort: 'rating', limit: 2, offset });
      visti.push(...page.entries.map((entry) => entry.game.name));
    }

    expect(visti.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('ricerca testuale', () => {
  it('cerca solo nel nome, e i jolly di LIKE sono lettere', async () => {
    const userId = await createUser();
    await aggiungi(userId, { name: 'Sconto 50% Edition' });
    await aggiungi(userId, { name: 'Qualunque cosa' });

    expect(await nomi(userId, { q: '50%' })).toEqual(['Sconto 50% Edition']);
    // Cercare "%" trova i titoli che un `%` ce l'hanno davvero, e **solo**
    // quelli: senza la fuga sarebbe il jolly di LIKE e li prenderebbe tutti,
    // "Qualunque cosa" compreso.
    expect(await nomi(userId, { q: '%' })).toEqual(['Sconto 50% Edition']);
  });

  it('non guarda nelle note, che sono testo libero per scelta', async () => {
    const userId = await createUser();
    const id = await aggiungi(userId, { name: 'Un gioco' });
    await updateBacklogEntry(userId, { id, notes: 'parolachiave' });

    expect(await nomi(userId, { q: 'parolachiave' })).toEqual([]);
  });
});

describe('isolamento per utente', () => {
  it('il backlog di un altro non entra nei risultati né nel totale', async () => {
    const mio = await createUser();
    const altro = await createUser();
    await aggiungi(mio, { name: 'Mio' });
    await aggiungi(altro, { name: 'Suo' });

    const risultato = await search(mio);
    expect(risultato.entries.map((entry) => entry.game.name)).toEqual(['Mio']);
    expect(risultato.total).toBe(1);
  });
});

describe('opzioni del pannello', () => {
  it('offre solo i valori presenti nel backlog di chi guarda', async () => {
    const mio = await createUser();
    const altro = await createUser();

    const gioco = await createGame({ name: 'Mio' });
    await addToBacklog({
      userId: mio,
      gameId: gioco.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });

    const suo = await createGame({ name: 'Suo' });
    await addToBacklog({
      userId: altro,
      gameId: suo.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'nintendo_switch', store: 'nintendo' }],
    });

    const opzioni = await listBacklogFilterOptions(mio);
    expect(opzioni.platforms.map((row) => row.slug)).toEqual(['pc_windows']);
    expect(opzioni.stores).toEqual(['steam']);
  });

  it('offre gli abbonamenti che ci sono, e il comprato non è una voce', async () => {
    const userId = await createUser();
    await conAbbonamento(userId, 'Famiglia', [
      {
        platformSlug: 'pc_windows',
        store: 'steam',
        subscription: 'steam_family',
      },
    ]);
    await conAbbonamento(userId, 'Comprato', [
      { platformSlug: 'pc_windows', store: 'steam', subscription: null },
    ]);

    // Niente PS Plus: non c'è una copia, quindi non è una voce da offrire.
    expect((await listBacklogFilterOptions(userId)).subscriptions).toEqual([
      'steam_family',
    ]);
  });

  it('una copia della famiglia solo su un gioco nascosto non fa comparire la voce', async () => {
    const userId = await createUser();
    const id = await conAbbonamento(userId, 'Nascosto', [
      {
        platformSlug: 'pc_windows',
        store: 'steam',
        subscription: 'steam_family',
      },
    ]);
    await setBacklogHidden(userId, id, true);

    expect((await listBacklogFilterOptions(userId)).subscriptions).toEqual([]);
  });

  it('lo store nullo degli inserimenti manuali non diventa una voce', async () => {
    const userId = await createUser();
    await aggiungi(userId, { name: 'A mano' });

    expect((await listBacklogFilterOptions(userId)).stores).toEqual([]);
  });
});

// --- utilità ---

type CopiaConAbbonamento = {
  platformSlug: string;
  store: 'steam' | 'psn';
  subscription: 'ps_plus' | 'steam_family' | null;
};

/**
 * Un gioco con copie che hanno un abbonamento.
 *
 * `addToBacklog` non lo prende: l'abbonamento lo scrive solo l'import, e
 * l'inserimento a mano non sa dirlo. Qui lo si scrive a mano sulla copia, che è
 * ciò che l'import lascia in tabella.
 */
async function conAbbonamento(
  userId: string,
  name: string,
  copie: CopiaConAbbonamento[],
) {
  const game = await createGame({ name });
  const id = await addToBacklog({
    userId,
    gameId: game.id,
    status: 'backlog',
    ownerships: copie.map(({ platformSlug, store }) => ({
      platformSlug,
      store,
    })),
  });
  for (const copia of copie) {
    await db
      .update(schema.ownerships)
      .set({ subscription: copia.subscription })
      .where(
        and(
          eq(schema.ownerships.backlogId, id),
          eq(schema.ownerships.platformSlug, copia.platformSlug),
        ),
      );
  }
  return id;
}

async function aggiungi(
  userId: string,
  values: Parameters<typeof createGame>[0],
) {
  const game = await createGame(values);
  return addToBacklog({
    userId,
    gameId: game.id,
    status: 'backlog',
    ownerships: [{ platformSlug: 'pc_windows' }],
  });
}

describe('nascosti', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('la lista di sempre li esclude, la vista dei nascosti rende solo loro', async () => {
    await aggiungi(userId, { name: 'Visibile' });
    const nascosto = await aggiungi(userId, { name: 'Nascosto' });
    await setBacklogHidden(userId, nascosto, true);

    expect(await nomi(userId)).toEqual(['Visibile']);
    expect(await nomi(userId, { hidden: true })).toEqual(['Nascosto']);
    // Il totale segue la vista: «3 giochi» con due a schermo mentirebbe.
    expect((await search(userId)).total).toBe(1);
  });

  it('rimesso in lista, torna nella lista di sempre', async () => {
    const id = await aggiungi(userId, { name: 'Ripensato' });
    await setBacklogHidden(userId, id, true);
    await setBacklogHidden(userId, id, false);

    expect(await nomi(userId)).toEqual(['Ripensato']);
    expect(await nomi(userId, { hidden: true })).toEqual([]);
  });

  it('nasconderlo due volte non ne sposta la data', async () => {
    const id = await aggiungi(userId, { name: 'Due volte' });
    await setBacklogHidden(userId, id, true);
    const [prima] = await db
      .select({ hiddenAt: schema.backlog.hiddenAt })
      .from(schema.backlog)
      .where(eq(schema.backlog.id, id));

    await setBacklogHidden(userId, id, true);
    const [dopo] = await db
      .select({ hiddenAt: schema.backlog.hiddenAt })
      .from(schema.backlog)
      .where(eq(schema.backlog.id, id));

    expect(dopo!.hiddenAt).toEqual(prima!.hiddenAt);
  });

  it('il pannello dei filtri non propone ciò che sta solo sui nascosti', async () => {
    const game = await createGame({ name: 'Solo su Switch' });
    const id = await addToBacklog({
      userId,
      gameId: game.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'nintendo_switch' }],
    });
    await aggiungi(userId, { name: 'Su PC' });
    await setBacklogHidden(userId, id, true);

    const { platforms } = await listBacklogFilterOptions(userId);
    expect(platforms.map((row) => row.slug)).toEqual(['pc_windows']);
  });

  it('non nasconde la riga di un altro utente', async () => {
    const altro = await createUser();
    const suo = await aggiungi(altro, { name: 'Suo' });

    await expect(setBacklogHidden(userId, suo, true)).resolves.toBeUndefined();
    expect(await nomi(altro)).toEqual(['Suo']);
  });
});

describe('tipo della scheda', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('le spunte sono in OR: un gioco ha un tipo solo', async () => {
    // Al contrario di piattaforme, store e tag, che sono in AND: lì una riga può
    // avere più valori, qui no, e l'AND darebbe sempre zero.
    await aggiungi(userId, { name: 'Gioco', gameType: 'main_game' });
    await aggiungi(userId, { name: 'Espansione', gameType: 'expansion' });
    await aggiungi(userId, { name: 'Pacchetto', gameType: 'bundle' });

    expect(await nomi(userId, { gameTypes: ['expansion'] })).toEqual([
      'Espansione',
    ]);
    expect(
      (await nomi(userId, { gameTypes: ['expansion', 'bundle'] })).sort(),
    ).toEqual(['Espansione', 'Pacchetto']);
  });

  it('un gioco senza tipo non risponde a nessuna spunta, ma c è senza filtro', async () => {
    // Null è «non lo so»: un gioco non ancora arricchito non è un gioco
    // principale, e dirlo sarebbe inventare un dato che IGDB non ha dato.
    await aggiungi(userId, { name: 'Non arricchito' });
    await aggiungi(userId, { name: 'Gioco', gameType: 'main_game' });

    expect(await nomi(userId, { gameTypes: ['main_game'] })).toEqual(['Gioco']);
    expect((await nomi(userId)).sort()).toEqual(['Gioco', 'Non arricchito']);
  });

  it('il pannello propone i tipi presenti, senza i nulli e senza i nascosti', async () => {
    await aggiungi(userId, { name: 'Senza tipo' });
    await aggiungi(userId, { name: 'Gioco', gameType: 'main_game' });
    const nascosto = await aggiungi(userId, {
      name: 'DLC nascosto',
      gameType: 'dlc',
    });
    await setBacklogHidden(userId, nascosto, true);

    // L'ordine è quello dell'enum, che Postgres rispetta: prima «Gioco».
    const { gameTypes } = await listBacklogFilterOptions(userId);
    expect(gameTypes).toEqual(['main_game']);
  });

  it('propone i tipi nell ordine in cui sono dichiarati', async () => {
    await aggiungi(userId, { name: 'Port', gameType: 'port' });
    await aggiungi(userId, { name: 'DLC', gameType: 'dlc' });
    await aggiungi(userId, { name: 'Gioco', gameType: 'main_game' });

    const { gameTypes } = await listBacklogFilterOptions(userId);
    expect(gameTypes).toEqual(['main_game', 'dlc', 'port']);
  });
});
