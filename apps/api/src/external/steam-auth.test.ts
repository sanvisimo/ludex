import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginSteamQrLogin,
  jwtExpiresAt,
  refreshSteamTokens,
  SteamAuthError,
  SteamQrTimeoutError,
} from './steam-auth';

// Il confine è `steam-session`: si finge lì, non su `fetch`. La libreria parla
// con Steam in protobuf, e rifarne il protocollo nel test vorrebbe dire testare
// il finto. Quello che qui conta è cosa facciamo di ciò che risponde.
//
// Una classe e non dei `vi.fn`: `mockReset` azzera le implementazioni fra un
// caso e l'altro, e un costruttore ridotto a `undefined` non si può più usare.

const fake = vi.hoisted(() => ({
  setterError: null as Error | null,
  renewError: null as (Error & { eresult?: number }) | null,
  /** Il refresh token nuovo, se Steam ne emette uno. */
  issued: null as string | null,
  access: '',
  // Il QR: gli ascoltatori che la libreria vera registrerebbe, e cosa risponde.
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  qrUrl: 'https://s.team/q/1/abc' as string | undefined,
  /** Il refresh token che il login ha dato, e che la libreria avrebbe messo sulla sessione. */
  loginRefresh: '',
  steamId: '76561190000000042',
  accessError: null as Error | null,
  cancelled: false,
  timeout: 0,
}));

vi.mock('steam-session', () => ({
  EAuthTokenPlatformType: { MobileApp: 3 },
  EResult: {
    InvalidPassword: 5,
    AccessDenied: 15,
    Timeout: 16,
    Revoked: 26,
    Expired: 27,
    5: 'InvalidPassword',
    15: 'AccessDenied',
    16: 'Timeout',
    26: 'Revoked',
    27: 'Expired',
  },
  LoginSession: class {
    accessToken = '';
    #refreshToken = '';

    loginTimeout = 0;
    steamID = { getSteamID64: () => fake.steamId };

    on(event: string, handler: (...args: unknown[]) => void) {
      fake.handlers[event] = handler;
      fake.timeout = this.loginTimeout;
      return this;
    }
    async startWithQR() {
      fake.timeout = this.loginTimeout;
      return { qrChallengeUrl: fake.qrUrl };
    }
    async refreshAccessToken() {
      if (fake.accessError) throw fake.accessError;
      this.accessToken = fake.access;
    }
    cancelLoginAttempt() {
      fake.cancelled = true;
    }

    get refreshToken() {
      return this.#refreshToken || fake.loginRefresh;
    }
    set refreshToken(token: string) {
      if (fake.setterError) throw fake.setterError;
      this.#refreshToken = token;
    }

    async renewRefreshToken() {
      if (fake.renewError) throw fake.renewError;
      this.accessToken = fake.access;
      if (!fake.issued) return false;
      this.#refreshToken = fake.issued;
      return true;
    }
  },
}));

const jwt = (expSeconds: number) =>
  [
    'intestazione',
    Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url'),
    'firma',
  ].join('.');

const refused = (eresult?: number) =>
  Object.assign(new Error('Steam'), eresult === undefined ? {} : { eresult });

describe('refreshSteamTokens', () => {
  beforeEach(() => {
    fake.setterError = null;
    fake.renewError = null;
    fake.issued = null;
    fake.access = jwt(2_000);
  });

  it('rende un access token nuovo e tiene il refresh token se Steam non ne emette', async () => {
    const refreshToken = jwt(9_000);

    const credentials = await refreshSteamTokens(refreshToken);

    expect(credentials).toEqual({
      accessToken: fake.access,
      refreshToken,
      expiresAt: 2_000_000,
      refreshExpiresAt: 9_000_000,
    });
  });

  it('prende il refresh token nuovo quando Steam lo emette', async () => {
    // Il vecchio muore subito: quello che questa funzione rende è quello da
    // tenere, e `storeAccessToken` lo riscrive prima di usarlo.
    fake.issued = jwt(20_000);

    const credentials = await refreshSteamTokens(jwt(9_000));

    expect(credentials.refreshToken).toBe(fake.issued);
    expect(credentials.refreshExpiresAt).toBe(20_000_000);
  });

  it.each([
    ['AccessDenied', 15],
    ['Expired', 27],
    ['Revoked', 26],
    ['InvalidPassword', 5],
  ])(
    'un rifiuto di Steam (%s) è un errore di autenticazione',
    async (name, code) => {
      fake.renewError = refused(code);

      await expect(refreshSteamTokens(jwt(9_000))).rejects.toThrow(
        SteamAuthError,
      );
      await expect(refreshSteamTokens(jwt(9_000))).rejects.toThrow(name);
    },
  );

  it('una rete che cade o Steam in affanno non lo sono: il job deve riprovare', async () => {
    // Un `Timeout` ha il suo eresult ma non è un rifiuto, e un errore di rete
    // non ne ha affatto. In nessuno dei due casi l'utente deve rifare il QR.
    fake.renewError = refused(16);
    const timeout = await refreshSteamTokens(jwt(9_000)).catch((e) => e);
    expect(timeout).not.toBeInstanceOf(SteamAuthError);

    fake.renewError = refused();
    const rete = await refreshSteamTokens(jwt(9_000)).catch((e) => e);
    expect(rete).not.toBeInstanceOf(SteamAuthError);
    expect(rete.message).toBe('Steam');
  });

  it('un credenziale che non è un refresh token Steam è un errore di autenticazione', async () => {
    // Il setter di `steam-session` lo rifiuta con un errore senza eresult: non è
    // la rete, e riprovare darebbe lo stesso risultato.
    fake.setterError = new Error('Not a valid Steam token');

    await expect(refreshSteamTokens('spazzatura')).rejects.toThrow(
      SteamAuthError,
    );
  });
});

describe('jwtExpiresAt', () => {
  it('rende la scadenza in millisecondi', () => {
    expect(jwtExpiresAt(jwt(1_800_000_000))).toBe(1_800_000_000_000);
  });
});

describe('beginSteamQrLogin', () => {
  beforeEach(() => {
    fake.handlers = {};
    fake.qrUrl = 'https://s.team/q/1/abc';
    fake.loginRefresh = jwt(9_000);
    fake.access = jwt(2_000);
    fake.accessError = null;
    fake.cancelled = false;
    fake.timeout = 0;
  });

  it("rende l'indirizzo del QR, e concede cinque minuti", async () => {
    const session = await beginSteamQrLogin(() => {});

    expect(session.qrUrl).toBe('https://s.team/q/1/abc');
    expect(fake.timeout).toBe(300_000);
  });

  it("avvisa quando l'utente ha inquadrato il QR, prima che confermi", async () => {
    const scanned = vi.fn();
    await beginSteamQrLogin(scanned);

    fake.handlers.remoteInteraction!();

    expect(scanned).toHaveBeenCalledOnce();
  });

  it('alla conferma rende lo SteamID e il credenziale, con le scadenze', async () => {
    const session = await beginSteamQrLogin(() => {});

    fake.handlers.authenticated!();

    await expect(session.result).resolves.toEqual({
      steamId: '76561190000000042',
      credentials: {
        accessToken: fake.access,
        refreshToken: fake.loginRefresh,
        expiresAt: 2_000_000,
        refreshExpiresAt: 9_000_000,
      },
    });
  });

  it('un QR non confermato in tempo è un errore a parte', async () => {
    const session = await beginSteamQrLogin(() => {});

    fake.handlers.timeout!();

    await expect(session.result).rejects.toThrow(SteamQrTimeoutError);
  });

  it('un rifiuto di Steam o dell’utente rifiuta il risultato', async () => {
    const session = await beginSteamQrLogin(() => {});

    fake.handlers.error!(new Error('rifiutato'));

    await expect(session.result).rejects.toThrow('rifiutato');
  });

  it("se l'access token non si ottiene il login non è riuscito", async () => {
    fake.accessError = new Error('Steam non risponde');
    const session = await beginSteamQrLogin(() => {});

    fake.handlers.authenticated!();

    await expect(session.result).rejects.toThrow('Steam non risponde');
  });

  it('senza un QR da mostrare non si parte', async () => {
    fake.qrUrl = undefined;

    await expect(beginSteamQrLogin(() => {})).rejects.toThrow(
      'Steam non ha restituito il QR',
    );
  });

  it("annullare abbandona l'attesa sui server di Steam", async () => {
    const session = await beginSteamQrLogin(() => {});

    session.cancel();

    expect(fake.cancelled).toBe(true);
  });
});
