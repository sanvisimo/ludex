import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser, linkStoreAccount } from '../../test/factories';
import {
  EaAuthError,
  type EaLibraryEntry,
  fetchEaLibrary,
} from '../external/ea';
import {
  findIgdbGamesByExternalIds,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import { encryptCredentials, resetStoreTokenKey } from '../lib/crypto';
import { EaTokenExpiredError, importEaLibrary } from './ea-import';

// Contro un Postgres vero; EA e IGDB stubbati al confine del modulo, come per
// gli altri negozi.

vi.mock('../external/ea', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/ea')>()),
  fetchEaLibrary: vi.fn(),
}));
vi.mock('../external/igdb', () => ({
  findIgdbGameById: vi.fn(),
  findIgdbGamesByExternalIds: vi.fn(),
  findIgdbGamesBySource: vi.fn(),
  searchIgdbGames: vi.fn(),
  igdbSourceFor: vi.fn(),
}));
vi.mock('../queue/enrichment', () => ({
  enqueueEnrichment: vi.fn(),
  enqueuePostImport: vi.fn(),
}));

const mockedLibrary = vi.mocked(fetchEaLibrary);
const mockedSearch = vi.mocked(searchIgdbGames);

const HOUR = 60 * 60 * 1000;

const entry = (over: Partial<EaLibraryEntry> & { externalId: string }) => ({
  name: over.externalId,
  releaseYear: null,
  acquiredAt: null,
  subscription: null,
  imageUrl: null,
  playtimeMinutes: null,
  lastPlayedAt: null,
  ...over,
});

const hit = (igdbId: number, name: string) => ({
  igdbId,
  name,
  releaseYear: null,
  developer: null,
  cover: null,
  gameType: null,
  totalRatingCount: null,
  platformIds: [],
});

async function eaAccount(userId: string, expiresAt: number | null) {
  const account = await linkStoreAccount(userId, 'ea', '2292938939');
  // Null: un account il cui token l'import precedente ha già cancellato.
  if (expiresAt === null) return account;

  const [riga] = await db
    .update(schema.storeAccounts)
    .set({
      credentials: encryptCredentials({
        accessToken: 'QVQxOjIuMDoz',
        expiresAt,
      }),
      credentialsExpireAt: new Date(expiresAt),
    })
    .where(eq(schema.storeAccounts.id, account.id))
    .returning();
  return riga!;
}

const rileggi = async (id: string) =>
  (
    await db
      .select()
      .from(schema.storeAccounts)
      .where(eq(schema.storeAccounts.id, id))
  )[0]!;

describe('importEaLibrary', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    vi.mocked(findIgdbGamesByExternalIds).mockResolvedValue(new Map());
    // IGDB non ha una sorgente EA: tutto per nome.
    vi.mocked(igdbSourceFor).mockReturnValue(null);
    mockedSearch.mockResolvedValue([]);
  });

  it('scrive copie EA su PC, con abbonamento e ore, e poi dimentica il token', async () => {
    const account = await eaAccount(userId, Date.now() + 4 * HOUR);
    mockedLibrary.mockResolvedValue([
      entry({
        externalId: 'dragon-age-origins',
        name: 'Dragon Age™: Origins',
        acquiredAt: new Date('2009-11-19T00:00:00Z'),
        playtimeMinutes: 122,
        lastPlayedAt: new Date('2024-01-03T16:58:16Z'),
      }),
      entry({
        externalId: 'star-wars-squadrons',
        name: 'STAR WARS™: Squadrons',
        subscription: 'ea_play',
      }),
    ]);
    mockedSearch.mockImplementation(async (term) =>
      term.startsWith('dragon')
        ? [hit(76, 'Dragon Age: Origins')]
        : [hit(119_171, 'Star Wars: Squadrons')],
    );

    const report = await importEaLibrary(account);

    expect(report).toMatchObject({ total: 2, resolved: 2 });
    expect(mockedLibrary).toHaveBeenCalledWith('QVQxOjIuMDoz');

    const copie = await db
      .select({
        name: schema.games.name,
        store: schema.ownerships.store,
        platform: schema.ownerships.platformSlug,
        subscription: schema.ownerships.subscription,
        minutes: schema.ownerships.playtimeMinutes,
        storeAccountId: schema.ownerships.storeAccountId,
      })
      .from(schema.ownerships)
      .innerJoin(
        schema.backlog,
        eq(schema.backlog.id, schema.ownerships.backlogId),
      )
      .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
      .where(eq(schema.backlog.userId, userId))
      .orderBy(schema.games.name);

    expect(copie).toEqual([
      {
        name: 'Dragon Age: Origins',
        store: 'ea',
        platform: 'pc_windows',
        subscription: null,
        minutes: 122,
        storeAccountId: account.id,
      },
      {
        name: 'Star Wars: Squadrons',
        store: 'ea',
        platform: 'pc_windows',
        subscription: 'ea_play',
        minutes: null,
        storeAccountId: account.id,
      },
    ]);

    const riga = await rileggi(account.id);
    expect(riga.credentials).toBeNull();
    expect(riga.credentialsExpireAt).toBeNull();
    expect(riga.lastSyncAt).not.toBeNull();
    expect(riga.status).toBe('ok');
  });

  it('con il token scaduto non chiede niente a EA, e non mette l’account da ricollegare', async () => {
    const account = await eaAccount(userId, Date.now() - HOUR);

    await expect(importEaLibrary(account)).rejects.toBeInstanceOf(
      EaTokenExpiredError,
    );
    expect(mockedLibrary).not.toHaveBeenCalled();

    const riga = await rileggi(account.id);
    expect(riga.status).toBe('ok');
    expect(riga.credentials).toBeNull();
  });

  it('senza token (già usato) chiede di incollarne uno nuovo', async () => {
    const account = await eaAccount(userId, null);

    await expect(importEaLibrary(account)).rejects.toBeInstanceOf(
      EaTokenExpiredError,
    );
    expect(mockedLibrary).not.toHaveBeenCalled();
  });

  it('se EA rifiuta il token lo dimentica, senza toccare lo stato', async () => {
    const account = await eaAccount(userId, Date.now() + 4 * HOUR);
    mockedLibrary.mockRejectedValue(new EaAuthError('rifiutato'));

    await expect(importEaLibrary(account)).rejects.toBeInstanceOf(
      EaTokenExpiredError,
    );

    const riga = await rileggi(account.id);
    expect(riga.status).toBe('ok');
    expect(riga.credentials).toBeNull();
  });

  it('su un errore di rete tiene il token, perché BullMQ riprova', async () => {
    const account = await eaAccount(userId, Date.now() + 4 * HOUR);
    mockedLibrary.mockRejectedValue(new Error('ECONNRESET'));

    await expect(importEaLibrary(account)).rejects.toThrow('ECONNRESET');
    expect((await rileggi(account.id)).credentials).not.toBeNull();
  });
});
