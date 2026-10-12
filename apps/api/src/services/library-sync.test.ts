import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser, linkStoreAccount } from '../../test/factories';
import { enqueueImport, enqueueWishlistImport } from '../queue/imports';
import {
  enqueueDueImports,
  enqueueDueWishlistImports,
  findAccountsDueForImport,
  findAccountsDueForWishlist,
} from './library-sync';
import { updateUserSettings } from './user-settings';

vi.mock('../queue/imports', () => ({
  enqueueImport: vi.fn(),
  enqueueWishlistImport: vi.fn(),
}));
const mockedEnqueue = vi.mocked(enqueueImport);
const mockedWishlistEnqueue = vi.mocked(enqueueWishlistImport);

const NOW = new Date('2026-09-18T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

async function account(
  userId: string,
  store: 'steam' | 'gog' | 'psn' | 'amazon',
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

/** Un account con la sua lista di negozio, come la lascia il primo import. */
async function withList(
  userId: string,
  store: 'steam' | 'gog' | 'psn' | 'amazon',
  over: Partial<typeof schema.storeAccounts.$inferInsert> = {},
) {
  const id = await account(userId, store, over);
  await db.insert(schema.playlists).values({
    userId,
    kind: 'store_wishlist',
    name: `${store} · ${id}`,
    query: null,
    storeAccountId: id,
  });
  return id;
}

describe('findAccountsDueForWishlist', () => {
  let userId: string;
  const dueWishlist = async () =>
    (await findAccountsDueForWishlist(NOW)).map((row) => row.id).sort();

  beforeEach(async () => {
    userId = await createUser();
  });

  it('prende solo gli account che hanno già la lista: senza, l’utente non l’ha chiesta', async () => {
    const con = await withList(userId, 'steam', {
      wishlistSyncedAt: daysAgo(8),
    });
    await account(userId, 'steam', { wishlistSyncedAt: daysAgo(8) });
    await account(userId, 'gog');

    expect(await dueWishlist()).toEqual([con]);
  });

  it('una lista cancellata non si ricrea da sola', async () => {
    const id = await withList(userId, 'gog', { wishlistSyncedAt: daysAgo(30) });
    expect(await dueWishlist()).toEqual([id]);

    await db
      .delete(schema.playlists)
      .where(eq(schema.playlists.storeAccountId, id));

    expect(await dueWishlist()).toEqual([]);
  });

  it('usa la data della wishlist e la soglia del negozio, non quelle della libreria', async () => {
    // Libreria appena importata, wishlist vecchia: è dovuta.
    const vecchia = await withList(userId, 'steam', {
      lastSyncAt: daysAgo(0),
      wishlistSyncedAt: daysAgo(8),
    });
    // Libreria vecchia, wishlist fresca: no.
    await withList(userId, 'gog', {
      lastSyncAt: daysAgo(20),
      wishlistSyncedAt: daysAgo(1),
    });
    // PSN a tre giorni, Steam a sette.
    const psn = await withList(userId, 'psn', { wishlistSyncedAt: daysAgo(4) });
    await withList(userId, 'steam', { wishlistSyncedAt: daysAgo(4) });

    expect(await dueWishlist()).toEqual([vecchia, psn].sort());
  });

  it('una lista senza data (nata prima della colonna) è dovuta', async () => {
    const id = await withList(userId, 'steam');
    expect(await dueWishlist()).toEqual([id]);
  });

  it('non riprova gli errori che aspettano l’utente, sì quelli di rete', async () => {
    await withList(userId, 'steam', {
      wishlistSyncedAt: daysAgo(30),
      wishlistError: 'not_visible',
    });
    await withList(userId, 'gog', {
      wishlistSyncedAt: daysAgo(30),
      wishlistError: 'reauth',
    });
    const rete = await withList(userId, 'psn', {
      wishlistSyncedAt: daysAgo(30),
      wishlistError: 'failed',
    });

    expect(await dueWishlist()).toEqual([rete]);
  });

  it('salta da ricollegare, scollegati, interruttore dell’account e quello generale', async () => {
    const old = { wishlistSyncedAt: daysAgo(30) };
    await withList(userId, 'psn', { ...old, status: 'needs_reauth' });
    await withList(userId, 'steam', { ...old, status: 'unlinked' });
    await withList(userId, 'steam', { ...old, autoSync: false });
    const acceso = await withList(userId, 'gog', old);
    expect(await dueWishlist()).toEqual([acceso]);

    await updateUserSettings(userId, { autoSyncLibrary: false });
    expect(await dueWishlist()).toEqual([]);
  });

  it('un negozio senza wishlist non c’è, anche se avesse una lista', async () => {
    await withList(userId, 'amazon', { wishlistSyncedAt: daysAgo(30) });
    expect(await dueWishlist()).toEqual([]);
  });
});

describe('enqueueDueWishlistImports', () => {
  beforeEach(() => mockedWishlistEnqueue.mockReset());

  it('accoda un job della wishlist per ogni account dovuto, e non tocca la libreria', async () => {
    const userId = await createUser();
    const id = await withList(userId, 'psn', { wishlistSyncedAt: daysAgo(5) });
    await withList(userId, 'steam', { wishlistSyncedAt: daysAgo(1) });

    await expect(enqueueDueWishlistImports(NOW)).resolves.toBe(1);
    expect(mockedWishlistEnqueue).toHaveBeenCalledExactlyOnceWith('psn', {
      storeAccountId: id,
    });
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});
