import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import {
  addOwnershipToEntry,
  addToBacklog,
  ensureOwnerships,
  findEntryById,
  removeOwnershipFromEntry,
  updateBacklogEntry,
} from './backlog';
import { unlinkStoreAccount } from './store-accounts';
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

  it("l'import adotta il possesso scritto a mano invece di sdoppiarlo", async () => {
    // `storeAccountId` è entrato nella chiave del vincolo: senza l'adozione, il
    // possesso «PC / Steam» inserito a mano e quello portato dall'import sono
    // due righe, e la scheda del gioco mostrerebbe Steam due volte.
    const account = await linkStoreAccount(userId, 'steam');

    await ensureOwnerships([
      {
        backlogId: entryId,
        platformSlug: 'pc_windows',
        store: 'steam',
        storeAccountId: account.id,
        playtimeMinutes: 630,
      },
    ]);

    const entry = await findEntryById(userId, entryId);
    expect(entry?.ownerships).toHaveLength(1);
    expect(entry?.ownerships[0]).toMatchObject({
      playtimeMinutes: 630,
      storeAccount: { id: account.id },
    });
  });

  it('due account dello stesso negozio sono due possessi', async () => {
    // Ed è il punto di tutta la modifica: per il filtro hard sono la stessa
    // cosa, ma per lanciare il gioco no — bisogna essere collegati a quello
    // giusto, e il backlog deve poterlo dire.
    const primo = await linkStoreAccount(userId, 'amazon', 'amazon-1');
    const secondo = await linkStoreAccount(userId, 'amazon', 'amazon-2');

    for (const account of [primo, secondo]) {
      await ensureOwnerships([
        {
          backlogId: entryId,
          platformSlug: 'pc_windows',
          store: 'amazon',
          storeAccountId: account.id,
        },
      ]);
    }

    const entry = await findEntryById(userId, entryId);
    const amazon = entry?.ownerships.filter((o) => o.store === 'amazon') ?? [];
    expect(amazon).toHaveLength(2);
    expect(amazon.map((o) => o.storeAccount?.id).sort()).toEqual(
      [primo.id, secondo.id].sort(),
    );
  });
});

// Il supporto è entrato nella chiave del vincolo, e con lui ha cambiato senso:
// non dice com'è fatta una copia, dice **quale** copia è. Da qui discende tutto
// ciò che segue, e il caso che lo giustifica è God of War (2018): comprato su
// disco e poi arrivato nel catalogo Plus. Per Sony da quel giorno è digitale, e
// con la chiave stretta il disco spariva dal database senza che nessuno lo
// avesse chiesto.
describe('il supporto distingue due copie', () => {
  let userId: string;
  let entryId: string;
  let account: { id: string };

  beforeEach(async () => {
    userId = await createUser();
    account = await linkStoreAccount(userId, 'psn');
    const game = await createGame();
    // Senza possessi, che qui sono ciò che si sta provando: `addToBacklog` ne
    // vuole almeno uno, e partire con una riga di troppo falserebbe i conteggi.
    const [entry] = await db
      .insert(schema.backlog)
      .values({ userId, gameId: game.id, status: 'backlog' })
      .returning({ id: schema.backlog.id });
    entryId = entry!.id;
  });

  async function importa(medium: 'digital' | 'physical', extra = {}) {
    await ensureOwnerships([
      {
        backlogId: entryId,
        platformSlug: 'sony_playstation5',
        store: 'psn',
        storeAccountId: account.id,
        medium,
        ...extra,
      },
    ]);
  }

  it('il disco dichiarato a mano non se lo prende un import digitale', async () => {
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
      medium: 'physical',
    });
    await importa('digital', { subscription: 'ps_plus' as const });

    const ownerships = (await findEntryById(userId, entryId))?.ownerships ?? [];
    expect(ownerships).toHaveLength(2);
    // Il disco resta senza negozio e senza abbonamento: è tuo, e nessun import
    // lo ha portato.
    expect(ownerships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          medium: 'physical',
          store: null,
          subscription: null,
        }),
        expect.objectContaining({ medium: 'digital', subscription: 'ps_plus' }),
      ]),
    );
  });

  it("il disco dichiarato a mano e quello dell'import sono la stessa copia", async () => {
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
      medium: 'physical',
    });
    await importa('physical', { playtimeMinutes: 120 });

    const ownerships = (await findEntryById(userId, entryId))?.ownerships ?? [];
    expect(ownerships).toHaveLength(1);
    expect(ownerships[0]).toMatchObject({
      medium: 'physical',
      store: 'psn',
      playtimeMinutes: 120,
      storeAccount: { id: account.id },
    });
  });

  it("una riga che non dichiara il supporto se la prende l'import", async () => {
    // È la forma di ogni possesso scritto a mano prima che il campo esistesse:
    // «non lo so» non è «un'altra copia», quindi si fa adottare.
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
    });
    await importa('physical');

    const ownerships = (await findEntryById(userId, entryId))?.ownerships ?? [];
    expect(ownerships).toHaveLength(1);
    expect(ownerships[0]).toMatchObject({ medium: 'physical', store: 'psn' });
  });

  it('la riga rimasta accanto a quella già importata si cancella', async () => {
    // Lo stato di chi aveva inserito il gioco a mano *prima* che l'adozione
    // esistesse: due righe per la stessa copia. Adottare violerebbe il vincolo,
    // quindi la meno specifica se ne va — la più specifica sa già tutto.
    await importa('physical', { playtimeMinutes: 30 });
    await db.insert(schema.ownerships).values({
      backlogId: entryId,
      platformSlug: 'sony_playstation5',
    });

    await importa('physical', { playtimeMinutes: 45 });

    const ownerships = (await findEntryById(userId, entryId))?.ownerships ?? [];
    expect(ownerships).toHaveLength(1);
    expect(ownerships[0]).toMatchObject({
      medium: 'physical',
      playtimeMinutes: 45,
    });
  });

  it('dichiarare il disco dove c’è solo il digitale aggiunge una copia', async () => {
    await importa('digital');
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
      medium: 'physical',
    });

    expect(
      ((await findEntryById(userId, entryId))?.ownerships ?? [])
        .map((row) => row.medium)
        .sort(),
    ).toEqual(['digital', 'physical']);
  });

  it('dichiarare un possesso che c’è già non ne crea un altro', async () => {
    await importa('digital');

    // Senza supporto: «ce l'ho su PS5» non contraddice niente.
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
    });
    // E dichiarando lo stesso supporto nemmeno.
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
      medium: 'digital',
    });

    expect((await findEntryById(userId, entryId))?.ownerships).toHaveLength(1);
  });

  it('dichiarare il supporto su una riga che non lo diceva la completa', async () => {
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'nintendo_switch',
    });
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'nintendo_switch',
      medium: 'physical',
    });

    const ownerships = (await findEntryById(userId, entryId))?.ownerships ?? [];
    expect(ownerships).toHaveLength(1);
    expect(ownerships[0]).toMatchObject({ medium: 'physical' });
  });
});

// Il caso vero è il disco dedotto: un giocato PSN con `service: other` entra
// come copia fisica, e un disco prestato da un amico entra come fosse tuo.
// Cancellare la riga non basta — l'import la rimette entro tre giorni — quindi
// ciò che si prova qui è che il rifiuto sopravviva al reimport.
describe('togliere una copia', () => {
  let userId: string;
  let entryId: string;
  let account: { id: string };

  beforeEach(async () => {
    userId = await createUser();
    account = await linkStoreAccount(userId, 'psn');
    const game = await createGame();
    const [entry] = await db
      .insert(schema.backlog)
      .values({ userId, gameId: game.id, status: 'backlog' })
      .returning({ id: schema.backlog.id });
    entryId = entry!.id;
  });

  /** Le due copie PS5 di un gioco comprato su disco e poi finito nel Plus. */
  async function importaDiscoEDigitale() {
    await ensureOwnerships([
      {
        backlogId: entryId,
        platformSlug: 'sony_playstation5',
        store: 'psn',
        storeAccountId: account.id,
        medium: 'physical',
      },
      {
        backlogId: entryId,
        platformSlug: 'sony_playstation5',
        store: 'psn',
        storeAccountId: account.id,
        medium: 'digital',
        subscription: 'ps_plus',
      },
    ]);
  }

  async function possessi() {
    return (await findEntryById(userId, entryId))?.ownerships ?? [];
  }

  it('il possesso tolto non torna al reimport', async () => {
    await importaDiscoEDigitale();
    const disco = (await possessi()).find((riga) => riga.medium === 'physical');

    expect(await removeOwnershipFromEntry(userId, entryId, disco!.id)).toBe(
      'ok',
    );
    expect(await possessi()).toHaveLength(1);

    await importaDiscoEDigitale();

    // La copia digitale resta: il rifiuto è sulla chiave del vincolo, e due
    // copie sulla stessa console sono due righe.
    const dopo = await possessi();
    expect(dopo).toHaveLength(1);
    expect(dopo[0]).toMatchObject({ medium: 'digital' });
  });

  it('riaggiungerlo a mano cancella il rifiuto', async () => {
    await importaDiscoEDigitale();
    const disco = (await possessi()).find((riga) => riga.medium === 'physical');
    await removeOwnershipFromEntry(userId, entryId, disco!.id);

    // È anche il gesto che disfa una rimozione sbagliata: la copia torna a
    // mano, e il reimport se la riprende con il suo account.
    await addOwnershipToEntry(userId, entryId, {
      platformSlug: 'sony_playstation5',
      medium: 'physical',
    });
    await importaDiscoEDigitale();

    const dopo = await possessi();
    expect(dopo).toHaveLength(2);
    expect(dopo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          medium: 'physical',
          storeAccount: expect.objectContaining({ id: account.id }),
        }),
      ]),
    );
  });

  it("l'ultimo possesso non si toglie", async () => {
    await ensureOwnerships([
      {
        backlogId: entryId,
        platformSlug: 'sony_playstation5',
        store: 'psn',
        storeAccountId: account.id,
        medium: 'digital',
      },
    ]);
    const solo = (await possessi())[0];

    expect(await removeOwnershipFromEntry(userId, entryId, solo!.id)).toBe(
      'last',
    );
    expect(await possessi()).toHaveLength(1);
  });

  it('un altro utente non tocca i possessi altrui', async () => {
    await importaDiscoEDigitale();
    const disco = (await possessi()).find((riga) => riga.medium === 'physical');
    const altro = await createUser();

    expect(await removeOwnershipFromEntry(altro, entryId, disco!.id)).toBe(
      'not-found',
    );
    expect(await possessi()).toHaveLength(2);
  });

  it('lo scollegamento che cancella i giochi si porta via anche i rifiuti', async () => {
    // Due account sullo stesso negozio, che è il caso per cui l'account sta
    // nella chiave. Il rifiuto è sul primo: cancellandolo, la riga di backlog
    // resta in piedi grazie al secondo, e il rifiuto se ne va da solo — con
    // `restrict` avrebbe invece bloccato lo scollegamento.
    const secondo = await linkStoreAccount(userId, 'psn');
    await importaDiscoEDigitale();
    await ensureOwnerships([
      {
        backlogId: entryId,
        platformSlug: 'sony_playstation5',
        store: 'psn',
        storeAccountId: secondo.id,
        medium: 'digital',
      },
    ]);

    const disco = (await possessi()).find((riga) => riga.medium === 'physical');
    await removeOwnershipFromEntry(userId, entryId, disco!.id);

    await unlinkStoreAccount(userId, account.id, 'purge');

    const rimasti = await db
      .select()
      .from(schema.ownershipRejections)
      .where(eq(schema.ownershipRejections.backlogId, entryId));
    expect(rimasti).toHaveLength(0);
    expect(await possessi()).toHaveLength(1);
  });
});
