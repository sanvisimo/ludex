import { call, os as plain } from '@orpc/server';
import { auth } from '@repo/auth';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it } from 'vitest';

import { admin, authed, type RpcContext } from './context';
import { router } from './router';

// Una procedura qualunque dietro i due middleware: qui interessa solo chi
// passa, non cosa fa. Le procedure vere sono nel blocco in fondo.
const soloAdmin = plain
  .$context<RpcContext>()
  .use(authed)
  .use(admin)
  .handler(() => 'ok');

/** Un utente vero, con la sua sessione: il middleware legge quella. */
async function signedIn(email: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: 'password-di-prova', name: 'Prova' },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { userId: response.user.id, headers: new Headers({ cookie }) };
}

describe('middleware admin', () => {
  it('respinge un utente senza ruolo', async () => {
    const { headers } = await signedIn('utente@esempio.test');

    await expect(
      call(soloAdmin, undefined, { context: { headers } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fa passare un admin', async () => {
    const { userId, headers } = await signedIn('admin@esempio.test');
    await db
      .update(schema.user)
      .set({ role: 'admin' })
      .where(eq(schema.user.id, userId));

    expect(await call(soloAdmin, undefined, { context: { headers } })).toBe(
      'ok',
    );
  });

  it('respinge chi non ha sessione prima ancora di guardare il ruolo', async () => {
    await expect(
      call(soloAdmin, undefined, { context: { headers: new Headers() } }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('le procedure admin.*', () => {
  // Una per una, con un input valido: se una procedura nuova dimentica
  // `.use(admin)`, è qui che si vede. Il web nasconde il link, ma la sicurezza
  // vera è questa.
  const gameId = '00000000-0000-4000-8000-000000000000';
  const casi = [
    ['missing.summary', router.admin.missing.summary, undefined],
    [
      'missing.list',
      router.admin.missing.list,
      { source: 'hltb', bucket: 'fixable' },
    ],
    ['sources.retry', router.admin.sources.retry, { gameId, source: 'hltb' }],
    [
      'sources.lookup',
      router.admin.sources.lookup,
      { gameId, source: 'hltb', externalId: '1' },
    ],
    [
      'sources.setExternalId',
      router.admin.sources.setExternalId,
      { gameId, source: 'hltb', externalId: '1' },
    ],
    ['reports.list', router.admin.reports.list, {}],
    [
      'reports.archive',
      router.admin.reports.archive,
      { gameId, target: { store: 'nintendo' } },
    ],
    ['games.unlinked', router.admin.games.unlinked, {}],
    ['games.linkIgdb', router.admin.games.linkIgdb, { gameId, igdbId: 1 }],
    ['games.detail', router.admin.games.detail, { slug: 'toki' }],
    [
      'links.repointPreview',
      router.admin.links.repointPreview,
      { linkId: gameId, igdbId: 1 },
    ],
    [
      'links.repoint',
      router.admin.links.repoint,
      { linkId: gameId, igdbId: 1 },
    ],
    ['unresolved.list', router.admin.unresolved.list, {}],
    [
      'unresolved.globalHidden',
      router.admin.unresolved.globalHidden,
      undefined,
    ],
    [
      'unresolved.resolve',
      router.admin.unresolved.resolve,
      { store: 'psn', externalId: 'x', igdbId: 1 },
    ],
    [
      'unresolved.hide',
      router.admin.unresolved.hide,
      { store: 'psn', externalId: 'x', kind: 'app' },
    ],
    [
      'unresolved.unhide',
      router.admin.unresolved.unhide,
      { store: 'psn', externalId: 'x' },
    ],
  ] as const;

  it.each(casi)('%s respinge chi non è admin', async (_, procedura, input) => {
    const { headers } = await signedIn('curioso@esempio.test');

    await expect(
      // Le procedure hanno input diversi, e qui interessa solo chi passa.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      call(procedura as any, input, { context: { headers } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('coprono tutto il gruppo', () => {
    const nomi = Object.entries(router.admin).flatMap(([gruppo, procedure]) =>
      Object.keys(procedure).map((nome) => `${gruppo}.${nome}`),
    );
    expect(nomi.sort()).toEqual(casi.map(([nome]) => nome).sort());
  });
});
