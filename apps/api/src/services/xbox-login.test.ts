import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser, linkStoreAccount } from '../../test/factories';
import {
  openXboxSession,
  pollXboxDeviceCode,
  refreshXboxTokens,
  startXboxDeviceCode,
  XboxAccountError,
} from '../external/xbox';
import {
  decryptCredentials,
  encryptCredentials,
  resetStoreTokenKey,
} from '../lib/crypto';
import { enqueueImport, isImportRunning } from '../queue/imports';
import {
  listStoreAccounts,
  updateXboxSettings,
  type XboxStoredCredentials,
  xboxCredentials,
} from './store-accounts';
import { startXboxLogin, xboxLoginStatus } from './xbox-login';

// Il confine è `external/xbox`: qui si finge Microsoft — il codice, le
// interrogazioni, Xbox Live — e si guarda cosa il server ne fa: lo stato che
// racconta, la riga che scrive, l'import che accoda.
vi.mock('../external/xbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/xbox')>()),
  startXboxDeviceCode: vi.fn(),
  pollXboxDeviceCode: vi.fn(),
  openXboxSession: vi.fn(),
  refreshXboxTokens: vi.fn(),
}));
vi.mock('../queue/imports', () => ({
  isImportRunning: vi.fn(),
  enqueueImport: vi.fn(),
  isWishlistImportRunning: vi.fn(),
}));

const mockedStart = vi.mocked(startXboxDeviceCode);
const mockedPoll = vi.mocked(pollXboxDeviceCode);
const mockedSession = vi.mocked(openXboxSession);
const mockedEnqueue = vi.mocked(enqueueImport);

const SETTINGS = {
  platforms: ['xbox_series' as const],
  gamePassActive: false,
};

const credenziali = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
};

const accountsOf = (userId: string) =>
  db
    .select()
    .from(schema.storeAccounts)
    .where(eq(schema.storeAccounts.userId, userId));

describe('login Xbox col device code', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    mockedStart.mockImplementation(async () => ({
      deviceCode: 'dc',
      userCode: 'BTUR7YVL',
      verificationUri: 'https://www.microsoft.com/link',
      expiresAt: Date.now() + 900_000,
      intervalMs: 5000,
    }));
    mockedSession.mockResolvedValue({
      xuid: '2535400000000042',
      gamertag: 'Sanvisimo',
      live: 'l',
      store: 's',
    });
    mockedEnqueue.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rende il codice, e il device code non esce dal server', async () => {
    mockedPoll.mockResolvedValue({ status: 'pending' });
    const started = await startXboxLogin(userId, SETTINGS);

    expect(started).toMatchObject({
      userCode: 'BTUR7YVL',
      verificationUri: 'https://www.microsoft.com/link',
    });
    expect(JSON.stringify(started)).not.toContain('"dc"');
    expect(xboxLoginStatus(userId, started.loginId)).toEqual({
      status: 'waiting',
      accountId: null,
      reason: null,
    });
  });

  it("alla conferma scrive l'account con le scelte, e accoda l'import", async () => {
    mockedPoll
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'ok', credentials: credenziali });
    const { loginId } = await startXboxLogin(userId, SETTINGS, {
      label: 'casa',
    });

    await vi.advanceTimersByTimeAsync(10_000);
    // La riga si scrive sul database vero, fuori dai timer finti.
    await vi.waitFor(() =>
      expect(xboxLoginStatus(userId, loginId).status).toBe('done'),
    );
    const [account] = await accountsOf(userId);
    expect(account).toMatchObject({
      store: 'xbox',
      externalAccountId: '2535400000000042',
      displayName: 'Sanvisimo',
      label: 'casa',
      status: 'ok',
    });
    expect(
      decryptCredentials<XboxStoredCredentials>(account!.credentials!),
    ).toMatchObject({
      refreshToken: 'refresh',
      platforms: ['xbox_series'],
      gamePassActive: false,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith('xbox', {
      storeAccountId: account!.id,
    });
  });

  it('rallenta quando Microsoft lo chiede', async () => {
    mockedPoll
      .mockResolvedValueOnce({ status: 'slow_down' })
      .mockResolvedValue({ status: 'pending' });
    await startXboxLogin(userId, SETTINGS);

    await vi.advanceTimersByTimeAsync(5000);
    expect(mockedPoll).toHaveBeenCalledTimes(1);
    // Il prossimo giro è a 10 secondi, non a 5.
    await vi.advanceTimersByTimeAsync(9000);
    expect(mockedPoll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockedPoll).toHaveBeenCalledTimes(2);
  });

  it('«Nega» e un account senza profilo Xbox si dicono, e non scrivono niente', async () => {
    mockedPoll.mockResolvedValueOnce({ status: 'declined' });
    const negato = await startXboxLogin(userId, SETTINGS);
    await vi.advanceTimersByTimeAsync(5000);
    expect(xboxLoginStatus(userId, negato.loginId)).toMatchObject({
      status: 'failed',
      reason: 'declined',
    });

    mockedPoll.mockResolvedValueOnce({
      status: 'ok',
      credentials: credenziali,
    });
    mockedSession.mockRejectedValueOnce(
      new XboxAccountError('no_profile', 2148916233),
    );
    const senzaProfilo = await startXboxLogin(userId, SETTINGS);
    await vi.advanceTimersByTimeAsync(5000);
    expect(xboxLoginStatus(userId, senzaProfilo.loginId)).toMatchObject({
      status: 'failed',
      reason: 'no_profile',
    });
    expect(await accountsOf(userId)).toEqual([]);
  });

  it('su un ricollegamento, un altro account è `wrong_account`', async () => {
    const vecchio = await linkStoreAccount(userId, 'xbox', '999');
    mockedPoll.mockResolvedValueOnce({
      status: 'ok',
      credentials: credenziali,
    });
    const { loginId } = await startXboxLogin(userId, SETTINGS, {
      relinking: vecchio,
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(xboxLoginStatus(userId, loginId)).toMatchObject({
      status: 'failed',
      reason: 'wrong_account',
    });
    expect(await accountsOf(userId)).toHaveLength(1);
  });

  it('un secondo login ferma il primo, che smette di interrogare', async () => {
    mockedPoll.mockResolvedValue({ status: 'pending' });
    const primo = await startXboxLogin(userId, SETTINGS);
    await startXboxLogin(userId, SETTINGS);

    await vi.advanceTimersByTimeAsync(5000);
    // Uno solo: quello del secondo login.
    expect(mockedPoll).toHaveBeenCalledTimes(1);
    expect(xboxLoginStatus(userId, primo.loginId).status).toBe('expired');
  });

  it('il codice scaduto è `expired`, e il login di un altro non si vede', async () => {
    mockedPoll.mockResolvedValue({ status: 'pending' });
    const { loginId } = await startXboxLogin(userId, SETTINGS);
    await vi.advanceTimersByTimeAsync(905_000);

    expect(xboxLoginStatus(userId, loginId).status).toBe('expired');
    expect(xboxLoginStatus('altro', loginId).status).toBe('expired');
  });
});

describe('xboxCredentials', () => {
  it('rinnova, salva il refresh token nuovo e tiene le scelte', async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    const userId = await createUser();
    const scaduto: XboxStoredCredentials = {
      accessToken: 'vecchio',
      refreshToken: 'r1',
      expiresAt: Date.now() - 1000,
      platforms: ['pc_windows', 'xbox_one'],
      gamePassActive: true,
    };
    const [account] = await db
      .insert(schema.storeAccounts)
      .values({
        userId,
        store: 'xbox',
        externalAccountId: '42',
        credentials: encryptCredentials(scaduto),
      })
      .returning();
    vi.mocked(refreshXboxTokens).mockResolvedValue({
      accessToken: 'nuovo',
      refreshToken: 'r2',
      expiresAt: Date.now() + 3_600_000,
    });

    expect(await xboxCredentials(account!)).toMatchObject({
      accessToken: 'nuovo',
      refreshToken: 'r2',
      platforms: ['pc_windows', 'xbox_one'],
      gamePassActive: true,
    });
    expect(vi.mocked(refreshXboxTokens)).toHaveBeenCalledWith('r1');
  });
});

describe('le scelte di un account Xbox', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    const stored: XboxStoredCredentials = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      platforms: ['xbox_series'],
      gamePassActive: false,
    };
    const [row] = await db
      .insert(schema.storeAccounts)
      .values({
        userId,
        store: 'xbox',
        externalAccountId: '42',
        credentials: encryptCredentials(stored),
      })
      .returning();
    accountId = row!.id;
    vi.mocked(isImportRunning).mockResolvedValue(false);
    mockedEnqueue.mockResolvedValue(undefined as never);
  });

  it('la lista degli account le dice, e non dice il token', async () => {
    const [account] = await listStoreAccounts(userId);
    expect(account!.xbox).toEqual({
      platforms: ['xbox_series'],
      gamePassActive: false,
    });
    expect(JSON.stringify(account)).not.toContain('"r"');
  });

  it('cambiarle riscrive il credenziale, tiene il token e accoda l’import', async () => {
    expect(
      await updateXboxSettings(userId, accountId, {
        platforms: ['pc_windows', 'xbox_one'],
        gamePassActive: true,
      }),
    ).toBe('queued');

    const [row] = await accountsOf(userId);
    expect(
      decryptCredentials<XboxStoredCredentials>(row!.credentials!),
    ).toMatchObject({
      refreshToken: 'r',
      platforms: ['pc_windows', 'xbox_one'],
      gamePassActive: true,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith('xbox', {
      storeAccountId: accountId,
    });
  });

  it('con un import in corso o da ricollegare non scrive niente', async () => {
    vi.mocked(isImportRunning).mockResolvedValue(true);
    expect(
      await updateXboxSettings(userId, accountId, {
        platforms: ['pc_windows'],
        gamePassActive: true,
      }),
    ).toBe('running');

    await db
      .update(schema.storeAccounts)
      .set({ status: 'needs_reauth' })
      .where(eq(schema.storeAccounts.id, accountId));
    expect(
      await updateXboxSettings(userId, accountId, {
        platforms: ['pc_windows'],
        gamePassActive: true,
      }),
    ).toBe('needs_reauth');

    const [row] = await accountsOf(userId);
    expect(
      decryptCredentials<XboxStoredCredentials>(row!.credentials!).platforms,
    ).toEqual(['xbox_series']);
  });

  it('l’account di un altro non si tocca', async () => {
    expect(
      await updateXboxSettings('altro', accountId, {
        platforms: ['pc_windows'],
        gamePassActive: true,
      }),
    ).toBe('not_found');
  });
});
