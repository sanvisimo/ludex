import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  actionsOwned,
  classifyCollectionsItem,
  fetchXboxCatalog,
  fetchXboxCollections,
  fetchXboxMinutes,
  fetchXboxTitleHistory,
  findXboxBackcompatOwned,
  openXboxSession,
  pollXboxDeviceCode,
  productPlatforms,
  refreshXboxTokens,
  startXboxDeviceCode,
  XboxAccountError,
  XboxAuthError,
  type XboxPlayedTitle,
  type XboxSession,
} from './xbox';

// Nessuna rete e nessun database: si stubba `fetch`, che per questo modulo è il
// confine vero — non ha rate limiter né token in cache. Le risposte hanno la
// forma vista dal probe del 19/10/2026 (plans/9e-xbox.md).

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Stubba `fetch` con le risposte in fila, e ricorda le richieste. */
function stubFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error('fetch chiamata più volte del previsto');
      return next;
    }),
  );
  return calls;
}

const header = (init: RequestInit, name: string) =>
  (init.headers as Record<string, string> | undefined)?.[name];

const session: XboxSession = {
  xuid: '2535400000000000',
  gamertag: 'Sanvisimo',
  live: 'XBL3.0 x=uhs;live',
  store: 'XBL3.0 x=uhs;store',
};

describe('device code', () => {
  it('rende il codice da mostrare e tiene il device code', async () => {
    const calls = stubFetch(
      json({
        device_code: 'dc',
        user_code: 'BTUR7YVL',
        verification_uri: 'https://www.microsoft.com/link',
        expires_in: 900,
        interval: 5,
      }),
    );
    const code = await startXboxDeviceCode();
    expect(code).toMatchObject({
      deviceCode: 'dc',
      userCode: 'BTUR7YVL',
      verificationUri: 'https://www.microsoft.com/link',
      intervalMs: 5000,
    });
    const body = new URLSearchParams(calls[0]!.init.body as URLSearchParams);
    expect(body.get('client_id')).toBe('1f907974-e22b-4810-a9de-d9647380c97e');
    expect(body.get('scope')).toBe('XboxLive.signin offline_access');
  });

  it("traduce le risposte dell'interrogazione", async () => {
    stubFetch(
      json({ error: 'authorization_pending' }, 400),
      json({ error: 'slow_down' }, 400),
      json({ error: 'expired_token' }, 400),
      json({ error: 'authorization_declined' }, 400),
      json({ access_token: 'a', refresh_token: 'r', expires_in: 3599 }),
    );
    expect(await pollXboxDeviceCode('dc')).toEqual({ status: 'pending' });
    expect(await pollXboxDeviceCode('dc')).toEqual({ status: 'slow_down' });
    expect(await pollXboxDeviceCode('dc')).toEqual({ status: 'expired' });
    expect(await pollXboxDeviceCode('dc')).toEqual({ status: 'declined' });
    const ok = await pollXboxDeviceCode('dc');
    expect(ok.status).toBe('ok');
    expect(ok.status === 'ok' && ok.credentials.refreshToken).toBe('r');
  });

  it('un errore che non conosce alza, senza dire «rifiutato»', async () => {
    stubFetch(json({}, 503));
    await expect(pollXboxDeviceCode('dc')).rejects.not.toBeInstanceOf(
      XboxAuthError,
    );
  });
});

describe('refreshXboxTokens', () => {
  it('rende il refresh token nuovo: Microsoft lo ruota', async () => {
    stubFetch(
      json({ access_token: 'a2', refresh_token: 'r2', expires_in: 3599 }),
    );
    expect(await refreshXboxTokens('r1')).toMatchObject({
      accessToken: 'a2',
      refreshToken: 'r2',
    });
  });

  it('un errore OAuth è definitivo, un 5xx no', async () => {
    stubFetch(json({ error: 'invalid_grant' }, 400), json({}, 502));
    await expect(refreshXboxTokens('r')).rejects.toBeInstanceOf(XboxAuthError);
    await expect(refreshXboxTokens('r')).rejects.not.toBeInstanceOf(
      XboxAuthError,
    );
  });
});

describe('openXboxSession', () => {
  const xsts = (xid?: string) =>
    json({
      Token: `xsts-${xid ?? 'store'}`,
      DisplayClaims: { xui: [{ uhs: 'uhs', xid, gtg: 'Sanvisimo' }] },
    });

  it('user token con d=, poi i due XSTS', async () => {
    const calls = stubFetch(json({ Token: 'user' }), xsts('42'), xsts());
    const opened = await openXboxSession('access');
    expect(opened).toEqual({
      xuid: '42',
      gamertag: 'Sanvisimo',
      live: 'XBL3.0 x=uhs;xsts-42',
      store: 'XBL3.0 x=uhs;xsts-store',
    });
    expect(JSON.parse(calls[0]!.init.body as string).Properties.RpsTicket).toBe(
      'd=access',
    );
    expect(header(calls[1]!.init, 'User-Agent')).toBe(
      'XboxReplay; XboxLiveAuth/3.0',
    );
    expect(JSON.parse(calls[2]!.init.body as string).RelyingParty).toBe(
      'http://mp.microsoft.com/',
    );
  });

  it("un account senza profilo Xbox è un errore dell'account, non del token", async () => {
    stubFetch(json({ Token: 'user' }), json({ XErr: 2148916233 }, 401));
    const error = await openXboxSession('access').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(XboxAccountError);
    expect((error as XboxAccountError).reason).toBe('no_profile');
  });

  it('un token rifiutato da user.auth è da ricollegare', async () => {
    stubFetch(json({}, 401));
    await expect(openXboxSession('access')).rejects.toBeInstanceOf(
      XboxAuthError,
    );
  });
});

describe('Collections', () => {
  it('classifica le voci come Unifideck', () => {
    const game = {
      productId: '9NBLGGH18846',
      productKind: 'Game',
      status: 'Active',
    };
    expect(classifyCollectionsItem(game)).toBe('owned');
    expect(classifyCollectionsItem({ ...game, licensingRequired: true })).toBe(
      'gold',
    );
    expect(classifyCollectionsItem({ ...game, status: 'Revoked' })).toBe(
      'inactive',
    );
    expect(classifyCollectionsItem({ ...game, isTrial: true })).toBe('trial');
    expect(
      classifyCollectionsItem({ ...game, productId: 'CFQ7TTC0KHS0' }),
    ).toBe('pass');
    expect(
      classifyCollectionsItem({ ...game, productKind: 'Application' }),
    ).toBe('not_game');
  });

  it('segue il continuationToken e tiene solo posseduti e Gold', async () => {
    const calls = stubFetch(
      json({
        items: [
          {
            productId: 'c125w9bg2k0v',
            productKind: 'Game',
            status: 'Active',
            acquiredDate: '2020-01-17T10:00:00Z',
          },
          {
            productId: '9WZDNCRFJ255',
            productKind: 'Application',
            status: 'Active',
          },
        ],
        continuationToken: 'next',
      }),
      json({
        items: [
          {
            productId: 'BTKWG4P1Q2X5',
            productKind: 'Game',
            status: 'Active',
            licensingRequired: true,
          },
        ],
      }),
    );
    const owned = await fetchXboxCollections(session);
    expect(owned).toEqual([
      {
        productId: 'C125W9BG2K0V',
        kind: 'owned',
        acquiredAt: new Date('2020-01-17T10:00:00Z'),
      },
      { productId: 'BTKWG4P1Q2X5', kind: 'gold', acquiredAt: null },
    ]);
    expect(header(calls[0]!.init, 'MS-CV')).toMatch(/^[0-9A-F]{32}\.0$/);
    expect(JSON.parse(calls[1]!.init.body as string).continuationToken).toBe(
      'next',
    );
  });

  it('un 401 a metà è un token revocato', async () => {
    stubFetch(json({}, 401));
    await expect(fetchXboxCollections(session)).rejects.toBeInstanceOf(
      XboxAuthError,
    );
  });
});

describe('storico e ore', () => {
  it('tiene i Game, coi productId in maiuscolo', async () => {
    stubFetch(
      json({
        titles: [
          {
            titleId: '1144039928',
            name: 'Clair Obscur: Expedition 33',
            type: 'Game',
            devices: ['PC', 'XboxSeries'],
            detail: {
              availabilities: [
                { ProductId: '9ppt8k6gqhrz' },
                { ProductId: '9PPT8K6GQHRZ' },
              ],
            },
            titleHistory: { lastTimePlayed: '2026-09-01T20:00:00Z' },
          },
          { titleId: '1', name: 'Portal', type: 'Game', devices: ['Win32'] },
          { titleId: '2', name: 'Un’app', type: 'App' },
        ],
      }),
    );
    expect(await fetchXboxTitleHistory(session)).toEqual([
      {
        titleId: '1144039928',
        name: 'Clair Obscur: Expedition 33',
        devices: ['PC', 'XboxSeries'],
        productIds: ['9PPT8K6GQHRZ'],
        lastPlayedAt: new Date('2026-09-01T20:00:00Z'),
      },
      {
        titleId: '1',
        name: 'Portal',
        devices: ['Win32'],
        productIds: [],
        lastPlayedAt: null,
      },
    ]);
  });

  it('i minuti per titolo, senza gli zeri', async () => {
    stubFetch(
      json({
        statlistscollection: [
          {
            stats: [
              { titleid: '1144039928', value: '5765' },
              { titleid: '1', value: '0' },
            ],
          },
        ],
      }),
    );
    expect(await fetchXboxMinutes(session, ['1144039928', '1'])).toEqual(
      new Map([['1144039928', 5765]]),
    );
  });
});

describe('catalogo', () => {
  const prodotto = (over: Record<string, unknown> = {}) => ({
    ProductId: '9NBLGGH18846',
    LocalizedProperties: [{ ProductTitle: 'Candy Crush Saga' }],
    Properties: { XboxConsoleGenCompatible: ['ConsoleGen8', 'ConsoleGen9'] },
    DisplaySkuAvailabilities: [
      {
        Sku: {
          Properties: {
            Packages: [
              {
                PlatformDependencies: [
                  { PlatformName: 'Windows.Universal' },
                  { PlatformName: 'Windows.Xbox' },
                ],
              },
            ],
          },
        },
      },
    ],
    ...over,
  });

  it('PC, One e Series dal catalogo', () => {
    expect(productPlatforms(prodotto())).toEqual({
      title: 'Candy Crush Saga',
      pc: true,
      gen8: true,
      gen9: true,
      x360: false,
      playAnywhere: false,
      demo: false,
    });
  });

  it('un 360 retrocompatibile dal nome del pacchetto', () => {
    // Catherine, dal catalogo pubblico il 21/10/2026: il catalogo la dice One
    // e Series, e solo il pacchetto dice 360.
    const catherine = prodotto({
      Properties: {
        XboxConsoleGenCompatible: ['ConsoleGen8', 'ConsoleGen9'],
        PackageFamilyName:
          'Xbox360BackwardCompatibil.41066DACB7CF4_ksqcvrsvwz2jp',
      },
    });
    expect(productPlatforms(catherine)).toMatchObject({
      gen8: true,
      gen9: true,
      x360: true,
    });
    const bomberman = prodotto({
      Properties: {
        XboxConsoleGenCompatible: ['ConsoleGen8', 'ConsoleGen9'],
        PackageFamilyName:
          'KonamiDigitalEntertainmen.SUPERBOMBERMANR_168atcksx2mfc',
      },
    });
    expect(productPlatforms(bomberman).x360).toBe(false);
  });

  it('una console senza generazione vale come Xbox One', () => {
    const p = productPlatforms(prodotto({ Properties: {} }));
    expect(p).toMatchObject({ gen8: true, gen9: false });
  });

  it('Play Anywhere dallo sku o dagli attributi, demo da IsDemo', () => {
    expect(
      productPlatforms(
        prodotto({
          Properties: { Attributes: [{ Name: 'XPA' }], IsDemo: true },
        }),
      ),
    ).toMatchObject({ playAnywhere: true, demo: true });
  });

  it('20 prodotti a richiesta', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `ID${i}`);
    const calls = stubFetch(
      json({ Products: [prodotto({ ProductId: 'id0' })] }),
      json({ Products: [] }),
    );
    const catalogo = await fetchXboxCatalog(ids);
    expect(calls).toHaveLength(2);
    expect(catalogo.get('ID0')?.title).toBe('Candy Crush Saga');
  });
});

describe('Xbox 360 retrocompatibili', () => {
  it('il verdetto di productActions, BuyToOwn anche sullo sku', () => {
    const conAzioni = (prodotto: string[], sku: string[] = []) => ({
      productActions: [
        {
          productActions: prodotto.map((actionType) => ({ actionType })),
          skuActionsBySkuId: { s: sku.map((actionType) => ({ actionType })) },
        },
      ],
    });
    expect(actionsOwned(conAzioni(['Install']))).toBe(true);
    expect(actionsOwned(conAzioni(['Install'], ['BuyToOwn']))).toBe(false);
    expect(actionsOwned(conAzioni(['Install', 'NotSoldSeparately']))).toBe(
      false,
    );
    expect(actionsOwned(conAzioni(['BuyToOwn']))).toBe(false);
    expect(actionsOwned({})).toBe(false);
  });

  it('candidati da storico e ordini, confermati uno per uno', async () => {
    const storico: XboxPlayedTitle[] = [
      {
        titleId: '1',
        name: 'Catherine',
        devices: ['Xbox360', 'XboxOne', 'XboxSeries'],
        productIds: ['BXX7GBSDF2KN'],
        lastPlayedAt: null,
      },
    ];
    const calls = stubFetch(
      json({
        items: [
          {
            orderState: 'Purchased',
            orderLineItems: [
              {
                productId: 'c5fn9wf5z4lh',
                productType: 'Game',
                billingState: 'Charged',
                title: 'Ikaruga',
              },
              // Già in Collections: non si controlla.
              {
                productId: 'C125W9BG2K0V',
                productType: 'Game',
                billingState: 'Charged',
              },
            ],
          },
        ],
      }),
      json({
        productActions: [{ productActions: [{ actionType: 'Install' }] }],
      }),
      json({
        productActions: [{ productActions: [{ actionType: 'BuyToOwn' }] }],
      }),
    );
    const owned = await findXboxBackcompatOwned(
      session,
      storico,
      new Set(['C125W9BG2K0V']),
    );
    expect(owned).toEqual(new Map([['BXX7GBSDF2KN', 'Catherine']]));
    expect(calls[0]!.url).not.toContain('market=');
    expect(header(calls[1]!.init, 'MS-CV')).toMatch(/\.0$/);
  });

  it('ordini illeggibili: si va avanti con lo storico', async () => {
    const storico: XboxPlayedTitle[] = [
      {
        titleId: '1',
        name: 'Catherine',
        devices: ['Xbox360'],
        productIds: ['BXX7GBSDF2KN'],
        lastPlayedAt: null,
      },
    ];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stubFetch(
      json({}, 500),
      json({
        productActions: [{ productActions: [{ actionType: 'Install' }] }],
      }),
    );
    expect(await findXboxBackcompatOwned(session, storico, new Set())).toEqual(
      new Map([['BXX7GBSDF2KN', 'Catherine']]),
    );
  });
});
