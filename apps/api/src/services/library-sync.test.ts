import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser, linkStoreAccount } from '../../test/factories';
import { enqueueImport } from '../queue/imports';
import { enqueueDueImports, findAccountsDueForImport } from './library-sync';
import { updateUserSettings } from './user-settings';

vi.mock('../queue/imports', () => ({ enqueueImport: vi.fn() }));
const mockedEnqueue = vi.mocked(enqueueImport);

const NOW = new Date('2026-09-18T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

async function account(
  userId: string,
  store: 'steam' | 'psn' | 'amazon',
  over: Partial<typeof schema.storeAccounts.$inferInsert> = {},
) {
  const row = await linkStoreAccount(userId, store);
  if (Object.keys(over).length > 0) {
    await db
      .update(schema.storeAccounts)
      .set(over)
      .where(eq(schema.storeAccounts.id, row.id));
  }
  return row.id;
}

const dueIds = async () =>
  (await findAccountsDueForImport(NOW)).map((row) => row.id).sort();

describe('findAccountsDueForImport', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('prende un account mai importato', async () => {
    const id = await account(userId, 'steam');
    expect(await dueIds()).toEqual([id]);
  });

  it('usa la soglia del negozio: PSN a tre giorni, gli altri a sette', async () => {
    // Quattro giorni: dovuto su PSN, dove il refresh token dura dieci giorni,
    // e non ancora su Steam, dove è solo una questione di freschezza.
    const psn = await account(userId, 'psn', { lastSyncAt: daysAgo(4) });
    await account(userId, 'steam', { lastSyncAt: daysAgo(4) });
    const vecchio = await account(userId, 'amazon', { lastSyncAt: daysAgo(8) });
    await account(userId, 'psn', { lastSyncAt: daysAgo(1) });

    expect(await dueIds()).toEqual([psn, vecchio].sort());
  });

  it('salta gli account da ricollegare e quelli scollegati', async () => {
    // Riprovare non sblocca un `needs_reauth`: ogni giro sarebbe un job che
    // fallisce, per un account che l'utente deve comunque ricollegare a mano.
    await account(userId, 'psn', { status: 'needs_reauth' });
    await account(userId, 'amazon', { status: 'unlinked' });

    expect(await dueIds()).toEqual([]);
  });

  it("salta l'account con l'aggiornamento spento, e solo quello", async () => {
    // Il caso vero: un account Amazon su cui non si riscatta più niente.
    await account(userId, 'amazon', { autoSync: false });
    const acceso = await account(userId, 'amazon');

    expect(await dueIds()).toEqual([acceso]);
  });

  it("con l'interruttore generale spento non prende nessun account dell'utente", async () => {
    await account(userId, 'steam');
    await account(userId, 'psn');
    await updateUserSettings(userId, { autoSyncLibrary: false });

    const altro = await createUser();
    const suo = await account(altro, 'steam');

    // Gli account di un altro utente non c'entrano: la preferenza è per utente.
    expect(await dueIds()).toEqual([suo]);
  });

  it('senza una riga di preferenze vale il default, cioè acceso', async () => {
    // La tabella non ha una riga per ogni utente: la LEFT JOIN rende NULL, e
    // NULL deve valere acceso, non spento.
    const id = await account(userId, 'steam');
    expect(await db.select().from(schema.userSettings)).toHaveLength(0);
    expect(await dueIds()).toEqual([id]);
  });
});

describe('enqueueDueImports', () => {
  beforeEach(() => mockedEnqueue.mockReset());

  it('accoda un import per ogni account dovuto, col suo negozio', async () => {
    const userId = await createUser();
    const id = await account(userId, 'psn', { lastSyncAt: daysAgo(5) });
    await account(userId, 'steam', { lastSyncAt: daysAgo(1) });

    await expect(enqueueDueImports(NOW)).resolves.toBe(1);
    expect(mockedEnqueue).toHaveBeenCalledExactlyOnceWith('psn', {
      storeAccountId: id,
    });
  });
});
