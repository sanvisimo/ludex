import { call } from '@orpc/server';
import { auth } from '@repo/auth';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { describe, expect, it } from 'vitest';

import { createGame, linkStoreAccount } from '../../test/factories';
import { router } from './router';

// Ruolo, ban e sessioni passano dalle API del plugin `admin` di Better Auth:
// i test usano utenti e sessioni veri, non un utente finto nel contesto.

const PASSWORD = 'password-di-prova';

async function signUp(email: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: email.split('@')[0]! },
    returnHeaders: true,
  });
  return { userId: response.user.id, headers: cookieOf(headers) };
}

function cookieOf(headers: Headers) {
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return new Headers({ cookie });
}

/** Un admin, e qualcuno su cui agisce. */
async function adminETarget() {
  const admin = await signUp('admin@esempio.test');
  await db
    .update(schema.user)
    .set({ role: 'admin' })
    .where(eq(schema.user.id, admin.userId));
  const target = await signUp('mario@esempio.test');
  return { admin, target };
}

const asAdmin = (headers: Headers) => ({ context: { headers } });
const sessionOf = (headers: Headers) => auth.api.getSession({ headers });

describe('la sezione Utenti', () => {
  it('elenca gli utenti con quanti giochi e account hanno, e cerca per email', async () => {
    const { admin, target } = await adminETarget();
    await linkStoreAccount(target.userId, 'steam');
    const gioco = await createGame();
    await db
      .insert(schema.backlog)
      .values({ userId: target.userId, gameId: gioco.id });

    const { rows, total } = await call(
      router.admin.users.list,
      { q: 'mario' },
      asAdmin(admin.headers),
    );

    expect(total).toBe(1);
    expect(rows).toEqual([
      expect.objectContaining({
        email: 'mario@esempio.test',
        role: 'user',
        banned: false,
        games: 1,
        accounts: 1,
      }),
    ]);
  });

  it('dà e toglie il ruolo, ma il proprio non lo toglie', async () => {
    const { admin, target } = await adminETarget();

    await call(
      router.admin.users.setRole,
      { userId: target.userId, role: 'admin' },
      asAdmin(admin.headers),
    );
    const [riga] = await db
      .select({ role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, target.userId));
    expect(riga!.role).toBe('admin');

    await expect(
      call(
        router.admin.users.setRole,
        { userId: admin.userId, role: 'user' },
        asAdmin(admin.headers),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('il ban chiude le sessioni e impedisce di rientrare; tolto, si rientra', async () => {
    const { admin, target } = await adminETarget();

    await call(
      router.admin.users.ban,
      { userId: target.userId, reason: 'spam' },
      asAdmin(admin.headers),
    );

    expect(await sessionOf(target.headers)).toBeNull();
    await expect(
      auth.api.signInEmail({
        body: { email: 'mario@esempio.test', password: PASSWORD },
      }),
    ).rejects.toMatchObject({ body: { code: 'BANNED_USER' } });

    await call(
      router.admin.users.unban,
      { userId: target.userId },
      asAdmin(admin.headers),
    );
    await expect(
      auth.api.signInEmail({
        body: { email: 'mario@esempio.test', password: PASSWORD },
      }),
    ).resolves.toMatchObject({ user: { id: target.userId } });
  });

  it('un ban con scadenza la scrive', async () => {
    const { admin, target } = await adminETarget();

    await call(
      router.admin.users.ban,
      { userId: target.userId, expiresInDays: 7 },
      asAdmin(admin.headers),
    );

    const [riga] = await db
      .select({ banExpires: schema.user.banExpires })
      .from(schema.user)
      .where(eq(schema.user.id, target.userId));
    const giorni = (riga!.banExpires!.getTime() - Date.now()) / 86_400_000;
    expect(giorni).toBeGreaterThan(6.9);
    expect(giorni).toBeLessThan(7.1);
  });

  it('non si banna da solo, e lo dice in italiano', async () => {
    const { admin } = await adminETarget();

    await expect(
      call(
        router.admin.users.ban,
        { userId: admin.userId },
        asAdmin(admin.headers),
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Non puoi bannarti da solo',
    });
  });

  it('chiude le sessioni di un utente senza bannarlo', async () => {
    const { admin, target } = await adminETarget();

    await call(
      router.admin.users.revokeSessions,
      { userId: target.userId },
      asAdmin(admin.headers),
    );

    expect(await sessionOf(target.headers)).toBeNull();
    // L'admin resta dentro.
    expect(await sessionOf(admin.headers)).not.toBeNull();
  });
});
