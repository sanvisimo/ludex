import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ago,
  createGame,
  createUser,
  linkStoreAccount,
  setSource,
} from '../../test/factories';
import { findIgdbGameById } from '../external/igdb';
import {
  listUnresolvedImports,
  resolveUnresolvedImport,
  setUnresolvedImportHidden,
} from './unresolved-imports';

vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  searchIgdbGames: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

const mockedFindById = vi.mocked(findIgdbGameById);

async function pending(
  userId: string,
  over: {
    externalId?: string;
    name?: string;
    playtimeMinutes?: number;
    accountId?: string;
  } = {},
) {
  const account = over.accountId
    ? { id: over.accountId }
    : await linkStoreAccount(userId, 'steam');
  const [row] = await db
    .insert(schema.unresolvedImports)
    .values({
      userId,
      store: 'steam',
      storeAccountId: account.id,
      externalId: over.externalId ?? '931180',
      name: over.name ?? 'Conan Exiles - Public Beta Client',
      playtimeMinutes: over.playtimeMinutes ?? null,
    })
    .returning({ id: schema.unresolvedImports.id });
  return row!.id;
}

describe('unresolved imports', () => {
  it("chiama l'account come l'utente, poi come il negozio, poi con l'id", async () => {
    // La precedenza è quella di `storeAccountName`, e questa lista è l'unico
    // posto dell'app dove si vede il nome di un account accanto a uno scarto.
    // Prima la query se la riscriveva in SQL con un coalesce a due termini, e
    // sul caso di partenza — nessuna etichetta, nessun nome dal negozio, che è
    // esattamente com'è un account appena collegato quando la chiamata al
    // profilo non è riuscita — rendeva **null** una cosa dichiarata stringa.
    const account = await linkStoreAccount(userId, 'steam', 'acct-42');
    await pending(userId, { accountId: account.id });

    const nome = async () =>
      (await listUnresolvedImports(userId))[0]?.storeName;
    const rinomina = (values: { label?: string; displayName?: string }) =>
      db
        .update(schema.storeAccounts)
        .set(values)
        .where(eq(schema.storeAccounts.id, account.id));

    expect(await nome()).toBe('acct-42');

    await rinomina({ displayName: 'sanvi' });
    expect(await nome()).toBe('sanvi');

    // L'etichetta vince sul nome del negozio: è l'unica cosa che distingue due
    // account che il negozio chiama allo stesso modo.
    await rinomina({ label: 'quello di famiglia' });
    expect(await nome()).toBe('quello di famiglia');
  });

  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('risolta, la voce diventa backlog e sparisce dagli scarti', async () => {
    const id = await pending(userId, { playtimeMinutes: 660 });
    mockedFindById.mockResolvedValue({
      igdbId: 555,
      name: 'Dungeon Alchemist',
      releaseYear: null,
      developer: null,
      cover: null,
      gameType: null,
      totalRatingCount: null,
    });

    const esito = await resolveUnresolvedImport(userId, id, 555);

    expect(esito.status).toBe('ok');
    expect(esito.entry).toMatchObject({
      game: { igdbId: 555 },
      ownerships: [
        { platformSlug: 'pc_windows', store: 'steam', playtimeMinutes: 660 },
      ],
    });
    expect(await listUnresolvedImports(userId)).toHaveLength(0);
  });

  it("scrive la mappatura, così l'appid resta risolto per tutti", async () => {
    const id = await pending(userId, { externalId: '1588530' });
    mockedFindById.mockResolvedValue({
      igdbId: 555,
      name: 'Dungeon Alchemist',
      releaseYear: null,
      developer: null,
      cover: null,
      gameType: null,
      totalRatingCount: null,
    });

    await resolveUnresolvedImport(userId, id, 555);

    // È la parte che conta più della riga di backlog: il prossimo import, suo o
    // di un altro utente, non ripassa da qui.
    expect(await db.select().from(schema.externalIds)).toMatchObject([
      { source: 'steam', externalId: '1588530' },
    ]);
  });

  it('non tocca la voce di un altro utente', async () => {
    const altro = await createUser();
    const id = await pending(altro);

    await expect(
      resolveUnresolvedImport(userId, id, 555),
    ).resolves.toMatchObject({
      status: 'not_found',
    });
    await expect(
      setUnresolvedImportHidden(userId, id, 'app'),
    ).resolves.toBeUndefined();
    expect(await listUnresolvedImports(altro)).toMatchObject([
      { hiddenAt: null, hiddenKind: null },
    ]);
  });

  it('rifiuta un igdbId che IGDB non conosce, senza consumare la voce', async () => {
    const id = await pending(userId);
    mockedFindById.mockResolvedValue(null);

    await expect(
      resolveUnresolvedImport(userId, id, 999_999),
    ).resolves.toMatchObject({
      status: 'unknown_igdb_id',
    });
    expect(await listUnresolvedImports(userId)).toHaveLength(1);
  });

  it('si rifiuta di risolvere lo scarto di un negozio senza piattaforma nota', async () => {
    // PSN e non GOG: dal 9a GOG una piattaforma ce l'ha (`pc_windows`, come
    // Steam). I negozi ancora scoperti sono quelli console, ed è lì che la
    // domanda è davvero senza risposta — questa voce è PS4 o PS5?
    const psn = await linkStoreAccount(userId, 'psn');
    const [row] = await db
      .insert(schema.unresolvedImports)
      .values({
        userId,
        store: 'psn',
        storeAccountId: psn.id,
        externalId: '1',
        name: 'Qualcosa',
      })
      .returning({ id: schema.unresolvedImports.id });

    // Meglio fermarsi che archiviare il gioco su una piattaforma a caso: sarebbe
    // un dato sbagliato scritto senza che nessuno se ne accorga, dentro la
    // colonna su cui poi si filtra.
    await expect(resolveUnresolvedImport(userId, row!.id, 555)).rejects.toThrow(
      'psn',
    );
  });

  it('risolve sulla piattaforma che lo scarto si porta dietro', async () => {
    // Il rovescio del test qui sopra, ed è il 9b che lo rende possibile: la
    // voce PSN sa di essere PS5, quindi non c'è più niente da indovinare e il
    // possesso nasce sulla console giusta.
    const psn = await linkStoreAccount(userId, 'psn');
    const [row] = await db
      .insert(schema.unresolvedImports)
      .values({
        userId,
        store: 'psn',
        storeAccountId: psn.id,
        externalId: 'PPSA02262_00',
        name: 'Dying Light 2: Stay Human',
        platformSlug: 'sony_playstation5',
      })
      .returning({ id: schema.unresolvedImports.id });

    mockedFindById.mockResolvedValue({
      igdbId: 102584,
      name: 'Dying Light 2: Stay Human',
      releaseYear: null,
      developer: null,
      cover: null,
      gameType: null,
      totalRatingCount: null,
    });

    const esito = await resolveUnresolvedImport(userId, row!.id, 102584);
    expect(esito.status).toBe('ok');
    expect(esito.entry?.ownerships).toMatchObject([
      { platformSlug: 'sony_playstation5', store: 'psn' },
    ]);
  });

  it('nascosta, la voce resta con il suo perché e non entra nel backlog', async () => {
    const id = await pending(userId);

    await setUnresolvedImportHidden(userId, id, 'prerelease');

    // Resta: è ciò che la distingue dal vecchio `dismiss`, che cancellava la
    // riga e lasciava al prossimo import il compito di riportarla.
    const [voce] = await listUnresolvedImports(userId);
    expect(voce).toMatchObject({ hiddenKind: 'prerelease' });
    expect(voce?.hiddenAt).toBeInstanceOf(Date);
    expect(await db.select().from(schema.backlog)).toHaveLength(0);
  });

  it('cambiare il perché non sposta la data, rimetterla la toglie', async () => {
    const id = await pending(userId);
    await setUnresolvedImportHidden(userId, id, 'unwanted');
    const [prima] = await listUnresolvedImports(userId);

    // Corretta a posteriori: è la stessa decisione, non una nuova, e la vista
    // dei nascosti in ordine di data non deve riportarla in cima.
    await setUnresolvedImportHidden(userId, id, 'app');
    const [dopo] = await listUnresolvedImports(userId);
    expect(dopo).toMatchObject({
      hiddenKind: 'app',
      hiddenAt: prima!.hiddenAt,
    });

    await setUnresolvedImportHidden(userId, id, null);
    expect(await listUnresolvedImports(userId)).toMatchObject([
      { hiddenAt: null, hiddenKind: null },
    ]);
  });

  it('il database rifiuta una voce nascosta senza perché', async () => {
    // Il vincolo sta nel database e non solo nel servizio: la domanda «fatto o
    // preferenza?» dello step 11 si fa sulle righe, e una riga nascosta senza
    // tipo non saprebbe rispondere.
    const id = await pending(userId);
    await expect(
      db
        .update(schema.unresolvedImports)
        .set({ hiddenAt: new Date() })
        .where(eq(schema.unresolvedImports.id, id)),
    ).rejects.toThrow();
  });

  it('risolve su un gioco che esiste già senza duplicarlo', async () => {
    const game = await createGame({ igdbId: 555 });
    const id = await pending(userId);

    const esito = await resolveUnresolvedImport(userId, id, 555);

    expect(esito.status).toBe('ok');
    expect(
      await db.select().from(schema.games).where(eq(schema.games.igdbId, 555)),
    ).toHaveLength(1);
    expect(esito.status === 'ok' && esito.entry?.game.id).toBe(game.id);
    // Il gioco c'era: non si ricontrolla su IGDB.
    expect(mockedFindById).not.toHaveBeenCalled();
  });

  it('collegare a mano un appid Steam riapre i not_found del gioco', async () => {
    // Lo stesso evento di quando l'appid lo porta IGDB: HLTB e Metacritic
    // verificano l'identità su quello, e prima avevano solo il nome.
    const game = await createGame({ igdbId: 555 });
    await setSource({
      gameId: game.id,
      source: 'metacritic',
      status: 'not_found',
      attemptedAt: ago.days(3),
    });
    const id = await pending(userId, { externalId: '1588530' });

    await resolveUnresolvedImport(userId, id, 555);

    const [metacritic] = await db
      .select({ status: schema.gameSources.status })
      .from(schema.gameSources)
      .where(eq(schema.gameSources.gameId, game.id));
    expect(metacritic).toEqual({ status: 'pending' });
  });
});
