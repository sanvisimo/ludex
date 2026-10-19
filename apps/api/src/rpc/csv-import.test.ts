import { call, ORPCError } from '@orpc/server';
import { auth } from '@repo/auth';
import { describe, expect, it, vi } from 'vitest';

import { enqueueFileImport } from '../queue/imports';
import { router } from './router';

// La procedura col `File` vero, come lo manda il browser: il resto dell'import
// da CSV è in `services/csv-import.test.ts`.

vi.mock('../queue/imports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../queue/imports')>()),
  enqueueFileImport: vi.fn(),
  isImportRunning: vi.fn().mockResolvedValue(false),
}));

async function signedIn() {
  const { headers } = await auth.api.signUpEmail({
    body: {
      email: 'csv@esempio.test',
      password: 'password-di-prova',
      name: 'csv',
    },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { context: { headers: new Headers({ cookie }) } };
}

const csv = (testo: string) =>
  new File([testo], 'giochi.csv', { type: 'text/csv' });

describe('csvImport.upload', () => {
  it('legge il file e accoda un import per negozio', async () => {
    const report = await call(
      router.csvImport.upload,
      {
        file: csv('Name,Sources\nUNO,Ubisoft Connect\nBalatro,itch.io\n'),
        tag: 'Importato il 19/10/2026',
      },
      await signedIn(),
    );

    expect(report).toEqual({
      tagId: expect.any(String),
      queued: [{ store: 'ubisoft', entries: 1 }],
      alreadyRunning: [],
      noStore: { 'itch.io': 1 },
      noPlatform: 0,
    });
    expect(vi.mocked(enqueueFileImport)).toHaveBeenCalledWith(
      'ubisoft',
      expect.objectContaining({ tag: 'Importato il 19/10/2026' }),
    );
  });

  it('un file senza le colonne obbligatorie torna BAD_REQUEST con quali mancano', async () => {
    const errore = await call(
      router.csvImport.upload,
      { file: csv('Name,Genres\nUNO,Card\n'), tag: 'Importato il 19/10/2026' },
      await signedIn(),
    ).catch((error: unknown) => error);

    expect(errore).toBeInstanceOf(ORPCError);
    expect(errore).toMatchObject({
      code: 'BAD_REQUEST',
      data: { reason: 'missing_columns', missing: ['Sources'] },
    });
    expect(vi.mocked(enqueueFileImport)).not.toHaveBeenCalled();
  });
});
