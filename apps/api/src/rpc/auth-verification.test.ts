import { auth } from '@repo/auth';
import { describe, expect, it } from 'vitest';

// La verifica dell'email (rilascio). Senza Cloudflare Access davanti è lei che
// tiene fuori chi si registra con l'indirizzo di un altro: se un cambio di
// configurazione la spegnesse, qui se ne accorge.

describe('verifica dell’email', () => {
  it('la registrazione non apre una sessione', async () => {
    const { token } = await auth.api.signUpEmail({
      body: {
        email: 'nuovo@esempio.test',
        password: 'password-di-prova',
        name: 'Nuovo',
      },
    });
    expect(token).toBeNull();
  });

  it('senza email verificata non si entra', async () => {
    await auth.api.signUpEmail({
      body: {
        email: 'nuovo@esempio.test',
        password: 'password-di-prova',
        name: 'Nuovo',
      },
    });
    await expect(
      auth.api.signInEmail({
        body: { email: 'nuovo@esempio.test', password: 'password-di-prova' },
      }),
    ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });
  });
});
