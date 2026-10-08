import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  createUser,
  linkSteamAccount as seedAccount,
  linkStoreAccount,
} from '../../test/factories';
import { fetchSteamPersonaName } from '../external/steam';
import {
  beginSteamQrLogin,
  type SteamLogin,
  SteamQrTimeoutError,
  SteamWebTokenError,
} from '../external/steam-auth';
import { decryptCredentials, resetStoreTokenKey } from '../lib/crypto';
import { enqueueImport } from '../queue/imports';
import {
  removeSteamLogin,
  startSteamLogin,
  steamLoginStatus,
} from './steam-login';
import {
  linkSteamLogin,
  linkSteamWebToken,
  listStoreAccounts,
  StoreAccountMismatchError,
  steamAccessToken,
} from './store-accounts';

// Il confine è `steam-auth`, che è l'unico a parlare con `steam-session`: qui si
// finge il QR, e si guarda cosa il server ne fa — lo stato che racconta, la riga
// che scrive, l'import che accoda.
vi.mock('../external/steam-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/steam-auth')>()),
  beginSteamQrLogin: vi.fn(),
}));
vi.mock('../external/steam', () => ({
  resolveSteamId: vi.fn(),
  fetchSteamPersonaName: vi.fn(),
}));
vi.mock('../queue/imports', () => ({
  isImportRunning: vi.fn(),
  enqueueImport: vi.fn(),
}));

const mockedBegin = vi.mocked(beginSteamQrLogin);
const mockedPersona = vi.mocked(fetchSteamPersonaName);
const mockedEnqueue = vi.mocked(enqueueImport);

const STEAM_ID = '76561190000000042';

const login = (steamId = STEAM_ID): SteamLogin => ({
  steamId,
  credentials: {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 88_000_000,
    refreshExpiresAt: Date.now() + 200 * 86_400_000,
  },
});

/** Un QR finto: lo si fa scansionare, confermare o scadere a comando. */
function fakeQr() {
  let resolve!: (value: SteamLogin) => void;
  let reject!: (error: unknown) => void;
  const result = new Promise<SteamLogin>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  let onScanned: () => void = () => {};
  const cancel = vi.fn();

  mockedBegin.mockImplementationOnce(async (callback) => {
    onScanned = callback;
    return { qrUrl: 'https://s.team/q/1/abc', result, cancel };
  });

  return { resolve, reject, cancel, scan: () => onScanned() };
}

const accountsOf = (userId: string) =>
  db
    .select()
    .from(schema.storeAccounts)
    .where(eq(schema.storeAccounts.userId, userId));

describe('login Steam col QR', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedPersona.mockResolvedValue('sanvisimo');
    mockedEnqueue.mockResolvedValue(undefined as never);
  });

  it('apre la sessione e rende il QR, già disegnato', async () => {
    fakeQr();

    const started = await startSteamLogin(userId);

    expect(started.qrUrl).toBe('https://s.team/q/1/abc');
    expect(started.qrImage).toMatch(/^data:image\/png;base64,/);
    expect(steamLoginStatus(userId, started.loginId)).toEqual({
      status: 'waiting',
      accountId: null,
      reason: null,
    });
  });

  it("dice «inquadrato» prima della conferma, e alla conferma scrive l'account e accoda l'import", async () => {
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId, { label: 'principale' });

    qr.scan();
    expect(steamLoginStatus(userId, loginId).status).toBe('scanned');

    qr.resolve(login());
    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('done'),
    );

    const [account] = await accountsOf(userId);
    expect(account).toMatchObject({
      store: 'steam',
      externalAccountId: STEAM_ID,
      displayName: 'sanvisimo',
      label: 'principale',
      status: 'ok',
    });
    expect(
      decryptCredentials<{ refreshToken: string }>(account!.credentials!),
    ).toMatchObject({ refreshToken: 'refresh' });
    expect(steamLoginStatus(userId, loginId).accountId).toBe(account!.id);
    // Collegare e importare sono la stessa azione, come per gli altri negozi.
    expect(mockedEnqueue).toHaveBeenCalledWith('steam', {
      storeAccountId: account!.id,
    });
  });

  it("su un account che c'era col solo profilo aggiunge la credenziale alla stessa riga", async () => {
    const profilo = await seedAccount(userId, STEAM_ID);
    expect(profilo.credentials).toBeNull();
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId);

    qr.resolve(login());
    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('done'),
    );

    // Una riga sola: lo SteamID64 è la chiave, e i possessi che puntano a lei
    // restano dove sono — nessun gioco doppio.
    const righe = await accountsOf(userId);
    expect(righe).toHaveLength(1);
    expect(righe[0]!.id).toBe(profilo.id);
    expect(righe[0]!.credentials).not.toBeNull();
  });

  it('un login fatto con un altro account non tocca niente, e lo dice', async () => {
    const atteso = await seedAccount(userId, '76561190000000001');
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId, { relinking: atteso });

    // L'app Steam sul telefono è collegata a un altro account.
    qr.resolve(login(STEAM_ID));
    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('failed'),
    );

    expect(steamLoginStatus(userId, loginId).reason).toBe('wrong_account');
    const righe = await accountsOf(userId);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ id: atteso.id, credentials: null });
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it('un QR non confermato in tempo scade', async () => {
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId);

    qr.reject(new SteamQrTimeoutError());

    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('expired'),
    );
    expect(await accountsOf(userId)).toHaveLength(0);
  });

  it("un rifiuto nell'app è un fallimento", async () => {
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId);

    qr.reject(new Error('rifiutato'));

    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('failed'),
    );
    expect(steamLoginStatus(userId, loginId).reason).toBeNull();
  });

  it('una seconda sessione annulla la prima, e la prima non scrive più niente', async () => {
    const primo = fakeQr();
    const { loginId: primoId } = await startSteamLogin(userId);
    fakeQr();

    await startSteamLogin(userId);

    // Una sola sessione attiva per utente: senza, chi apre e chiude il dialogo
    // lascia un QR vivo per ogni volta.
    expect(primo.cancel).toHaveBeenCalledOnce();
    expect(steamLoginStatus(userId, primoId).status).toBe('expired');

    // Anche se la prima, per una corsa, si risolvesse comunque.
    primo.resolve(login());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await accountsOf(userId)).toHaveLength(0);
  });

  it('non rivela le sessioni degli altri: sono «scadute» come quelle che non ci sono', async () => {
    const altro = await createUser();
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId);
    qr.resolve(login());
    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('done'),
    );

    const expired = {
      status: 'expired',
      accountId: null,
      reason: null,
    };
    expect(steamLoginStatus(altro, loginId)).toEqual(expired);
    expect(
      steamLoginStatus(userId, '00000000-0000-4000-8000-000000000000'),
    ).toEqual(expired);
  });

  it('un import che non si riesce ad accodare non rovescia un login riuscito', async () => {
    mockedEnqueue.mockRejectedValue(new Error('Redis giù'));
    const qr = fakeQr();
    const { loginId } = await startSteamLogin(userId);

    qr.resolve(login());

    await vi.waitFor(() =>
      expect(steamLoginStatus(userId, loginId).status).toBe('done'),
    );
    expect(await accountsOf(userId)).toHaveLength(1);
  });

  it('se Steam non apre la sessione non resta niente da ricordare', async () => {
    mockedBegin.mockRejectedValueOnce(new Error('Steam non risponde'));

    await expect(startSteamLogin(userId)).rejects.toThrow('Steam non risponde');
  });
});

describe('togliere il solo login', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
  });

  /** Un account col login, una copia della famiglia e una comprata. */
  async function withFamily() {
    const account = await seedAccount(userId, STEAM_ID);
    await db
      .update(schema.storeAccounts)
      .set({
        credentials: Buffer.from('credenziale'),
        credentialsExpireAt: new Date(),
      })
      .where(eq(schema.storeAccounts.id, account.id));

    const copia = async (
      subscription: 'steam_family' | null,
      over: { rating?: number } = {},
    ) => {
      const game = await createGame();
      const [entry] = await db
        .insert(schema.backlog)
        .values({ userId, gameId: game.id, rating: over.rating ?? null })
        .returning({ id: schema.backlog.id });
      await db.insert(schema.ownerships).values({
        backlogId: entry!.id,
        platformSlug: 'pc_windows',
        store: 'steam',
        storeAccountId: account.id,
        subscription,
      });
      return entry!.id;
    };

    return {
      account,
      soloFamiglia: await copia('steam_family'),
      conVoto: await copia('steam_family', { rating: 4.5 }),
      comprata: await copia(null),
    };
  }

  it('toglie la credenziale e le copie della famiglia, e lascia i giochi propri', async () => {
    const { account, soloFamiglia, conVoto, comprata } = await withFamily();

    const risultato = await removeSteamLogin(userId, account.id);

    // Quella con un voto resta: una riga di backlog senza un possesso non è uno
    // stato legittimo, e il voto non sparisce perché cambia il modo di collegare.
    expect(risultato).toEqual({ removed: 1, kept: 1 });
    const [riga] = await accountsOf(userId);
    expect(riga).toMatchObject({
      credentials: null,
      credentialsExpireAt: null,
      status: 'ok',
    });
    const rimasti = (
      await db.select({ id: schema.backlog.id }).from(schema.backlog)
    ).map((entry) => entry.id);
    expect(rimasti).toContain(comprata);
    expect(rimasti).toContain(conVoto);
    expect(rimasti).not.toContain(soloFamiglia);
  });

  it('è idempotente: richiamarla finisce il lavoro senza rifarlo', async () => {
    const { account } = await withFamily();

    await removeSteamLogin(userId, account.id);
    const secondo = await removeSteamLogin(userId, account.id);

    expect(secondo).toEqual({ removed: 0, kept: 1 });
  });

  it('un account che aveva bisogno di ricollegarsi torna a posto: col solo profilo non ha niente da ricollegare', async () => {
    const { account } = await withFamily();
    await db
      .update(schema.storeAccounts)
      .set({ status: 'needs_reauth' })
      .where(eq(schema.storeAccounts.id, account.id));

    await removeSteamLogin(userId, account.id);

    expect((await accountsOf(userId))[0]!.status).toBe('ok');
  });

  it("non è l'account di un altro, né di un altro negozio, né uno scollegato", async () => {
    const { account } = await withFamily();
    const altro = await createUser();
    const gog = await linkStoreAccount(userId, 'gog');
    const scollegato = await seedAccount(userId, '76561190000000007');
    await db
      .update(schema.storeAccounts)
      .set({ status: 'unlinked' })
      .where(eq(schema.storeAccounts.id, scollegato.id));

    expect(await removeSteamLogin(altro, account.id)).toBeNull();
    expect(await removeSteamLogin(userId, gog.id)).toBeNull();
    expect(await removeSteamLogin(userId, scollegato.id)).toBeNull();
    // E non ha toccato quello dell'utente.
    expect(
      (await accountsOf(userId)).find((a) => a.id === account.id),
    ).toMatchObject({ credentials: expect.anything() });
  });
});

// --- Una sola sessione per account, e il token web incollato ---
//
// Il 07/10/2026 tre QR in sei minuti hanno fatto bloccare l'account: ogni QR
// confermato è un «Galaxy S25» nuovo in Steam Guard. Qui si controlla che non
// se ne apra un altro per distrazione, e che l'altro modo — il token del browser —
// non ne crei nessuno.

/** Un token web come lo dà la pagina dello store: JWT con lo SteamID in `sub`. */
const webToken = (
  steamId = STEAM_ID,
  expiresInMs = 86_000_000,
  aud: string[] = ['web', 'mobile'],
) =>
  [
    'intestazione',
    Buffer.from(
      JSON.stringify({
        sub: steamId,
        aud,
        exp: Math.floor((Date.now() + expiresInMs) / 1000),
      }),
    ).toString('base64url'),
    'firma',
  ].join('.');

describe('aprire un QR con un login già presente', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedPersona.mockResolvedValue('sanvisimo');
    mockedBegin.mockClear();
  });

  it('si apre sempre: un secondo account va collegabile, e rifare lo stesso non ha avvisi', async () => {
    const primo = await linkSteamLogin(userId, login('76561190000000001'));
    fakeQr();

    // Un altro account Steam: nessun login suo, il QR parte.
    await startSteamLogin(userId);
    // Lo stesso account che ha già il login: parte lo stesso.
    await startSteamLogin(userId, { relinking: primo });

    expect(mockedBegin).toHaveBeenCalledTimes(2);
  });
});

describe('collegare Steam col token web', () => {
  let userId: string;

  beforeEach(async () => {
    process.env.STORE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    resetStoreTokenKey();
    userId = await createUser();
    mockedPersona.mockResolvedValue('sanvisimo');
  });

  it('scrive la riga senza refresh token, con lo SteamID del token', async () => {
    const token = webToken();

    const account = await linkSteamWebToken(userId, token, { label: 'casa' });

    const [riga] = await accountsOf(userId);
    expect(riga).toMatchObject({
      id: account.id,
      store: 'steam',
      externalAccountId: STEAM_ID,
      displayName: 'sanvisimo',
      label: 'casa',
      status: 'ok',
    });
    const credenziale = decryptCredentials<Record<string, unknown>>(
      riga!.credentials!,
    );
    expect(credenziale).toMatchObject({ accessToken: token });
    // È il punto: nessun refresh token, nessuna sessione che il server possa
    // rinnovare da solo.
    expect(credenziale).not.toHaveProperty('refreshToken');
  });

  it('sostituisce un login QR sulla stessa riga: scegliere l’altro modo è una scelta', async () => {
    const qr = await linkSteamLogin(userId, login());

    await linkSteamWebToken(userId, webToken());

    const righe = await accountsOf(userId);
    expect(righe).toHaveLength(1);
    expect(righe[0]!.id).toBe(qr.id);
    expect(
      decryptCredentials<Record<string, unknown>>(righe[0]!.credentials!),
    ).not.toHaveProperty('refreshToken');
  });

  it('su un ricollegamento di un altro account non tocca niente', async () => {
    const atteso = await seedAccount(userId, '76561190000000001');

    await expect(
      linkSteamWebToken(userId, webToken(STEAM_ID), { relinking: atteso }),
    ).rejects.toThrow(StoreAccountMismatchError);

    expect((await accountsOf(userId))[0]).toMatchObject({ credentials: null });
  });

  it('un token che non va non scrive niente', async () => {
    await expect(linkSteamWebToken(userId, 'spazzatura')).rejects.toThrow(
      SteamWebTokenError,
    );
    await expect(
      linkSteamWebToken(userId, webToken(STEAM_ID, -1000)),
    ).rejects.toThrow(SteamWebTokenError);
    await expect(
      linkSteamWebToken(userId, webToken(STEAM_ID, 86_000_000, ['renew'])),
    ).rejects.toThrow(SteamWebTokenError);

    expect(await accountsOf(userId)).toHaveLength(0);
  });

  it('rende il token finché vale e poi nulla: non si rinnova', async () => {
    const valido = await linkSteamWebToken(userId, webToken());
    const [riga] = await accountsOf(userId);

    expect(await steamAccessToken(riga!)).toMatchObject({
      accessToken: expect.stringContaining('.'),
      renewable: false,
    });

    // Passano le 24 ore: nessun refresh token da cui ripartire.
    const credenziale = decryptCredentials<{ accessToken: string }>(
      riga!.credentials!,
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 90_000_000);
    try {
      expect(await steamAccessToken(riga!)).toEqual({
        accessToken: null,
        renewable: false,
      });
    } finally {
      vi.useRealTimers();
    }
    expect(credenziale.accessToken).toContain('.');
    expect(valido.id).toBe(riga!.id);
    // E non è un account da ricollegare.
    expect((await accountsOf(userId))[0]!.status).toBe('ok');
  });

  it('l’elenco dice che tipo di login è, e quando scade il token', async () => {
    const solo = await seedAccount(userId, '76561190000000001');
    await linkSteamWebToken(userId, webToken(STEAM_ID));
    await linkSteamLogin(userId, login('76561190000000002'));

    const elenco = await listStoreAccounts(userId);
    const byId = new Map(elenco.map((a) => [a.externalAccountId, a]));

    expect(byId.get(solo.externalAccountId)).toMatchObject({
      hasLogin: false,
      loginKind: null,
      loginExpiresAt: null,
    });
    expect(byId.get(STEAM_ID)).toMatchObject({
      hasLogin: true,
      loginKind: 'token',
      loginExpiresAt: expect.any(Date),
    });
    expect(byId.get('76561190000000002')).toMatchObject({
      hasLogin: true,
      loginKind: 'qr',
      loginExpiresAt: null,
    });
  });
});
