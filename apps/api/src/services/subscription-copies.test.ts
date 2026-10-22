import type { Subscription } from '@repo/contracts/vocabulary';
import { BacklogQuerySchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import { ensureOwnerships } from './backlog';
import { listBacklogFilterOptions, searchBacklog } from './backlog-search';
import { pruneSubscriptionCopies } from './subscription-copies';

// Lo step 14: cosa succede a una copia da abbonamento che il negozio non elenca
// più. Le chiamate dagli import (Steam, PSN, EA, Xbox) si provano nei loro file;
// qui la regola, su Postgres, perché è fatta di DELETE in cascata e di righe
// che restano.

type Account = Awaited<ReturnType<typeof linkStoreAccount>>;

let userId: string;
let account: Account;

beforeEach(async () => {
  userId = await createUser();
  account = await linkStoreAccount(userId, 'psn');
});

/** Una riga di backlog sul gioco, con i dati dell'utente che servono. */
async function riga(
  gameId: string,
  dati: { rating?: number; status?: 'backlog' | 'played' } = {},
) {
  const [row] = await db
    .insert(schema.backlog)
    .values({ userId, gameId, ...dati })
    .returning();
  return row!;
}

async function copia(
  backlogId: string,
  over: {
    platformSlug?: string;
    subscription?: Subscription | null;
    account?: Account | null;
    endedAt?: Date | null;
  } = {},
) {
  const conto = over.account === undefined ? account : over.account;
  const [row] = await db
    .insert(schema.ownerships)
    .values({
      backlogId,
      platformSlug: over.platformSlug ?? 'sony_playstation5',
      store: conto?.store ?? null,
      storeAccountId: conto?.id ?? null,
      subscription:
        over.subscription === undefined ? 'ps_plus' : over.subscription,
      medium: 'digital',
      subscriptionEndedAt: over.endedAt ?? null,
    })
    .returning();
  return row!;
}

const copie = () => db.select().from(schema.ownerships);
const righe = () =>
  db.select().from(schema.backlog).where(eq(schema.backlog.userId, userId));

describe('pruneSubscriptionCopies', () => {
  it('una copia che torna non si tocca', async () => {
    const { id: game } = await createGame();
    const r = await riga(game);
    await copia(r.id);

    const report = await pruneSubscriptionCopies(
      account,
      new Set([`${game}|sony_playstation5`]),
    );

    expect(report).toEqual({ removed: 0, kept: 0 });
    expect(await copie()).toHaveLength(1);
  });

  it('senza dati dell’utente esce la copia, con la riga di backlog; il gioco resta', async () => {
    const { id: game } = await createGame();
    const r = await riga(game);
    await copia(r.id);

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 1, kept: 0 });
    expect(await copie()).toHaveLength(0);
    expect(await righe()).toHaveLength(0);
    expect(
      await db.select().from(schema.games).where(eq(schema.games.id, game)),
    ).toHaveLength(1);
  });

  it('con un’altra copia tua esce solo questa', async () => {
    const { id: game } = await createGame();
    const r = await riga(game, { rating: 4 });
    await copia(r.id);
    // Lo stesso gioco su disco, scritto a mano.
    const disco = await copia(r.id, { subscription: null, account: null });

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 1, kept: 0 });
    expect((await copie()).map((c) => c.id)).toEqual([disco.id]);
    expect(await righe()).toHaveLength(1);
  });

  it('con dati dell’utente l’ultima copia resta, «non più tua»', async () => {
    const { id: game } = await createGame();
    const r = await riga(game, { status: 'played' });
    await copia(r.id);

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 0, kept: 1 });
    const [rimasta] = await copie();
    expect(rimasta?.subscriptionEndedAt).toBeInstanceOf(Date);
    expect(rimasta?.subscription).toBe('ps_plus');
    expect(await righe()).toMatchObject([{ status: 'played' }]);
  });

  it('la data della marca è quella del primo import che non l’ha vista', async () => {
    const { id: game } = await createGame();
    const r = await riga(game, { rating: 4 });
    const prima = new Date('2026-09-01T00:00:00Z');
    await copia(r.id, { endedAt: prima });

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 0, kept: 1 });
    expect((await copie())[0]?.subscriptionEndedAt).toEqual(prima);
  });

  it('due copie uscite dello stesso gioco non si tengono in vita a vicenda', async () => {
    const senzaDati = await riga((await createGame()).id);
    await copia(senzaDati.id, { platformSlug: 'sony_playstation4' });
    await copia(senzaDati.id, { platformSlug: 'sony_playstation5' });
    const conDati = await riga((await createGame()).id, { rating: 3 });
    await copia(conDati.id, { platformSlug: 'sony_playstation4' });
    await copia(conDati.id, { platformSlug: 'sony_playstation5' });

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 2, kept: 2 });
    expect((await righe()).map((r) => r.id)).toEqual([conDati.id]);
    const rimaste = await copie();
    expect(rimaste).toHaveLength(2);
    expect(rimaste.every((c) => c.subscriptionEndedAt !== null)).toBe(true);
  });

  it('una copia già «non più tua» non tiene in vita quella che esce adesso', async () => {
    const altro = await linkStoreAccount(userId, 'psn');
    const r = await riga((await createGame()).id);
    // Marcata da un altro account, quando la riga aveva ancora un voto.
    await copia(r.id, { account: altro, endedAt: new Date() });
    await copia(r.id);

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 1, kept: 0 });
    expect(await righe()).toHaveLength(0);
    expect(await copie()).toHaveLength(0);
  });

  it('una riga a cui l’utente ha tolto i dati se ne va al giro dopo', async () => {
    const r = await riga((await createGame()).id, { rating: 4 });
    await copia(r.id);
    await pruneSubscriptionCopies(account, new Set());

    await db.update(schema.backlog).set({ rating: null });
    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 1, kept: 0 });
    expect(await righe()).toHaveLength(0);
  });

  it('si tiene per gioco e piattaforma: la console che non torna esce', async () => {
    const xbox = await linkStoreAccount(userId, 'xbox');
    const { id: game } = await createGame();
    const r = await riga(game);
    await copia(r.id, {
      account: xbox,
      platformSlug: 'xbox_one',
      subscription: 'game_pass',
    });
    const series = await copia(r.id, {
      account: xbox,
      platformSlug: 'xbox_series',
      subscription: 'game_pass',
    });

    const report = await pruneSubscriptionCopies(
      xbox,
      new Set([`${game}|xbox_series`]),
    );

    expect(report).toEqual({ removed: 1, kept: 0 });
    expect((await copie()).map((c) => c.id)).toEqual([series.id]);
  });

  it('non tocca le copie comprate né quelle di un altro account', async () => {
    const altro = await linkStoreAccount(userId, 'psn');
    const comprata = await riga((await createGame()).id);
    await copia(comprata.id, { subscription: null });
    const dellAltro = await riga((await createGame()).id);
    await copia(dellAltro.id, { account: altro });

    const report = await pruneSubscriptionCopies(account, new Set());

    expect(report).toEqual({ removed: 0, kept: 0 });
    expect(await copie()).toHaveLength(2);
  });
});

describe('una copia «non più tua»', () => {
  it('il reimport che la ritrova la rimette tua', async () => {
    const r = await riga((await createGame()).id, { rating: 4 });
    await copia(r.id, { endedAt: new Date() });

    await ensureOwnerships([
      {
        backlogId: r.id,
        platformSlug: 'sony_playstation5',
        store: 'psn',
        storeAccountId: account.id,
        subscription: 'ps_plus',
        medium: 'digital',
      },
    ]);

    const [tornata] = await copie();
    expect(tornata?.subscriptionEndedAt).toBeNull();
  });

  it('non conta per il filtro della piattaforma, e la piattaforma non si offre', async () => {
    const { id: finito } = await createGame({ name: 'Finito' });
    const r = await riga(finito, { rating: 4 });
    await copia(r.id, { endedAt: new Date() });
    const { id: vivo } = await createGame({ name: 'Vivo' });
    await copia((await riga(vivo)).id, { platformSlug: 'sony_playstation4' });

    const ps5 = await searchBacklog(
      userId,
      BacklogQuerySchema.parse({ platforms: ['sony_playstation5'] }),
    );
    expect(ps5.entries).toHaveLength(0);
    // Senza filtro si vede: è ancora una riga del backlog, coi dati sopra.
    const tutti = await searchBacklog(userId, BacklogQuerySchema.parse({}));
    expect(tutti.entries.map((e) => e.game.name).sort()).toEqual([
      'Finito',
      'Vivo',
    ]);
    expect(
      tutti.entries.find((e) => e.game.name === 'Finito')?.ownerships[0]
        ?.subscriptionEndedAt,
    ).toBeInstanceOf(Date);

    const { platforms } = await listBacklogFilterOptions(userId);
    expect(platforms.map((p) => p.slug)).toEqual(['sony_playstation4']);
  });
});
