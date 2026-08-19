import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import {
  addOwnershipToEntry,
  addToBacklog,
  findEntryById,
  updateBacklogEntry,
} from './backlog';
import { deleteUserTag, listUserTags } from './tags';

// Si testa ciò che rompendosi corrompe dati: la scrittura idempotente dei
// possessi e lo scoping per utente dei tag. Il resto è CRUD.

describe('campi personali', () => {
  let userId: string;
  let entryId: string;

  beforeEach(async () => {
    userId = await createUser();
    const game = await createGame();
    entryId = await addToBacklog({
      userId,
      gameId: game.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows' }],
    });
  });

  it("assente lascia il campo dov'era, null lo svuota", async () => {
    await updateBacklogEntry(userId, {
      id: entryId,
      rating: 4.5,
      notes: 'da finire',
    });

    // Solo il voto: le note non erano nell'input e non devono sparire.
    await updateBacklogEntry(userId, { id: entryId, rating: 3 });
    expect(await findEntryById(userId, entryId)).toMatchObject({
      rating: 3,
      notes: 'da finire',
    });

    await updateBacklogEntry(userId, { id: entryId, rating: null });
    expect(await findEntryById(userId, entryId)).toMatchObject({
      rating: null,
      notes: 'da finire',
    });
  });

  it('le note svuotate dalla UI arrivano come stringa vuota e valgono null', async () => {
    await updateBacklogEntry(userId, { id: entryId, notes: 'qualcosa' });
    await updateBacklogEntry(userId, { id: entryId, notes: '' });

    expect(await findEntryById(userId, entryId)).toMatchObject({ notes: null });
  });

  it('il database rifiuta un voto fuori scala o non a mezze stelle', async () => {
    await expect(
      updateBacklogEntry(userId, { id: entryId, rating: 3.7 }),
    ).rejects.toThrow();
    await expect(
      updateBacklogEntry(userId, { id: entryId, rating: 7 }),
    ).rejects.toThrow();
    await expect(
      updateBacklogEntry(userId, { id: entryId, rating: 0 }),
    ).rejects.toThrow();
  });

  it('non tocca la riga di un altro utente', async () => {
    const altro = await createUser();

    expect(
      await updateBacklogEntry(altro, { id: entryId, rating: 1 }),
    ).toBeNull();
    expect(await findEntryById(userId, entryId)).toMatchObject({
      rating: null,
    });
  });
});

describe('tag e categorie', () => {
  let userId: string;
  let entryId: string;

  beforeEach(async () => {
    userId = await createUser();
    const game = await createGame();
    entryId = await addToBacklog({
      userId,
      gameId: game.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows' }],
    });
  });

  it('crea i tag che non esistono e riusa quelli che ci sono', async () => {
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [
        { kind: 'tag', name: 'da rigiocare' },
        { kind: 'category', name: 'GDR lunghi' },
      ],
    });

    // Riscritto con gli stessi nomi: il vocabolario non deve crescere.
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [
        { kind: 'tag', name: 'da rigiocare' },
        { kind: 'category', name: 'GDR lunghi' },
      ],
    });

    expect(await listUserTags(userId)).toHaveLength(2);
    expect(await findEntryById(userId, entryId)).toMatchObject({
      tags: expect.arrayContaining([
        expect.objectContaining({ kind: 'tag', name: 'da rigiocare' }),
        expect.objectContaining({ kind: 'category', name: 'GDR lunghi' }),
      ]),
    });
  });

  it('lo stesso nome scritto con maiuscole diverse è lo stesso tag', async () => {
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'Rilassante' }],
    });
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'RILASSANTE' }],
    });

    const tags = await listUserTags(userId);
    expect(tags).toHaveLength(1);
    // Vince la grafia di chi l'ha scritto per primo.
    expect(tags[0]).toMatchObject({ name: 'Rilassante' });
  });

  it('lo stesso nome come tag e come categoria sono due cose diverse', async () => {
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [
        { kind: 'tag', name: 'horror' },
        { kind: 'category', name: 'horror' },
      ],
    });

    expect(await listUserTags(userId)).toHaveLength(2);
  });

  it("riscrive l'insieme: i tag tolti si staccano", async () => {
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [
        { kind: 'tag', name: 'uno' },
        { kind: 'tag', name: 'due' },
      ],
    });

    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'uno' }],
    });

    const entry = await findEntryById(userId, entryId);
    expect(entry?.tags).toHaveLength(1);
    expect(entry?.tags[0]).toMatchObject({ name: 'uno' });
    // Staccato, non cancellato: resta nel vocabolario per riusarlo altrove.
    expect(await listUserTags(userId)).toHaveLength(2);
  });

  it('tags assente non tocca i tag, array vuoto li stacca tutti', async () => {
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'uno' }],
    });

    await updateBacklogEntry(userId, { id: entryId, rating: 5 });
    expect((await findEntryById(userId, entryId))?.tags).toHaveLength(1);

    await updateBacklogEntry(userId, { id: entryId, tags: [] });
    expect((await findEntryById(userId, entryId))?.tags).toHaveLength(0);
  });

  it('cancellare un tag lo stacca da tutti i giochi', async () => {
    const altroGioco = await createGame();
    const altraRiga = await addToBacklog({
      userId,
      gameId: altroGioco.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows' }],
    });

    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'refuso' }],
    });
    await updateBacklogEntry(userId, {
      id: altraRiga,
      tags: [{ kind: 'tag', name: 'refuso' }],
    });

    const [tag] = await listUserTags(userId);
    await deleteUserTag(userId, tag!.id);

    // Il cascade su `backlog_tags`: nessuna delle due righe se lo tiene.
    expect((await findEntryById(userId, entryId))?.tags).toHaveLength(0);
    expect((await findEntryById(userId, altraRiga))?.tags).toHaveLength(0);
    expect(await listUserTags(userId)).toHaveLength(0);
  });

  it('non cancella il tag di un altro utente', async () => {
    const altro = await createUser();
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'mio' }],
    });

    const [tag] = await listUserTags(userId);
    expect(await deleteUserTag(altro, tag!.id)).toBeUndefined();
    expect(await listUserTags(userId)).toHaveLength(1);
  });

  it('due utenti che scrivono lo stesso nome hanno due tag distinti', async () => {
    const altro = await createUser();
    const gioco = await createGame();
    const altraRiga = await addToBacklog({
      userId: altro,
      gameId: gioco.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows' }],
    });

    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'rilassante' }],
    });
    await updateBacklogEntry(altro, {
      id: altraRiga,
      tags: [{ kind: 'tag', name: 'rilassante' }],
    });

    const miei = await listUserTags(userId);
    const suoi = await listUserTags(altro);
    expect(miei).toHaveLength(1);
    expect(suoi).toHaveLength(1);
    // È il punto: il tag di uno non è il tag dell'altro, anche se si chiamano uguale.
    expect(miei[0]!.id).not.toBe(suoi[0]!.id);
  });
});

describe('aggiunta di un possesso', () => {
  let userId: string;
  let entryId: string;

  beforeEach(async () => {
    userId = await createUser();
    const game = await createGame();
    entryId = await addToBacklog({
      userId,
      gameId: game.id,
      status: 'backlog',
      ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
    });
  });

  it("aggiunge la piattaforma senza toccare quelle che c'erano", async () => {
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'nintendo_switch',
    });

    const entry = await findEntryById(userId, entryId);
    expect(entry?.ownerships).toHaveLength(2);
    expect(entry?.ownerships.map((o) => o.platformSlug).sort()).toEqual([
      'nintendo_switch',
      'pc_windows',
    ]);
  });

  it('riaggiungere lo stesso possesso non duplica e non azzera le ore', async () => {
    await db
      .update(schema.ownerships)
      .set({ playtimeMinutes: 660 })
      .where(eq(schema.ownerships.backlogId, entryId));

    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'pc_windows',
      store: 'steam',
    });

    const entry = await findEntryById(userId, entryId);
    expect(entry?.ownerships).toHaveLength(1);
    // Il COALESCE di `ensureOwnerships`: una scrittura manuale non porta le ore
    // e non deve cancellare quelle dell'import.
    expect(entry?.ownerships[0]).toMatchObject({ playtimeMinutes: 660 });
  });

  it('stessa piattaforma con store diverso è un possesso in più', async () => {
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'pc_windows',
      store: 'gog',
    });

    expect((await findEntryById(userId, entryId))?.ownerships).toHaveLength(2);
  });

  it('non scrive sulla riga di un altro utente', async () => {
    const altro = await createUser();

    expect(
      await addOwnershipToEntry(altro, entryId, {
        platformSlug: 'nintendo_switch',
      }),
    ).toBeNull();
    expect((await findEntryById(userId, entryId))?.ownerships).toHaveLength(1);
  });
});
