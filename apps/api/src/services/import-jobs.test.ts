import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser, linkStoreAccount } from '../../test/factories';
import { SteamWishlistNotVisibleError } from '../external/steam';
import { findLinkedAccount, runWishlistImportJob } from './import-jobs';
import { StoreReauthRequiredError } from './store-accounts';
import { importStoreWishlist } from './store-wishlist';

// Il confine è `importStoreWishlist`, già provato per conto suo: qui si prova
// cosa il job decide di fare con la sua risposta o col suo errore.
vi.mock('./store-wishlist', () => ({ importStoreWishlist: vi.fn() }));

const mockedImport = vi.mocked(importStoreWishlist);

const report = {
  total: 3,
  inList: 2,
  unresolved: 1,
  resolvedByName: 1,
  newGames: 0,
  listId: '00000000-0000-4000-8000-000000000001',
};

describe('findLinkedAccount', () => {
  it('rende la riga com’è adesso nel DB', async () => {
    const account = await linkStoreAccount(await createUser(), 'gog');
    await db
      .update(schema.storeAccounts)
      .set({ displayName: 'cambiato dopo l’accodamento' })
      .where(eq(schema.storeAccounts.id, account.id));

    const found = await findLinkedAccount(account.id);

    expect(found.displayName).toBe('cambiato dopo l’accodamento');
  });

  it('un account scollegato o inesistente non si riprova', async () => {
    const account = await linkStoreAccount(await createUser(), 'gog');
    await db
      .update(schema.storeAccounts)
      .set({ status: 'unlinked' })
      .where(eq(schema.storeAccounts.id, account.id));

    await expect(findLinkedAccount(account.id)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await expect(
      findLinkedAccount('00000000-0000-4000-8000-0000000000ff'),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('runWishlistImportJob', () => {
  beforeEach(() => {
    // Con le graffe: un `beforeEach` che rende una funzione la fa girare a fine
    // test come pulizia, e il mock lancerebbe l'errore del caso appena finito.
    mockedImport.mockReset();
  });

  it('importa la wishlist dell’account riletto e rende il resoconto', async () => {
    const account = await linkStoreAccount(await createUser(), 'psn');
    mockedImport.mockResolvedValue(report);

    await expect(runWishlistImportJob(account.id)).resolves.toBe(report);

    expect(mockedImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: account.id, store: 'psn' }),
    );
  });

  const stateOf = async (id: string) =>
    (
      await db
        .select({
          at: schema.storeAccounts.wishlistSyncedAt,
          error: schema.storeAccounts.wishlistError,
        })
        .from(schema.storeAccounts)
        .where(eq(schema.storeAccounts.id, id))
    )[0]!;

  it('scrive sull’account quando è finita, e azzera un errore di prima', async () => {
    const account = await linkStoreAccount(await createUser(), 'gog');
    await db
      .update(schema.storeAccounts)
      .set({ wishlistError: 'failed' })
      .where(eq(schema.storeAccounts.id, account.id));
    mockedImport.mockResolvedValue(report);

    await runWishlistImportJob(account.id);

    const state = await stateOf(account.id);
    expect(state.error).toBeNull();
    expect(state.at).toBeInstanceOf(Date);
  });

  it.each([
    ['un login da rifare', new StoreReauthRequiredError('gog'), 'reauth'],
    [
      'una wishlist Steam non visibile',
      new SteamWishlistNotVisibleError('76561198000000000'),
      'not_visible',
    ],
    ['una rete che cade', new Error('ECONNRESET'), 'failed'],
  ] as const)(
    '%s: l’account ricorda perché, e l’ultimo riuscito resta',
    async (_nome, error, code) => {
      const account = await linkStoreAccount(await createUser(), 'gog');
      const before = new Date('2026-10-01T10:00:00Z');
      await db
        .update(schema.storeAccounts)
        .set({ wishlistSyncedAt: before })
        .where(eq(schema.storeAccounts.id, account.id));
      mockedImport.mockImplementation(async () => {
        throw error;
      });

      await runWishlistImportJob(account.id).catch(() => undefined);

      expect(await stateOf(account.id)).toEqual({ at: before, error: code });
    },
  );

  it('su un account scollegato non importa niente, e non si riprova', async () => {
    const account = await linkStoreAccount(await createUser(), 'gog');
    await db
      .update(schema.storeAccounts)
      .set({ status: 'unlinked' })
      .where(eq(schema.storeAccounts.id, account.id));

    await expect(runWishlistImportJob(account.id)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(mockedImport).not.toHaveBeenCalled();
  });

  it.each([
    ['un login da rifare', new StoreReauthRequiredError('gog')],
    [
      'una wishlist Steam non visibile',
      new SteamWishlistNotVisibleError('76561198000000000'),
    ],
  ])('%s non si riprova: il job fallisce subito', async (_nome, error) => {
    const account = await linkStoreAccount(await createUser(), 'gog');
    mockedImport.mockImplementation(async () => {
      throw error;
    });

    // Il messaggio resta quello che dice all'utente cosa fare.
    await expect(runWishlistImportJob(account.id)).rejects.toSatisfy(
      (failure: unknown) =>
        failure instanceof UnrecoverableError &&
        failure.message === error.message,
    );
  });

  it('un errore qualunque passa com’è: è una rete che cade, e si riprova', async () => {
    const account = await linkStoreAccount(await createUser(), 'gog');
    const caduta = new Error('ECONNRESET');
    mockedImport.mockImplementation(async () => {
      throw caduta;
    });

    await expect(runWishlistImportJob(account.id)).rejects.toBe(caduta);
  });
});
