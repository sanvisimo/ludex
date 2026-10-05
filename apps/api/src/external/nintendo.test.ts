import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStoreTokenKey } from '../lib/crypto';
import {
  exchangeNintendoCode,
  fetchNintendoPlayHistory,
  fetchNintendoProfile,
  fetchNintendoVgc,
  newNintendoState,
  NintendoAuthError,
  nintendoAccountId,
  nintendoCountry,
  nintendoLoginUrl,
  parseNintendoAuthCode,
  refreshNintendoTokens,
} from './nintendo';

// Nessuna rete e nessun database: si stubba `fetch`, che per questo modulo è il
// confine vero — non ha rate limiter né token in cache.

const CHIAVE = Buffer.alloc(32, 7).toString('base64');

beforeEach(() => {
  process.env.STORE_TOKEN_KEY = CHIAVE;
  resetStoreTokenKey();
});
afterEach(() => {
  resetStoreTokenKey();
  vi.unstubAllGlobals();
});

const jwt = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Stubba `fetch` con le risposte in fila, e ricorda le richieste. */
function stubFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('fetch chiamata più volte del previsto');
    return next;
  });
  vi.stubGlobal('fetch', mock);
  return calls;
}

describe('parseNintendoAuthCode', () => {
  const url =
    'npf5c38e31cd085304b://auth#session_token_code=eyJhbGci.payload.firma&state=abc-DEF_123&session_state=ff00';

  it("prende codice e state dall'indirizzo del link, intero", () => {
    expect(parseNintendoAuthCode(url)).toEqual({
      code: 'eyJhbGci.payload.firma',
      state: 'abc-DEF_123',
    });
  });

  it('non si lascia confondere da session_state, che contiene "state="', () => {
    expect(
      parseNintendoAuthCode(
        'npf5c38e31cd085304b://auth#session_token_code=c&session_state=sbagliato&state=giusto',
      )?.state,
    ).toBe('giusto');
  });

  it('rende null senza codice o senza state', () => {
    // Senza state il verifier non si ricalcola: il codice è inservibile.
    expect(parseNintendoAuthCode('npf://auth#session_token_code=c')).toBe(null);
    expect(parseNintendoAuthCode('npf://auth#state=s')).toBe(null);
    expect(parseNintendoAuthCode('')).toBe(null);
    expect(parseNintendoAuthCode('https://accounts.nintendo.com/')).toBe(null);
  });
});

describe('nintendoAccountId', () => {
  it("legge l'id dell'account dalla claim sub", () => {
    expect(nintendoAccountId(jwt({ sub: '3247fa748f1dd367' }))).toBe(
      '3247fa748f1dd367',
    );
  });

  it('rende vuoto su ciò che non è un JWT con un sub', () => {
    expect(nintendoAccountId(undefined)).toBe('');
    expect(nintendoAccountId('non-un-jwt')).toBe('');
    expect(nintendoAccountId(jwt({ nickname: 'x' }))).toBe('');
    expect(nintendoAccountId('a.%%%.b')).toBe('');
  });
});

describe('nintendoLoginUrl', () => {
  const challengeOf = (url: string) =>
    new URL(url).searchParams.get('session_token_code_challenge');

  it("porta lo state, il client dell'app e la sfida PKCE S256", () => {
    const state = newNintendoState();
    const url = new URL(nintendoLoginUrl('utente-1', state));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.nintendo.com/connect/1.0.0/authorize',
    );
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('client_id')).toBe('5c38e31cd085304b');
    expect(url.searchParams.get('response_type')).toBe('session_token_code');
    expect(url.searchParams.get('session_token_code_challenge_method')).toBe(
      'S256',
    );
  });

  it('la sfida dipende da utente e state, e sempre allo stesso modo', () => {
    // Senza stato sul server: il verifier si ricalcola al collegamento.
    expect(challengeOf(nintendoLoginUrl('u1', 's1'))).toBe(
      challengeOf(nintendoLoginUrl('u1', 's1')),
    );
    expect(challengeOf(nintendoLoginUrl('u1', 's1'))).not.toBe(
      challengeOf(nintendoLoginUrl('u2', 's1')),
    );
    expect(challengeOf(nintendoLoginUrl('u1', 's1'))).not.toBe(
      challengeOf(nintendoLoginUrl('u1', 's2')),
    );
  });

  it('ogni apertura ha uno state nuovo', () => {
    expect(newNintendoState()).not.toBe(newNintendoState());
  });
});

describe('exchangeNintendoCode', () => {
  const idToken = jwt({ sub: '3247fa748f1dd367' });

  it('manda a Nintendo il verifier della sfida che il login aveva, e tiene il session token', async () => {
    const state = 'stato-di-prova';
    const calls = stubFetch(
      json({ session_token: 'SESSIONE' }),
      json({ access_token: 'ACCESSO', id_token: idToken, expires_in: 900 }),
    );

    const credentials = await exchangeNintendoCode('utente-1', 'CODICE', state);

    // Il punto della derivazione: SHA-256 del verifier mandato = sfida del login.
    const verifier = new URLSearchParams(
      calls[0]!.init.body as URLSearchParams,
    ).get('session_token_code_verifier')!;
    const sfida = new URL(nintendoLoginUrl('utente-1', state)).searchParams.get(
      'session_token_code_challenge',
    );
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      sfida,
    );
    expect(
      new URLSearchParams(calls[0]!.init.body as URLSearchParams).get(
        'session_token_code',
      ),
    ).toBe('CODICE');

    // L'access token si chiede con il session token, che resta il credenziale.
    expect(JSON.parse(calls[1]!.init.body as string)).toMatchObject({
      session_token: 'SESSIONE',
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    });
    expect(credentials).toMatchObject({
      accessToken: 'ACCESSO',
      refreshToken: 'SESSIONE',
      accountId: '3247fa748f1dd367',
    });
    // 900 s meno un minuto di margine.
    expect(credentials.expiresAt).toBeGreaterThan(Date.now() + 830_000);
    expect(credentials.expiresAt).toBeLessThan(Date.now() + 850_000);
  });

  it("si presenta con lo User-Agent dell'app, senza il quale il gateway rifiuta", async () => {
    const calls = stubFetch(
      json({ session_token: 'S' }),
      json({ access_token: 'A', id_token: idToken }),
    );
    await exchangeNintendoCode('u', 'c', 's');

    for (const call of calls) {
      expect(
        (call.init.headers as Record<string, string>)['User-Agent'],
      ).toMatch(/^com\.nintendo\.znej\//);
    }
  });

  it("senza l'id dell'account nell'id_token non collega", async () => {
    stubFetch(
      json({ session_token: 'S' }),
      json({ access_token: 'A', id_token: jwt({}) }),
    );
    await expect(exchangeNintendoCode('u', 'c', 's')).rejects.toThrow(
      /id dell'account/,
    );
  });

  it('un codice scaduto o già speso è un rifiuto definitivo', async () => {
    stubFetch(json({ error: 'invalid_grant' }, 400));
    await expect(exchangeNintendoCode('u', 'c', 's')).rejects.toBeInstanceOf(
      NintendoAuthError,
    );
  });
});

describe('refreshNintendoTokens', () => {
  const idToken = jwt({ sub: '3247fa748f1dd367' });

  it('una POST sola, e il session token resta quello', async () => {
    const calls = stubFetch(
      json({ access_token: 'NUOVO', id_token: idToken, expires_in: 900 }),
    );

    const rinnovato = await refreshNintendoTokens('SESSIONE');

    expect(calls).toHaveLength(1);
    expect(rinnovato).toMatchObject({
      accessToken: 'NUOVO',
      refreshToken: 'SESSIONE',
    });
  });

  it('400 e 401 sono il «non vale più»: il collegamento è da rifare', async () => {
    stubFetch(json({}, 400));
    await expect(refreshNintendoTokens('S')).rejects.toBeInstanceOf(
      NintendoAuthError,
    );
    stubFetch(json({}, 401));
    await expect(refreshNintendoTokens('S')).rejects.toBeInstanceOf(
      NintendoAuthError,
    );
  });

  it("429, 403 e 5xx sono temporanei: non mandano l'utente a ricollegare", async () => {
    // Un account sano non deve finire in needs_reauth per un filtro davanti al
    // server o per un guasto: il job riprova.
    for (const status of [403, 429, 500, 503]) {
      stubFetch(json({}, status));
      const errore = await refreshNintendoTokens('S').catch((e: unknown) => e);
      expect(errore).toBeInstanceOf(Error);
      expect(errore).not.toBeInstanceOf(NintendoAuthError);
    }
  });
});

describe('fetchNintendoPlayHistory', () => {
  it('legge lo storico: id, nome, piattaforma, minuti e date', async () => {
    const calls = stubFetch(
      json({
        playHistories: [
          {
            titleId: '01007EF00011E000',
            titleName: 'The Legend of Zelda: Breath of the Wild',
            platform: 'HAC',
            totalPlayedMinutes: 14542,
            firstPlayedAt: '2023-09-24T10:00:00Z',
            lastPlayedAt: '2025-01-05T21:30:00Z',
          },
        ],
      }),
    );

    const titoli = await fetchNintendoPlayHistory('ACCESSO');

    expect(titoli).toEqual([
      {
        titleId: '01007EF00011E000',
        name: 'The Legend of Zelda: Breath of the Wild',
        platform: 'HAC',
        playtimeMinutes: 14542,
        firstPlayedAt: new Date('2023-09-24T10:00:00Z'),
        lastPlayedAt: new Date('2025-01-05T21:30:00Z'),
      },
    ]);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ACCESSO');
    expect(headers['Gentry-Locale']).toBe('en-GB');
  });

  it('salta le righe senza id o nome, e rende null ciò che non sa leggere', async () => {
    stubFetch(
      json({
        playHistories: [
          { titleName: 'Senza id' },
          { titleId: '0100000000000000' },
          { titleId: '0100000000000001', titleName: 'Ok', lastPlayedAt: 'boh' },
        ],
      }),
    );

    const titoli = await fetchNintendoPlayHistory('A');

    expect(titoli).toHaveLength(1);
    // Zero minuti non è «non so»: i minuti nulli non cancellano quelli che c'erano.
    expect(titoli[0]).toMatchObject({
      playtimeMinutes: null,
      lastPlayedAt: null,
      platform: null,
    });
  });

  it('una libreria vuota è vuota, non un errore', async () => {
    stubFetch(json({}));
    expect(await fetchNintendoPlayHistory('A')).toEqual([]);
  });

  it('un 401 è un token revocato mentre giravamo; il resto è un guasto', async () => {
    stubFetch(json({}, 401));
    await expect(fetchNintendoPlayHistory('A')).rejects.toBeInstanceOf(
      NintendoAuthError,
    );
    stubFetch(json({}, 500));
    const errore = await fetchNintendoPlayHistory('A').catch((e: unknown) => e);
    expect(errore).not.toBeInstanceOf(NintendoAuthError);
  });
});

describe('id_token: paese e id_token nel credenziale', () => {
  it('legge il paese dalla claim, se c’è ed è un codice a due lettere', () => {
    expect(nintendoCountry(jwt({ country: 'it' }))).toBe('IT');
    expect(nintendoCountry(jwt({ country: 'ITA' }))).toBe(null);
    expect(nintendoCountry(jwt({ sub: 'x' }))).toBe(null);
    expect(nintendoCountry(undefined)).toBe(null);
  });

  it('il credenziale porta l’id_token, e il paese solo se la claim lo dava', async () => {
    stubFetch(
      json({ session_token: 'S' }),
      json({ access_token: 'A', id_token: jwt({ sub: 'x' }) }),
    );
    const senza = await exchangeNintendoCode('u', 'c', 's');
    expect(senza.idToken).toBe(jwt({ sub: 'x' }));
    // Assente e non nullo: il rinnovo non deve azzerare il paese del profilo.
    expect(senza).not.toHaveProperty('country');

    stubFetch(
      json({ session_token: 'S' }),
      json({ access_token: 'A', id_token: jwt({ sub: 'x', country: 'IT' }) }),
    );
    expect((await exchangeNintendoCode('u', 'c', 's')).country).toBe('IT');
  });
});

describe('fetchNintendoProfile', () => {
  it('rende paese e nickname', async () => {
    const calls = stubFetch(json({ country: 'it', nickname: 'sanvisimo' }));

    expect(await fetchNintendoProfile('ACCESSO')).toEqual({
      country: 'IT',
      nickname: 'sanvisimo',
    });
    expect(
      (calls[0]!.init.headers as Record<string, string>).Authorization,
    ).toBe('Bearer ACCESSO');
  });

  it('non fa mai fallire il collegamento: rende null su qualunque guasto', async () => {
    stubFetch(json({}, 403));
    expect(await fetchNintendoProfile('A')).toBe(null);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('rete giù');
      }),
    );
    expect(await fetchNintendoProfile('A')).toBe(null);
  });

  it('un paese che non è un codice a due lettere non è un paese', async () => {
    stubFetch(json({ country: 'Italia', nickname: '' }));
    expect(await fetchNintendoProfile('A')).toEqual({
      country: null,
      nickname: null,
    });
  });
});

describe('fetchNintendoVgc', () => {
  const view = (over: Record<string, unknown> = {}) => ({
    applicationId: '01007EF00B094000',
    applicationName: 'FINAL FANTASY IX',
    apparentPlatform: 'NX',
    icon: { url: 'https://atum-img-lp1.cdn.nintendo.net/i/c/abc_${size}' },
    ownerNaId: '3247fa748f1dd367',
    userNaId: '3247fa748f1dd367',
    isLending: false,
    hasReleasedApplication: true,
    ...over,
  });
  const page = (views: unknown[], total = views.length) =>
    json({
      data: {
        account: { vgc: { vgcViews: { offsetInfo: { total }, views } } },
      },
    });

  it('manda il token dell’app al GraphQL del portale, con il client del portale', async () => {
    const calls = stubFetch(page([view()]));

    await fetchNintendoVgc('IDTOKEN', 'IT');

    expect(calls[0]!.url).toBe(
      'https://wb.lp1.savanna.srv.nintendo.net/graphql',
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-nintendo-savanna-client-id']).toMatch(/^[0-9a-f]{64}$/);
    // Il GraphQL è fatto per essere chiamato dal portale.
    expect(headers.origin).toBe('https://accounts.nintendo.com');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.variables).toMatchObject({
      idToken: 'IDTOKEN',
      country: 'IT',
      language: 'en',
      nasLanguage: 'en-US',
      shopId: 3,
      limit: 300,
      offset: 0,
    });
    // Il token non finisce altrove che nella variabile.
    expect(JSON.stringify(headers)).not.toContain('IDTOKEN');
  });

  it('legge le licenze: id in minuscolo, copertina a 512, e se c’è il gioco', async () => {
    stubFetch(
      page([
        view(),
        view({
          applicationId: '01007ef00011e000',
          applicationName: 'The Legend of Zelda: Breath of the Wild',
          hasReleasedApplication: false,
          hasReleasedAddOnContents: true,
        }),
      ]),
    );

    const carte = await fetchNintendoVgc('T', 'IT');

    expect(carte[0]).toEqual({
      applicationId: '01007ef00b094000',
      name: 'FINAL FANTASY IX',
      platform: 'NX',
      hasApplication: true,
      ownerNaId: '3247fa748f1dd367',
      userNaId: '3247fa748f1dd367',
      isLending: false,
      imageUrl: 'https://atum-img-lp1.cdn.nintendo.net/i/c/abc_512',
    });
    // Solo contenuti aggiuntivi: non è una copia del gioco.
    expect(carte[1]!.hasApplication).toBe(false);
  });

  it('pagina finché il totale non è coperto', async () => {
    const calls = stubFetch(
      page([view()], 301),
      page([view({ applicationId: '0100000000000002' })], 301),
    );

    const carte = await fetchNintendoVgc('T', 'IT');

    expect(carte).toHaveLength(2);
    expect(
      calls.map((c) => JSON.parse(c.init.body as string).variables.offset),
    ).toEqual([0, 300]);
  });

  it('un 401 è un token rifiutato; un guasto o un errore GraphQL no', async () => {
    stubFetch(json({}, 401));
    await expect(fetchNintendoVgc('T', 'IT')).rejects.toBeInstanceOf(
      NintendoAuthError,
    );

    stubFetch(json({}, 500));
    expect(
      await fetchNintendoVgc('T', 'IT').catch((e: unknown) => e),
    ).not.toBeInstanceOf(NintendoAuthError);

    // Un errore dentro un 200 è un guasto: l'import non deve degradare.
    stubFetch(json({ errors: [{ message: 'client sconosciuto' }] }));
    await expect(fetchNintendoVgc('T', 'IT')).rejects.toThrow(
      /client sconosciuto/,
    );

    stubFetch(json({ data: {} }));
    await expect(fetchNintendoVgc('T', 'IT')).rejects.toThrow(/incompleta/);
  });
});
