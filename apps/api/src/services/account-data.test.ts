import { call } from '@orpc/server';
import { auth } from '@repo/auth';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it } from 'vitest';

import { createGame, linkStoreAccount } from '../../test/factories';
import { router } from '../rpc/router';
import { addToBacklog } from './backlog';

// Cancellazione ed esportazione dell'account (step 16). Utenti e sessioni sono
// veri, come in `admin-users.test.ts`: la password si pretende nell'hook di
// Better Auth, e un utente finto nel contesto non la eserciterebbe.

const PASSWORD = 'password-di-prova';

async function signUp(email: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: email.split('@')[0]! },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { userId: response.user.id, headers: new Headers({ cookie }) };
}

const makeAdmin = (userId: string) =>
  db
    .update(schema.user)
    .set({ role: 'admin' })
    .where(eq(schema.user.id, userId));

/** Un utente con un po' di tutto, per ogni tabella che porta il suo id. */
async function populate(userId: string, game?: { id: string }) {
  const account = await linkStoreAccount(userId, 'steam');
  await db
    .update(schema.storeAccounts)
    .set({ credentials: Buffer.from('segreto-del-negozio') })
    .where(eq(schema.storeAccounts.id, account.id));
  // Il gioco è di tutti: i due utenti dei test lo condividono.
  game ??= await createGame({ name: 'Hollow Knight', igdbId: 14593 });
  const entryId = await addToBacklog({
    userId,
    gameId: game.id,
    status: 'playing',
    ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
  });
  await db
    .update(schema.ownerships)
    .set({ storeAccountId: account.id, playtimeMinutes: 90 })
    .where(eq(schema.ownerships.backlogId, entryId));
  await db
    .update(schema.backlog)
    .set({ rating: 4.5, notes: 'Bellissimo' })
    .where(eq(schema.backlog.id, entryId));
  const [tag] = await db
    .insert(schema.userTags)
    .values({ userId, kind: 'tag', name: 'Da rigiocare' })
    .returning({ id: schema.userTags.id });
  await db
    .insert(schema.backlogTags)
    .values({ backlogId: entryId, tagId: tag!.id });
  await db.insert(schema.playlists).values({
    userId,
    name: 'Da rigiocare, in breve',
    query: {
      tags: [tag!.id],
      durationMax: 120,
      sort: 'addedAt',
      direction: 'desc',
    },
  });
  await db.insert(schema.ownershipRejections).values({
    backlogId: entryId,
    platformSlug: 'pc_windows',
    store: 'gog',
  });
  await db.insert(schema.unresolvedImports).values({
    userId,
    store: 'steam',
    storeAccountId: account.id,
    externalId: '999',
    name: 'Voce non risolta',
  });
  await db.insert(schema.gameReports).values({
    userId,
    gameId: game.id,
    store: 'steam',
    note: 'Sbagliato',
  });
  await db.insert(schema.userSettings).values({ userId });
  return { game };
}

/** Quante righe di ogni tabella per utente portano ancora il suo id. */
async function leftovers(userId: string) {
  const own = (rows: unknown[]) => rows.length;
  return {
    user: (
      await db.select().from(schema.user).where(eq(schema.user.id, userId))
    ).length,
    session: (
      await db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, userId))
    ).length,
    account: (
      await db
        .select()
        .from(schema.account)
        .where(eq(schema.account.userId, userId))
    ).length,
    backlog: own(
      await db
        .select()
        .from(schema.backlog)
        .where(eq(schema.backlog.userId, userId)),
    ),
    storeAccounts: own(
      await db
        .select()
        .from(schema.storeAccounts)
        .where(eq(schema.storeAccounts.userId, userId)),
    ),
    userTags: own(
      await db
        .select()
        .from(schema.userTags)
        .where(eq(schema.userTags.userId, userId)),
    ),
    playlists: own(
      await db
        .select()
        .from(schema.playlists)
        .where(eq(schema.playlists.userId, userId)),
    ),
    unresolved: own(
      await db
        .select()
        .from(schema.unresolvedImports)
        .where(eq(schema.unresolvedImports.userId, userId)),
    ),
    reports: own(
      await db
        .select()
        .from(schema.gameReports)
        .where(eq(schema.gameReports.userId, userId)),
    ),
    settings: (
      await db
        .select()
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, userId))
    ).length,
  };
}

const NONE = {
  user: 0,
  session: 0,
  account: 0,
  backlog: 0,
  storeAccounts: 0,
  userTags: 0,
  playlists: 0,
  unresolved: 0,
  reports: 0,
  settings: 0,
};

describe('cancellare l’account', () => {
  it('porta via tutto ciò che è suo e lascia i giochi e le decisioni degli admin', async () => {
    const mario = await signUp('mario@esempio.test');
    const luigi = await signUp('luigi@esempio.test');
    const boss = await signUp('boss@esempio.test');
    await makeAdmin(boss.userId);
    // Un secondo admin, o `boss` sarebbe l'ultimo e non si potrebbe cancellare.
    await makeAdmin((await signUp('capo@esempio.test')).userId);
    const { game } = await populate(mario.userId);
    await populate(luigi.userId, game);
    await db.insert(schema.globalHiddenImports).values({
      store: 'steam',
      externalId: '1',
      name: 'Dream Daddy',
      hiddenKind: 'app',
      decidedBy: boss.userId,
    });

    await auth.api.deleteUser({
      body: { password: PASSWORD },
      headers: boss.headers,
    });

    expect(await leftovers(boss.userId)).toEqual(NONE);
    // La regola dell'admin sopravvive a chi l'ha scritta.
    expect(await db.select().from(schema.globalHiddenImports)).toEqual([
      expect.objectContaining({ externalId: '1', decidedBy: null }),
    ]);

    await auth.api.deleteUser({
      body: { password: PASSWORD },
      headers: mario.headers,
    });

    expect(await leftovers(mario.userId)).toEqual(NONE);
    // I possessi e gli scarti di Mario non lasciano nulla in giro…
    expect(await db.select().from(schema.ownershipRejections)).toHaveLength(1);
    expect(await db.select().from(schema.ownerships)).toHaveLength(1);
    expect(await db.select().from(schema.backlogTags)).toHaveLength(1);
    // …quelli di Luigi sono al loro posto, e il gioco condiviso c'è ancora.
    expect((await leftovers(luigi.userId)).backlog).toBe(1);
    expect(
      await db.select().from(schema.games).where(eq(schema.games.id, game.id)),
    ).toHaveLength(1);
  });

  it('senza la password, o con una sbagliata, non cancella niente', async () => {
    const mario = await signUp('mario@esempio.test');
    await populate(mario.userId);

    await expect(
      auth.api.deleteUser({ body: {}, headers: mario.headers }),
    ).rejects.toMatchObject({ body: { code: 'PASSWORD_REQUIRED' } });
    await expect(
      auth.api.deleteUser({
        body: { password: 'sbagliata-sbagliata' },
        headers: mario.headers,
      }),
    ).rejects.toThrow();

    expect((await leftovers(mario.userId)).user).toBe(1);
    expect((await leftovers(mario.userId)).backlog).toBe(1);
  });

  it('l’ultimo admin non si cancella, uno dei due sì', async () => {
    const uno = await signUp('uno@esempio.test');
    await makeAdmin(uno.userId);

    await expect(
      auth.api.deleteUser({
        body: { password: PASSWORD },
        headers: uno.headers,
      }),
    ).rejects.toMatchObject({ body: { code: 'LAST_ADMIN' } });
    expect((await leftovers(uno.userId)).user).toBe(1);

    const due = await signUp('due@esempio.test');
    await makeAdmin(due.userId);
    await auth.api.deleteUser({
      body: { password: PASSWORD },
      headers: uno.headers,
    });

    expect((await leftovers(uno.userId)).user).toBe(0);
    expect((await leftovers(due.userId)).user).toBe(1);
  });
});

describe('esportare i dati', () => {
  it('rende ciò che è suo, senza token e senza i dati degli altri', async () => {
    const mario = await signUp('mario@esempio.test');
    const luigi = await signUp('luigi@esempio.test');
    const { game } = await populate(mario.userId);
    await populate(luigi.userId, game);
    await db
      .update(schema.storeAccounts)
      .set({ label: 'Account di famiglia' })
      .where(eq(schema.storeAccounts.userId, mario.userId));

    const data = await call(router.accountData.export, undefined, {
      context: { headers: mario.headers },
    });

    expect(data.profile).toMatchObject({
      name: 'mario',
      email: 'mario@esempio.test',
    });
    expect(data.library).toHaveLength(1);
    expect(data.library[0]).toMatchObject({
      game: { name: 'Hollow Knight', igdbId: 14593 },
      status: 'playing',
      rating: 4.5,
      notes: 'Bellissimo',
      tags: [{ kind: 'tag', name: 'Da rigiocare' }],
      ownerships: [
        {
          platform: 'pc_windows',
          store: 'steam',
          account: 'Account di famiglia',
          playtimeMinutes: 90,
        },
      ],
    });
    // I tag della playlist escono per nome: un id non dice niente fuori da qui.
    expect(data.playlists).toEqual([
      expect.objectContaining({
        name: 'Da rigiocare, in breve',
        query: expect.objectContaining({
          tags: ['Da rigiocare'],
          durationMax: 120,
        }),
      }),
    ]);
    expect(data.storeAccounts).toHaveLength(1);
    expect(data.unresolvedImports).toHaveLength(1);
    expect(data.reports).toHaveLength(1);
    expect(data.settings).toEqual({ autoSyncLibrary: true });

    // Nessun segreto in nessun punto del file, qualunque ne sia la chiave.
    const file = JSON.stringify(data);
    expect(file).not.toContain('credentials');
    expect(file).not.toContain('segreto-del-negozio');
    expect(file).not.toContain('luigi');
  });

  it('serve la sessione', async () => {
    await expect(
      call(router.accountData.export, undefined, {
        context: { headers: new Headers() },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
