import { db, schema } from '@repo/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { createUser } from '../../test/factories';
import { getUserSettings, updateUserSettings } from './user-settings';

describe('preferenze utente', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('senza riga rende i default, e non la crea', async () => {
    await expect(getUserSettings(userId)).resolves.toEqual({
      autoSyncLibrary: true,
    });
    expect(await db.select().from(schema.userSettings)).toHaveLength(0);
  });

  it('la prima modifica crea la riga, le successive la aggiornano', async () => {
    await expect(
      updateUserSettings(userId, { autoSyncLibrary: false }),
    ).resolves.toEqual({ autoSyncLibrary: false });
    await expect(
      updateUserSettings(userId, { autoSyncLibrary: true }),
    ).resolves.toEqual({ autoSyncLibrary: true });

    expect(await db.select().from(schema.userSettings)).toHaveLength(1);
  });

  it('una richiesta senza cambiamenti non scrive niente', async () => {
    await updateUserSettings(userId, { autoSyncLibrary: undefined });
    expect(await db.select().from(schema.userSettings)).toHaveLength(0);
  });
});
