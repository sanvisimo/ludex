import { call, os as plain } from '@orpc/server';
import { auth } from '@repo/auth';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it } from 'vitest';

import { admin, authed, type RpcContext } from './context';

// Una procedura qualunque dietro i due middleware: il contratto `admin.*` lo
// riempiono i passi successivi, qui interessa solo chi passa.
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
