import { db, schema } from '@repo/db';
import { describe, expect, it, vi } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import { setSourceExternalId } from './admin-sources';
import {
  closeReports,
  createReports,
  listOpenReports,
  myCopies,
  openReportsForGame,
} from './reports';

vi.mock('../queue/enrichment', () => ({ enqueueEnrichment: vi.fn() }));

/** Un utente con una copia Nintendo del gioco. */
async function conCopia(gameId: string) {
  const userId = await createUser();
  const account = await linkStoreAccount(userId, 'nintendo');
  const [backlog] = await db
    .insert(schema.backlog)
    .values({ userId, gameId })
    .returning({ id: schema.backlog.id });
  await db.insert(schema.ownerships).values({
    backlogId: backlog!.id,
    platformSlug: 'nintendo_switch',
    store: 'nintendo',
    storeAccountId: account.id,
  });
  return userId;
}

describe('le segnalazioni', () => {
  it('una per cosa, e risegnalare aggiorna quella aperta', async () => {
    const gioco = await createGame();
    const userId = await conCopia(gioco.id);

    await createReports(userId, {
      gameId: gioco.id,
      targets: [{ store: 'nintendo' }, { source: 'hltb' }],
      suggestedName: 'Toki 2018',
    });
    await createReports(userId, {
      gameId: gioco.id,
      targets: [{ store: 'nintendo' }],
      suggestedIgdbId: 94084,
      note: 'è il remake',
    });

    const righe = await db.select().from(schema.gameReports);
    expect(righe).toHaveLength(2);
    expect(righe.find((r) => r.store === 'nintendo')).toMatchObject({
      suggestedIgdbId: 94084,
      suggestedName: null,
      note: 'è il remake',
    });
  });

  it('la copia di un negozio si segnala solo se è tua; la fonte sempre', async () => {
    const gioco = await createGame();
    const estraneo = await createUser();

    expect(
      await createReports(estraneo, {
        gameId: gioco.id,
        targets: [{ store: 'nintendo' }],
      }),
    ).toEqual({ status: 'not_owned' });
    expect(
      await createReports(estraneo, {
        gameId: gioco.id,
        targets: [{ source: 'metacritic' }],
      }),
    ).toMatchObject({ status: 'ok', open: [{ source: 'metacritic' }] });
  });

  it('chiusa, la si può riaprire con una segnalazione nuova', async () => {
    const gioco = await createGame();
    const userId = await conCopia(gioco.id);
    await createReports(userId, {
      gameId: gioco.id,
      targets: [{ store: 'nintendo' }],
    });

    expect(await closeReports(gioco.id, { store: 'nintendo' }, null)).toBe(1);
    expect(await openReportsForGame(userId, gioco.id)).toEqual([]);

    await createReports(userId, {
      gameId: gioco.id,
      targets: [{ store: 'nintendo' }],
    });
    expect(await openReportsForGame(userId, gioco.id)).toHaveLength(1);
    expect(await db.select().from(schema.gameReports)).toHaveLength(2);
  });

  it('l admin le vede una riga per gioco e cosa, coi suggerimenti senza doppioni', async () => {
    const gioco = await createGame({ name: 'Toki' });
    for (let i = 0; i < 3; i++) {
      const userId = await conCopia(gioco.id);
      await createReports(userId, {
        gameId: gioco.id,
        targets: [{ store: 'nintendo' }],
        suggestedIgdbId: 94084,
      });
    }

    const { rows, total } = await listOpenReports({ limit: 50, offset: 0 });

    expect(total).toBe(1);
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Toki',
        store: 'nintendo',
        source: null,
        users: 3,
        suggestions: [{ igdbId: 94084, name: null }],
      }),
    ]);
  });

  it('«Inserisci id» chiude quelle su quella fonte', async () => {
    const gioco = await createGame();
    const userId = await conCopia(gioco.id);
    const admin = await createUser();
    await createReports(userId, {
      gameId: gioco.id,
      targets: [{ store: 'nintendo' }, { source: 'metacritic' }],
    });

    await setSourceExternalId(gioco.id, 'metacritic', 'toki', admin);

    expect(
      (await openReportsForGame(userId, gioco.id)).map((r) => r.store),
    ).toEqual(['nintendo']);
  });
});

describe('le mie copie, in «Segnala un errore»', () => {
  /** Una copia dell'utente, scritta dritta. */
  async function copia(
    userId: string,
    gameId: string,
    values: {
      platformSlug: string;
      store: 'psn' | 'steam' | null;
      storePage?: string;
    },
  ) {
    const [riga] = await db
      .insert(schema.backlog)
      .values({ userId, gameId })
      .onConflictDoNothing()
      .returning({ id: schema.backlog.id });
    const backlogId =
      riga?.id ??
      (await db.query.backlog.findFirst({
        where: (b, { and, eq }) =>
          and(eq(b.userId, userId), eq(b.gameId, gameId)),
      }))!.id;
    const [ownership] = await db
      .insert(schema.ownerships)
      .values({ backlogId, ...values })
      .returning({ id: schema.ownerships.id });
    return ownership!.id;
  }

  it('ogni copia col suo id e il titolo del negozio; solo le tue', async () => {
    const gioco = await createGame();
    await db.insert(schema.externalIds).values([
      {
        gameId: gioco.id,
        source: 'psn',
        externalId: 'CUSA36827_00',
        storeTitle: 'Viewfinder PS4',
        storeImageUrl: 'https://psn/ps4.png',
      },
      {
        gameId: gioco.id,
        source: 'psn',
        externalId: 'PPSA10248_00',
        storeTitle: 'Viewfinder PS5',
        storeImageUrl: 'https://psn/ps5.png',
        storeReleaseYear: 2023,
      },
      { gameId: gioco.id, source: 'psn', externalId: '10006160' },
    ]);
    const userId = await createUser();
    const ps5 = await copia(userId, gioco.id, {
      platformSlug: 'sony_playstation5',
      store: 'psn',
      storePage: 'product/EP5360-PPSA10248_00-VIEWFINDER0005EU',
    });
    // Aggiunta a mano: niente negozio, niente da mostrare.
    await copia(userId, gioco.id, {
      platformSlug: 'sony_playstation4',
      store: null,
    });
    // La copia di un altro utente non c'entra.
    await copia(await createUser(), gioco.id, {
      platformSlug: 'sony_playstation4',
      store: 'psn',
      storePage: 'product/EP5360-CUSA36827_00-VIEWFINDER0004EU',
    });

    expect(await myCopies(userId, gioco.id)).toEqual([
      {
        ownershipId: ps5,
        externalIds: ['PPSA10248_00'],
        storeTitle: 'Viewfinder PS5',
        storeImageUrl: 'https://psn/ps5.png',
        storeReleaseYear: 2023,
      },
    ]);
  });

  it('una copia ambigua ha tutti gli id, senza titolo né copertina', async () => {
    const gioco = await createGame();
    await db.insert(schema.externalIds).values([
      { gameId: gioco.id, source: 'steam', externalId: '20', storeTitle: 'A' },
      { gameId: gioco.id, source: 'steam', externalId: '10', storeTitle: 'B' },
    ]);
    const userId = await createUser();
    await copia(userId, gioco.id, {
      platformSlug: 'pc_windows',
      store: 'steam',
    });

    expect(await myCopies(userId, gioco.id)).toMatchObject([
      { externalIds: ['10', '20'], storeTitle: null, storeImageUrl: null },
    ]);
  });
});
