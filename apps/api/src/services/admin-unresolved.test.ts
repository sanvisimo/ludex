import type { HiddenKind } from '@repo/contracts';
import { GlobalHiddenKindSchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import {
  findIgdbGamesByExternalIds,
  findIgdbGamesBySource,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import {
  hideUnresolvedForAll,
  listGlobalHidden,
  listUnresolvedGroups,
  resolveUnresolvedForAll,
  unhideUnresolvedForAll,
} from './admin-unresolved';
import { importLibrary } from './library-import';
import { setUnresolvedImportHidden } from './unresolved-imports';

vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  findIgdbGamesByExternalIds: vi.fn(),
  findIgdbGamesBySource: vi.fn(),
  searchIgdbGames: vi.fn(),
  igdbSourceFor: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({
  enqueueEnrichment: vi.fn(),
  enqueuePostImport: vi.fn(),
}));

beforeEach(() => {
  // Nessuna risoluzione esterna: una voce si risolve solo se `external_ids`
  // la conosce già, cioè se qualcuno l'ha collegata.
  vi.mocked(findIgdbGamesByExternalIds).mockResolvedValue(new Map());
  vi.mocked(findIgdbGamesBySource).mockResolvedValue(new Map());
  vi.mocked(igdbSourceFor).mockReturnValue(null);
  vi.mocked(searchIgdbGames).mockResolvedValue([]);
});

// Netflix su PSN: lo stesso id in ogni libreria che lo ha.
const NETFLIX = 'CUSA00129_00';
const voce = {
  externalId: NETFLIX,
  name: 'Netflix',
  platformSlug: 'sony_playstation4',
};

/** Un utente con un account PSN, e Netflix fra i suoi scarti. */
async function conNetflix(hidden: HiddenKind | null = null) {
  const userId = await createUser();
  const account = await linkStoreAccount(userId, 'psn');
  await importLibrary(account, [voce]);
  if (hidden) {
    const [riga] = await scartiDi(userId);
    await setUnresolvedImportHidden(userId, riga!.id, hidden);
  }
  return { userId, account };
}

const scartiDi = (userId: string) =>
  db
    .select({
      id: schema.unresolvedImports.id,
      hiddenKind: schema.unresolvedImports.hiddenKind,
    })
    .from(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.userId, userId));

const backlogDi = (userId: string) =>
  db
    .select({
      gameId: schema.backlog.gameId,
      hidden: schema.backlog.hiddenAt,
    })
    .from(schema.backlog)
    .where(eq(schema.backlog.userId, userId));

describe('«Collega per tutti»', () => {
  it('risolve gli scarti di tutti, e chi l aveva nascosto lo ritrova nascosto', async () => {
    const gioco = await createGame({ igdbId: 777, name: 'Netflix' });
    const visibile = await conNetflix();
    const nascosto = await conNetflix('app');

    expect(await resolveUnresolvedForAll('psn', NETFLIX, 777)).toEqual({
      status: 'ok',
      resolved: 2,
    });

    expect(await backlogDi(visibile.userId)).toEqual([
      { gameId: gioco.id, hidden: null },
    ]);
    // Collegare è un fatto del catalogo, nascondere una scelta sua.
    expect(await backlogDi(nascosto.userId)).toEqual([
      { gameId: gioco.id, hidden: expect.any(Date) },
    ]);
    expect(await scartiDi(visibile.userId)).toEqual([]);
    expect(await scartiDi(nascosto.userId)).toEqual([]);
  });

  it('ripetuto due volte dà lo stesso risultato', async () => {
    await createGame({ igdbId: 777 });
    const { userId } = await conNetflix();

    await resolveUnresolvedForAll('psn', NETFLIX, 777);
    const dopoUna = await backlogDi(userId);

    expect(await resolveUnresolvedForAll('psn', NETFLIX, 777)).toEqual({
      status: 'ok',
      resolved: 0,
    });
    expect(await backlogDi(userId)).toEqual(dopoUna);
    const mappature = await db
      .select()
      .from(schema.externalIds)
      .where(eq(schema.externalIds.externalId, NETFLIX));
    expect(mappature).toHaveLength(1);
  });

  it('non nasconde un gioco che l utente ha già e vede', async () => {
    const gioco = await createGame({ igdbId: 777 });
    const { userId } = await conNetflix('app');
    await db.insert(schema.backlog).values({ userId, gameId: gioco.id });

    await resolveUnresolvedForAll('psn', NETFLIX, 777);

    expect(await backlogDi(userId)).toEqual([
      { gameId: gioco.id, hidden: null },
    ]);
  });

  it('si ferma se la chiave è già di un altro gioco: quello è ripuntare', async () => {
    const altro = await createGame({ igdbId: 1, name: 'Toki' });
    await createGame({ igdbId: 777 });
    const { userId } = await conNetflix();
    await db
      .insert(schema.externalIds)
      .values({ gameId: altro.id, source: 'psn', externalId: NETFLIX });

    expect(await resolveUnresolvedForAll('psn', NETFLIX, 777)).toEqual({
      status: 'linked_elsewhere',
      game: 'Toki',
    });
    expect(await scartiDi(userId)).toHaveLength(1);
  });
});

describe("l'import, quando uno scarto nascosto si risolve", () => {
  it('lo mette nel backlog nascosto', async () => {
    const gioco = await createGame({ igdbId: 777 });
    const { userId, account } = await conNetflix('app');
    // Qualcuno l'ha collegato per tutti dal suo lato.
    await db
      .insert(schema.externalIds)
      .values({ gameId: gioco.id, source: 'psn', externalId: NETFLIX });

    await importLibrary(account, [voce]);

    expect(await backlogDi(userId)).toEqual([
      { gameId: gioco.id, hidden: expect.any(Date) },
    ]);
    expect(await scartiDi(userId)).toEqual([]);
  });

  it('lo lascia visibile se nello stesso import arriva anche da una voce visibile', async () => {
    const gioco = await createGame({ igdbId: 777 });
    const { userId, account } = await conNetflix('app');
    await db.insert(schema.externalIds).values([
      { gameId: gioco.id, source: 'psn', externalId: NETFLIX },
      { gameId: gioco.id, source: 'psn', externalId: 'PPSA00001_00' },
    ]);

    await importLibrary(account, [
      voce,
      {
        externalId: 'PPSA00001_00',
        name: 'Netflix',
        platformSlug: 'sony_playstation5',
      },
    ]);

    expect(await backlogDi(userId)).toEqual([
      { gameId: gioco.id, hidden: null },
    ]);
  });
});

describe('«Nascondi per tutti»', () => {
  it('nasconde i visibili e non tocca quelli già nascosti dall utente', async () => {
    const visibile = await conNetflix();
    const suo = await conNetflix('unwanted');
    const admin = await createUser();

    expect(await hideUnresolvedForAll(admin, 'psn', NETFLIX, 'app')).toEqual({
      hidden: 1,
    });

    expect(await scartiDi(visibile.userId)).toEqual([
      expect.objectContaining({ hiddenKind: 'app' }),
    ]);
    expect(await scartiDi(suo.userId)).toEqual([
      expect.objectContaining({ hiddenKind: 'unwanted' }),
    ]);
  });

  it('fa nascere nascoste le righe nuove, solo all inserimento', async () => {
    const admin = await createUser();
    const prima = await conNetflix();
    await hideUnresolvedForAll(admin, 'psn', NETFLIX, 'app');

    // Un utente nuovo: la voce nasce già nascosta.
    const nuovo = await conNetflix();
    expect(await scartiDi(nuovo.userId)).toEqual([
      expect.objectContaining({ hiddenKind: 'app' }),
    ]);

    // Chi la rimette fra i «da sistemare» resta libero: il reimport non la
    // rinasconde.
    const [riga] = await scartiDi(prima.userId);
    await setUnresolvedImportHidden(prima.userId, riga!.id, null);
    await importLibrary(prima.account, [voce]);
    expect(await scartiDi(prima.userId)).toEqual([
      expect.objectContaining({ hiddenKind: null }),
    ]);
  });

  it('tolta la regola, le righe nuove nascono visibili e le vecchie restano', async () => {
    const admin = await createUser();
    const prima = await conNetflix();
    await hideUnresolvedForAll(admin, 'psn', NETFLIX, 'app');

    expect(await unhideUnresolvedForAll('psn', NETFLIX)).toBe(true);
    expect(await unhideUnresolvedForAll('psn', NETFLIX)).toBe(false);

    expect(await scartiDi(prima.userId)).toEqual([
      expect.objectContaining({ hiddenKind: 'app' }),
    ]);
    const dopo = await conNetflix();
    expect(await scartiDi(dopo.userId)).toEqual([
      expect.objectContaining({ hiddenKind: null }),
    ]);
  });

  it('scrive chi l ha deciso e il nome della voce', async () => {
    const admin = await createUser();
    await conNetflix();
    await hideUnresolvedForAll(admin, 'psn', NETFLIX, 'app');

    expect(await listGlobalHidden()).toEqual([
      expect.objectContaining({
        store: 'psn',
        externalId: NETFLIX,
        name: 'Netflix',
        hiddenKind: 'app',
        decidedBy: expect.any(String),
        libraries: 1,
      }),
    ]);
  });

  it('non accetta `unwanted`: né il contratto né il database', async () => {
    expect(GlobalHiddenKindSchema.safeParse('unwanted').success).toBe(false);
    await expect(
      db.insert(schema.globalHiddenImports).values({
        store: 'psn',
        externalId: NETFLIX,
        name: 'Netflix',
        hiddenKind: 'unwanted',
      }),
    ).rejects.toThrow();
  });
});

describe('la lista degli scarti di tutti', () => {
  it('una riga per chiave, con quante librerie e come l hanno nascosta', async () => {
    await conNetflix();
    await conNetflix();
    await conNetflix('app');
    // Una chiave tutta nascosta non è più da sistemare per nessuno.
    const altro = await createUser();
    const account = await linkStoreAccount(altro, 'psn');
    await importLibrary(account, [
      {
        externalId: 'CUSA99999_00',
        name: 'YouTube',
        platformSlug: 'sony_playstation4',
      },
    ]);
    const [riga] = await db
      .select({ id: schema.unresolvedImports.id })
      .from(schema.unresolvedImports)
      .where(
        and(
          eq(schema.unresolvedImports.userId, altro),
          eq(schema.unresolvedImports.externalId, 'CUSA99999_00'),
        ),
      );
    await setUnresolvedImportHidden(altro, riga!.id, 'app');

    const { rows, total } = await listUnresolvedGroups({
      limit: 50,
      offset: 0,
    });

    expect(total).toBe(1);
    expect(rows).toEqual([
      expect.objectContaining({
        store: 'psn',
        externalId: NETFLIX,
        name: 'Netflix',
        libraries: 3,
        visible: 2,
        hidden: expect.objectContaining({ app: 1, unwanted: 0 }),
      }),
    ]);
  });
});
