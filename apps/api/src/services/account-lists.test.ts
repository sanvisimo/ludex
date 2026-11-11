import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import { accountListCounts, hiddenPage, reviewPage } from './account-lists';

const date = (day: number) => new Date(Date.UTC(2026, 0, day));
let userId: string;
let accountId: string;
let serial = 0;
async function pending(
  name: string,
  options: {
    user?: string;
    account?: string;
    store?: 'steam' | 'gog';
    parent?: string;
    kind?: 'app' | 'unwanted';
    at?: Date;
  } = {},
) {
  const [row] = await db
    .insert(schema.unresolvedImports)
    .values({
      userId: options.user ?? userId,
      storeAccountId: options.account ?? accountId,
      store: options.store ?? 'steam',
      externalId: `entry-${++serial}`,
      name,
      sameProductAs: options.parent ?? null,
      hiddenKind: options.kind ?? null,
      hiddenAt: options.kind ? (options.at ?? date(1)) : null,
    })
    .returning();
  return row!;
}
async function hiddenGame(
  name: string,
  at: Date,
  store: 'steam' | 'gog' = 'steam',
  user = userId,
) {
  const game = await createGame({ name });
  const [row] = await db
    .insert(schema.backlog)
    .values({ userId: user, gameId: game.id, hiddenAt: at })
    .returning();
  await db
    .insert(schema.ownerships)
    .values({ backlogId: row!.id, platformSlug: 'pc_windows', store });
  return row!;
}
beforeEach(async () => {
  userId = await createUser();
  accountId = (await linkStoreAccount(userId, 'steam')).id;
});

describe('account list pagination', () => {
  it('filtra prima del limite e tiene conteggi e isolamento utente', async () => {
    await pending('Delta');
    await pending('Alpha');
    await pending('Charlie');
    const other = await createUser();
    const account = await linkStoreAccount(other, 'steam');
    await pending('AAA foreign', { user: other, account: account.id });
    const gog = await linkStoreAccount(userId, 'gog');
    await pending('Alpha GOG', { store: 'gog', account: gog.id });
    const first = await reviewPage(userId, {
      page: 1,
      limit: 2,
      store: 'steam',
    });
    const second = await reviewPage(userId, {
      page: 2,
      limit: 2,
      store: 'steam',
    });
    expect(first.entries.map((x) => x.name)).toEqual(['Alpha', 'Charlie']);
    expect(second.entries.map((x) => x.name)).toEqual(['Delta']);
    expect(first.total).toBe(3);
    expect(
      (await reviewPage(userId, { page: 1, limit: 1, q: 'GOG' })).entries[0]
        ?.name,
    ).toBe('Alpha GOG');
    expect((await accountListCounts(userId)).toFix).toBe(4);
    const empty = await reviewPage(userId, {
      page: 3,
      limit: 25,
      q: 'missing',
    });
    expect(empty).toMatchObject({
      page: 1,
      total: 0,
      tab: 'unrecognised',
      entries: [],
    });
  });
  it('tratta caratteri speciali della ricerca come testo letterale', async () => {
    await pending('Bonus 100%');
    await pending('Bonus 1000');
    await pending('under_score');
    expect(
      (await reviewPage(userId, { page: 1, limit: 25, q: '%' })).total,
    ).toBe(1);
    expect(
      (await reviewPage(userId, { page: 1, limit: 25, q: '_' })).total,
    ).toBe(1);
  });
  it('riporta all’ultima pagina valida dopo aver nascosto l’ultima voce', async () => {
    await pending('A');
    await pending('B');
    const last = await pending('C');
    expect((await reviewPage(userId, { page: 2, limit: 2 })).page).toBe(2);
    await db
      .update(schema.unresolvedImports)
      .set({ hiddenAt: date(1), hiddenKind: 'app' })
      .where(eq(schema.unresolvedImports.id, last.id));
    const page = await reviewPage(userId, { page: 2, limit: 2 });
    expect(page.page).toBe(1);
    expect(page.entries).toHaveLength(2);
    expect(page.total).toBe(2);
  });
  it('pagina gruppi completi, anche quando la ricerca trova un solo figlio', async () => {
    await pending('Alpha match', { parent: 'group-1' });
    await pending('Beta sibling', { parent: 'group-1' });
    await pending('Hidden sibling', { parent: 'group-1', kind: 'app' });
    await pending('Zeta', { parent: 'group-2' });
    const first = await reviewPage(userId, {
      tab: 'duplicates',
      page: 1,
      limit: 1,
    });
    expect(first.total).toBe(2);
    expect(first.counts.duplicates).toBe(2);
    expect(first.entries.map((x) => x.name).sort()).toEqual([
      'Alpha match',
      'Beta sibling',
    ]);
    const filtered = await reviewPage(userId, {
      tab: 'duplicates',
      page: 1,
      limit: 1,
      q: 'match',
    });
    expect(filtered.total).toBe(1);
    expect(filtered.entries).toHaveLength(2);
    expect(
      (await reviewPage(userId, { tab: 'duplicates', page: 2, limit: 1 }))
        .entries[0]?.name,
    ).toBe('Zeta');
  });
  it('non mescola gruppi con lo stesso id esterno in negozi diversi', async () => {
    const gog = await linkStoreAccount(userId, 'gog');
    await pending('A steam', { parent: 'shared' });
    await pending('B gog', { parent: 'shared', store: 'gog', account: gog.id });
    const page = await reviewPage(userId, {
      tab: 'duplicates',
      page: 1,
      limit: 1,
    });
    expect(page.total).toBe(2);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.store).toBe('steam');
  });
  it('unisce giochi e import nascosti prima di ordinare e paginare', async () => {
    const imported = await pending('Old import', {
      kind: 'unwanted',
      at: date(1),
    });
    const game = await hiddenGame('Middle game', date(2));
    const recent = await pending('New import', {
      kind: 'unwanted',
      at: date(3),
    });
    await pending('Hidden app', { kind: 'app', at: date(4) });
    const first = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 1,
      limit: 2,
    });
    const second = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 2,
      limit: 2,
    });
    expect(first.items.map((x) => x.entry.id)).toEqual([recent.id, game.id]);
    expect(second.items.map((x) => x.entry.id)).toEqual([imported.id]);
    expect(first.counts).toMatchObject({ app: 1, unwanted: 3 });
    expect(first.total).toBe(3);
    expect(await accountListCounts(userId)).toEqual({ toFix: 0, hidden: 4 });
  });
  it('filtra entrambi i tipi per nome e negozio, senza leggere altri utenti', async () => {
    await pending('Shared steam', { kind: 'unwanted' });
    await hiddenGame('Shared game', date(2), 'steam');
    await hiddenGame('Shared gog', date(3), 'gog');
    const other = await createUser();
    await hiddenGame('Shared foreign', date(4), 'steam', other);
    const result = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 1,
      limit: 1,
      store: 'steam',
      q: 'Shared',
    });
    expect(result.total).toBe(2);
    expect(result.counts.unwanted).toBe(2);
    const first = result.items[0];
    expect(first?.type).toBe('game');
    if (first?.type === 'game')
      expect(first.entry.game.name).toBe('Shared game');
    const none = await hiddenPage(userId, { page: 9, limit: 25, q: 'missing' });
    expect(none.total).toBe(0);
    expect(none.page).toBe(1);
    expect(none.items).toEqual([]);
  });
  it('mantiene ordine stabile a parità di data e corregge pagina dopo il ripristino', async () => {
    await pending('Same time import', { kind: 'unwanted', at: date(1) });
    const game = await hiddenGame('Same time game', date(1));
    const page = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 1,
      limit: 1,
    });
    expect(page.items[0]?.type).toBe('game');
    await db
      .update(schema.backlog)
      .set({ hiddenAt: null })
      .where(eq(schema.backlog.id, game.id));
    const after = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 2,
      limit: 1,
    });
    expect(after.page).toBe(1);
    expect(after.total).toBe(1);
    expect(after.items[0]?.type).toBe('import');
  });
  it('rende accessibili anche i giochi oltre il precedente limite di 100', async () => {
    const games = await db
      .insert(schema.games)
      .values(
        Array.from({ length: 101 }, (_, i) => ({
          name: `Hidden ${i}`,
          slug: `hidden-${i}`,
        })),
      )
      .returning({ id: schema.games.id });
    await db
      .insert(schema.backlog)
      .values(
        games.map((game) => ({ userId, gameId: game.id, hiddenAt: date(1) })),
      );
    const result = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 5,
      limit: 25,
    });
    expect(result.total).toBe(101);
    expect(result.page).toBe(5);
    expect(result.items).toHaveLength(1);
    const first = await hiddenPage(userId, {
      kind: 'unwanted',
      page: 1,
      limit: 25,
    });
    expect(first.items.map((x) => x.entry.id)).not.toContain(
      result.items[0]!.entry.id,
    );
  });
});
