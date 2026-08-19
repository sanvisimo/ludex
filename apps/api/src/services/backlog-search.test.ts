import type { BacklogQueryInput } from '@repo/contracts';
import { BacklogQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { addToBacklog, updateBacklogEntry } from './backlog';
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
    // Senza fuga, `%` sarebbe "qualunque cosa" e prenderebbe tutto.
    expect(await nomi(userId, { q: '%' })).toEqual([]);
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

  it('lo store nullo degli inserimenti manuali non diventa una voce', async () => {
    const userId = await createUser();
    await aggiungi(userId, { name: 'A mano' });

    expect((await listBacklogFilterOptions(userId)).stores).toEqual([]);
  });
});

// --- utilità ---

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
