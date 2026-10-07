import type { PlaylistQueryInput } from '@repo/contracts';
import { PlaylistQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { addToBacklog, updateBacklogEntry } from './backlog';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  openPlaylist,
  updatePlaylist,
} from './playlists';

// Si testa ciò che, rompendosi, mente all'utente: la playlist di un altro che si
// legge o si cambia, il nome che si duplica, il tag cancellato che svuota la
// lista, il campo vecchio che rompe l'apertura.

/** Passa da Zod come fa il contratto: `sort` e `direction` hanno un default lì. */
const query = (input: PlaylistQueryInput = {}) =>
  PlaylistQuerySchema.parse(input);

const open = (userId: string, id: string) =>
  openPlaylist(userId, { id, limit: 50, offset: 0 });

async function aggiungi(
  userId: string,
  game: Parameters<typeof createGame>[0],
) {
  const { id } = await createGame(game);
  return addToBacklog({
    userId,
    gameId: id,
    status: 'backlog',
    ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
  });
}

describe('playlist', () => {
  let userId: string;
  let altro: string;

  beforeEach(async () => {
    userId = await createUser();
    altro = await createUser();
  });

  it('apre la query salvata, e segue il backlog a ogni apertura', async () => {
    await aggiungi(userId, { name: 'Breve', hltbMainMinutes: 60 });
    await aggiungi(userId, { name: 'Lungo', hltbMainMinutes: 3000 });
    const playlist = await createPlaylist(userId, {
      name: 'Brevi',
      query: query({ durationMax: 120 }),
    });

    const prima = await open(userId, playlist!.id);
    expect(prima!.entries.map((e) => e.game.name)).toEqual(['Breve']);
    expect(prima!.total).toBe(1);

    // Un gioco nuovo nel backlog entra da solo: la playlist è una domanda.
    await aggiungi(userId, { name: 'Altro breve', hltbMainMinutes: 30 });
    const dopo = await open(userId, playlist!.id);
    expect(dopo!.total).toBe(2);
  });

  it('la pagina la sceglie chi apre, e il totale resta quello intero', async () => {
    for (const name of ['A', 'B', 'C'])
      await aggiungi(userId, { name, hltbMainMinutes: 30 });
    const playlist = await createPlaylist(userId, {
      name: 'Tutti',
      query: query({ sort: 'name', direction: 'asc' }),
    });

    const pagina = await openPlaylist(userId, {
      id: playlist!.id,
      limit: 2,
      offset: 2,
    });
    expect(pagina!.entries.map((e) => e.game.name)).toEqual(['C']);
    expect(pagina!.total).toBe(3);
  });

  it('un utente non vede, non cambia e non cancella quelle di un altro', async () => {
    const sua = await createPlaylist(userId, {
      name: 'Mia',
      query: query(),
    });

    expect(await listPlaylists(altro)).toEqual([]);
    expect(await open(altro, sua!.id)).toBeUndefined();
    expect(
      await updatePlaylist(altro, { id: sua!.id, name: 'Rubata' }),
    ).toBeUndefined();
    expect(await deletePlaylist(altro, sua!.id)).toBeUndefined();

    const [ancora] = await listPlaylists(userId);
    expect(ancora!.name).toBe('Mia');
  });

  it('il nome è unico per utente senza guardare le maiuscole, ma non fra utenti', async () => {
    expect(
      await createPlaylist(userId, { name: 'Brevi', query: query() }),
    ).not.toBeNull();
    expect(
      await createPlaylist(userId, { name: 'brevi', query: query() }),
    ).toBeNull();
    // Un altro utente può chiamare la sua allo stesso modo.
    expect(
      await createPlaylist(altro, { name: 'Brevi', query: query() }),
    ).not.toBeNull();

    // Rinominare su un nome già preso è lo stesso conflitto, non un errore.
    const seconda = await createPlaylist(userId, {
      name: 'Lunghe',
      query: query(),
    });
    expect(
      await updatePlaylist(userId, { id: seconda!.id, name: 'BREVI' }),
    ).toBeNull();
    // Cambiare solo le maiuscole del proprio nome invece sì: è la stessa riga.
    expect(
      await updatePlaylist(userId, { id: seconda!.id, name: 'LUNGHE' }),
    ).toMatchObject({ name: 'LUNGHE' });
  });

  it('update lascia com’è ciò che non si manda', async () => {
    const playlist = await createPlaylist(userId, {
      name: 'Brevi',
      query: query({ durationMax: 120 }),
    });

    const rinominata = await updatePlaylist(userId, {
      id: playlist!.id,
      name: 'Corti',
    });
    expect(rinominata).toMatchObject({
      name: 'Corti',
      query: { durationMax: 120 },
    });

    const riscritta = await updatePlaylist(userId, {
      id: playlist!.id,
      query: query({ durationMax: 30 }),
    });
    expect(riscritta).toMatchObject({
      name: 'Corti',
      query: { durationMax: 30 },
    });
  });

  describe('tag', () => {
    async function tagId(name: string) {
      const [row] = await db
        .select({ id: schema.userTags.id })
        .from(schema.userTags)
        .where(eq(schema.userTags.name, name));
      return row!.id;
    }

    it('un tag cancellato si ignora e si segnala, invece di svuotare la lista', async () => {
      const gioco = await aggiungi(userId, { name: 'Con tag' });
      await aggiungi(userId, { name: 'Senza tag' });
      await updateBacklogEntry(userId, {
        id: gioco,
        tags: [
          { kind: 'tag', name: 'stanco' },
          { kind: 'tag', name: 'corto' },
        ],
      });
      const playlist = await createPlaylist(userId, {
        name: 'Stanco e corto',
        query: query({ tags: [await tagId('stanco'), await tagId('corto')] }),
      });

      const intera = await open(userId, playlist!.id);
      expect(intera!.entries.map((e) => e.game.name)).toEqual(['Con tag']);
      expect(intera!.missingTags).toBe(0);

      // Con «corto» tolto dal vocabolario, in AND non troverebbe più niente.
      await db
        .delete(schema.userTags)
        .where(eq(schema.userTags.id, await tagId('corto')));
      const dopo = await open(userId, playlist!.id);
      expect(dopo!.entries.map((e) => e.game.name)).toEqual(['Con tag']);
      expect(dopo!.missingTags).toBe(1);

      // Tolti tutti i tag, la playlist non filtra più per tag, e lo dice.
      await db
        .delete(schema.userTags)
        .where(eq(schema.userTags.id, await tagId('stanco')));
      const vuota = await open(userId, playlist!.id);
      expect(vuota!.total).toBe(2);
      expect(vuota!.missingTags).toBe(2);
    });

    it('l’id di un tag altrui vale come un tag che non c’è', async () => {
      const gioco = await aggiungi(altro, { name: 'Dell’altro' });
      await updateBacklogEntry(altro, {
        id: gioco,
        tags: [{ kind: 'tag', name: 'suo' }],
      });
      await aggiungi(userId, { name: 'Mio' });

      const playlist = await createPlaylist(userId, {
        name: 'Con tag altrui',
        query: query({ tags: [await tagId('suo')] }),
      });
      const aperta = await open(userId, playlist!.id);

      expect(aperta!.missingTags).toBe(1);
      expect(aperta!.entries.map((e) => e.game.name)).toEqual(['Mio']);
    });
  });

  it('una playlist salvata prima di un campo ne prende il default, e uno sconosciuto si scarta', async () => {
    // Scritta a mano nel formato di «prima»: senza `sort` e `direction`, e con
    // un campo che oggi non esiste più.
    const [row] = await db
      .insert(schema.playlists)
      .values({
        userId,
        name: 'Vecchia',
        query: { durationMax: 90, campoTolto: 'x' } as never,
      })
      .returning({ id: schema.playlists.id });
    await aggiungi(userId, { name: 'Breve', hltbMainMinutes: 60 });

    const aperta = await open(userId, row!.id);

    expect(aperta!.query).toEqual({
      durationMax: 90,
      sort: 'addedAt',
      direction: 'desc',
    });
    expect(aperta!.entries.map((e) => e.game.name)).toEqual(['Breve']);
  });

  it('una playlist non può salvare la vista dei nascosti', () => {
    // `hidden` non sta nello schema: una playlist non può salvarlo.
    expect(PlaylistQuerySchema.parse({ hidden: true })).not.toHaveProperty(
      'hidden',
    );
  });
});
