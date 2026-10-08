import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginSteamQrLogin,
  jwtExpiresAt,
  parseSteamWebToken,
  refreshSteamTokens,
  SteamAuthError,
  SteamQrTimeoutError,
  SteamWebTokenError,
  STEAM_LOGIN_USER_AGENT,
} from './steam-auth';

// Il confine è `steam-session`: si finge lì, non su `fetch`. La libreria parla
// con Steam in protobuf, e rifarne il protocollo nel test vorrebbe dire testare
// il finto. Quello che qui conta è cosa facciamo di ciò che risponde.
//
// Una classe e non dei `vi.fn`: `mockReset` azzera le implementazioni fra un
// caso e l'altro, e un costruttore ridotto a `undefined` non si può più usare.

const fake = vi.hoisted(() => ({
  setterError: null as Error | null,
  cookiesError: null as (Error & { eresult?: number }) | null,
  /** I cookie che `getWebCookies()` rende; vuoti = quelli con `access`. */
  cookies: null as string[] | null,
  access: '',
  /** Con quali opzioni e piattaforma è stata creata la sessione. */
  platform: 0,
  options: undefined as { userAgent?: string } | undefined,
  /** Se la libreria è stata usata per rinnovare, cosa il web non ammette. */
  renewCalls: 0,
  // Il QR: gli ascoltatori che la libreria vera registrerebbe, e cosa risponde.
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  qrUrl: 'https://s.team/q/1/abc' as string | undefined,
  /** Il refresh token che il login ha dato, e che la libreria avrebbe messo sulla sessione. */
  loginRefresh: '',
  steamId: '76561190000000042',
  cancelled: false,
  timeout: 0,
}));

vi.mock('steam-session', () => ({
  EAuthTokenPlatformType: { MobileApp: 3, WebBrowser: 1 },
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
    #refreshToken = '';

    loginTimeout = 0;

    constructor(platform: number, options?: { userAgent?: string }) {
      fake.platform = platform;
      fake.options = options;
    }

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
    async getWebCookies() {
      if (fake.cookiesError) throw fake.cookiesError;
      return fake.cookies ?? [loginSecure(fake.access)];
    }
    async refreshAccessToken() {
      fake.renewCalls++;
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
      fake.renewCalls++;
    }
  },
}));

/** Il cookie `steamLoginSecure` come lo rende la libreria: `SteamID||token`, codificato. */
const loginSecure = (token: string, domain = 'store.steampowered.com') =>
  `steamLoginSecure=${encodeURIComponent(`76561190000000042||${token}`)}; Path=/; Secure; Domain=${domain}`;

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
    fake.cookiesError = null;
    fake.cookies = null;
    fake.renewCalls = 0;
    fake.access = jwt(2_000);
  });

  it('rende un access token nuovo dai cookie web e tiene lo stesso refresh token', async () => {
    const refreshToken = jwt(9_000);

    const credentials = await refreshSteamTokens(refreshToken);

    expect(credentials).toEqual({
      accessToken: fake.access,
      refreshToken,
      expiresAt: 2_000_000,
      refreshExpiresAt: 9_000_000,
    });
  });

  it('è un browser: piattaforma web, user agent nostro, nessun rinnovo da server', async () => {
    await refreshSteamTokens(jwt(9_000));

    expect(fake.platform).toBe(1);
    expect(fake.options?.userAgent).toBe(STEAM_LOGIN_USER_AGENT);
    expect(fake.renewCalls).toBe(0);
  });

  it('fra più cookie preferisce quello dello store', async () => {
    const store = jwt(2_000);
    fake.cookies = [
      loginSecure(jwt(3_000), 'steamcommunity.com'),
      loginSecure(store),
      'sessionid=abc; Domain=store.steampowered.com',
    ];

    expect((await refreshSteamTokens(jwt(9_000))).accessToken).toBe(store);
  });

  it('senza un cookie di accesso non è il credenziale a essere morto: il job riprova', async () => {
    fake.cookies = ['sessionid=abc; Domain=store.steampowered.com'];
    const senza = await refreshSteamTokens(jwt(9_000)).catch((e) => e);
    expect(senza).not.toBeInstanceOf(SteamAuthError);
    expect(senza.message).toBe('Steam non ha restituito un access token web');

    fake.cookies = [loginSecure('non-un-jwt')];
    const rotto = await refreshSteamTokens(jwt(9_000)).catch((e) => e);
    expect(rotto).not.toBeInstanceOf(SteamAuthError);
  });

  it.each([
    ['AccessDenied', 15],
    ['Expired', 27],
    ['Revoked', 26],
    ['InvalidPassword', 5],
  ])(
    'un rifiuto di Steam (%s) è un errore di autenticazione',
    async (name, code) => {
      fake.cookiesError = refused(code);

      await expect(refreshSteamTokens(jwt(9_000))).rejects.toThrow(
        SteamAuthError,
      );
      await expect(refreshSteamTokens(jwt(9_000))).rejects.toThrow(name);
    },
  );

  it('una rete che cade o Steam in affanno non lo sono: il job deve riprovare', async () => {
    // Un `Timeout` ha il suo eresult ma non è un rifiuto, e un errore di rete
    // non ne ha affatto. In nessuno dei due casi l'utente deve rifare il QR.
    fake.cookiesError = refused(16);
    const timeout = await refreshSteamTokens(jwt(9_000)).catch((e) => e);
    expect(timeout).not.toBeInstanceOf(SteamAuthError);

    fake.cookiesError = refused();
    const rete = await refreshSteamTokens(jwt(9_000)).catch((e) => e);
    expect(rete).not.toBeInstanceOf(SteamAuthError);
    expect(rete.message).toBe('Steam');
  });

  it('un credenziale che non è un refresh token web è un errore di autenticazione', async () => {
    // Il setter di `steam-session` lo rifiuta con un errore senza eresult: non è
    // la rete, e riprovare darebbe lo stesso risultato. Vale anche per il
    // refresh token `MobileApp` del vecchio login: l'audience non è `web`.
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
    fake.cookiesError = null;
    fake.cookies = null;
    fake.renewCalls = 0;
    fake.cancelled = false;
    fake.timeout = 0;
  });

  it('apre il QR come un browser, non come l’app del telefono', async () => {
    await beginSteamQrLogin(() => {});

    expect(fake.platform).toBe(1);
    expect(fake.options?.userAgent).toBe(STEAM_LOGIN_USER_AGENT);
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
    // Una richiesta di meno a Steam: il token sta già nei cookie.
    expect(fake.renewCalls).toBe(0);
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
    fake.cookiesError = new Error('Steam non risponde');
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

describe('parseSteamWebToken', () => {
  const NOW = Date.UTC(2026, 9, 7, 9, 0, 0);
  const STEAM_ID = '76561190000000042';

  const webToken = (claims: Record<string, unknown> = {}) =>
    [
      'intestazione',
      Buffer.from(
        JSON.stringify({
          sub: STEAM_ID,
          aud: ['web', 'mobile'],
          exp: NOW / 1000 + 86_000,
          ...claims,
        }),
      ).toString('base64url'),
      'firma',
    ].join('.');

  const reasonOf = (input: string) => {
    try {
      parseSteamWebToken(input, NOW);
    } catch (error) {
      return error instanceof SteamWebTokenError ? error.reason : error;
    }
    return null;
  };

  it('legge di chi è il token e quando scade, senza una richiesta', () => {
    const token = webToken();

    expect(parseSteamWebToken(token, NOW)).toEqual({
      steamId: STEAM_ID,
      credentials: { accessToken: token, expiresAt: NOW + 86_000_000 },
    });
  });

  it('accetta il JSON intero della pagina, il solo valore e il valore fra virgolette', () => {
    const token = webToken();
    const forme = [
      JSON.stringify({ data: { webapi_token: token, other: 1 } }),
      JSON.stringify({ webapi_token: token }),
      token,
      `"${token}"`,
      `  ${token}\n`,
    ];

    for (const forma of forme) {
      expect(parseSteamWebToken(forma, NOW).credentials.accessToken).toBe(
        token,
      );
    }
  });

  it('rifiuta ciò che non è un token', () => {
    expect(reasonOf('')).toBe('format');
    expect(reasonOf('spazzatura')).toBe('format');
    expect(reasonOf('{"data":{}}')).toBe('format');
    expect(reasonOf('{ non json')).toBe('format');
  });

  it('rifiuta un refresh token: è un credenziale che vale mesi e si rinnova', () => {
    expect(
      reasonOf(webToken({ aud: ['web', 'renew', 'derive', 'mobile'] })),
    ).toBe('wrong_kind');
  });

  it('rifiuta un token senza uno SteamID64', () => {
    expect(reasonOf(webToken({ sub: 'qualcuno' }))).toBe('wrong_kind');
    expect(reasonOf(webToken({ sub: undefined }))).toBe('wrong_kind');
  });

  it('rifiuta un token scaduto', () => {
    expect(reasonOf(webToken({ exp: NOW / 1000 - 1 }))).toBe('expired');
    expect(reasonOf(webToken({ exp: undefined }))).toBe('expired');
  });
});
