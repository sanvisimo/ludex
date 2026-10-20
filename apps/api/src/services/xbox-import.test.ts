import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchXboxCatalog,
  fetchXboxCollections,
  fetchXboxMinutes,
  fetchXboxTitleHistory,
  findXboxBackcompatOwned,
  openXboxSession,
  XboxAuthError,
  type XboxPlayedTitle,
  type XboxProduct,
} from '../external/xbox';
import { importLibrary } from './library-import';
import { requireReauth, xboxCredentials } from './store-accounts';
import {
  buildXboxEntries,
  importXboxLibrary,
  type XboxSources,
} from './xbox-import';

vi.mock('../external/xbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external/xbox')>()),
  openXboxSession: vi.fn(),
  fetchXboxCollections: vi.fn(),
  fetchXboxTitleHistory: vi.fn(),
  fetchXboxCatalog: vi.fn(),
  fetchXboxMinutes: vi.fn(),
  findXboxBackcompatOwned: vi.fn(),
}));
vi.mock('./library-import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./library-import')>()),
  importLibrary: vi.fn(),
}));
vi.mock('./store-accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store-accounts')>()),
  xboxCredentials: vi.fn(),
  requireReauth: vi.fn(),
}));

// La parte pura prova cosa diventa una copia, e non c'è Microsoft da stubbare.
// L'orchestrazione sta sotto, con le fonti e l'import stubbati al confine.

const TUTTE = {
  platforms: ['pc_windows', 'xbox360', 'xbox_one', 'xbox_series'] as const,
};

function prodotto(over: Partial<XboxProduct> = {}): XboxProduct {
  return {
    title: 'Rocket League®',
    pc: false,
    gen8: true,
    gen9: true,
    playAnywhere: false,
    demo: false,
    ...over,
  };
}

function titolo(over: Partial<XboxPlayedTitle> = {}): XboxPlayedTitle {
  return {
    titleId: '1',
    name: 'Clair Obscur: Expedition 33',
    devices: ['PC', 'XboxSeries'],
    productIds: ['9PPT8K6GQHRZ'],
    lastPlayedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

function fonti(over: Partial<XboxSources> = {}): XboxSources {
  return {
    owned: [],
    catalog: new Map(),
    backcompat: new Map(),
    history: [],
    minutes: new Map(),
    ...over,
  };
}

const build = (
  sources: Partial<XboxSources>,
  platforms: readonly string[] = ['xbox_series'],
  gamePassActive = true,
) =>
  buildXboxEntries(fonti(sources), {
    platforms: [...platforms] as never,
    gamePassActive,
  });

describe('buildXboxEntries', () => {
  it('un posseduto: una copia per piattaforma spuntata su cui gira', () => {
    const { entries } = build(
      {
        owned: [
          {
            productId: 'C125W9BG2K0V',
            kind: 'owned',
            acquiredAt: new Date('2020-01-17T00:00:00Z'),
          },
        ],
        catalog: new Map([['C125W9BG2K0V', prodotto({ pc: true })]]),
      },
      TUTTE.platforms,
    );
    expect(entries.map((e) => e.platformSlug)).toEqual([
      'xbox_series',
      'xbox_one',
      'pc_windows',
    ]);
    expect(entries[0]).toMatchObject({
      externalId: 'C125W9BG2K0V',
      name: 'Rocket League®',
      storePage: 'C125W9BG2K0V',
      acquiredAt: new Date('2020-01-17T00:00:00Z'),
    });
    expect(entries[0]!.subscription).toBeUndefined();
  });

  it('solo Series spuntata: un gioco One è una copia Series', () => {
    const { entries } = build({
      owned: [{ productId: 'A', kind: 'owned', acquiredAt: null }],
      catalog: new Map([['A', prodotto({ gen9: false })]]),
    });
    expect(entries.map((e) => e.platformSlug)).toEqual(['xbox_series']);
  });

  it('un gioco solo PC con la sola Series spuntata non entra', () => {
    const { entries, conteggi } = build({
      owned: [{ productId: 'A', kind: 'owned', acquiredAt: null }],
      catalog: new Map([
        ['A', prodotto({ pc: true, gen8: false, gen9: false })],
      ]),
    });
    expect(entries).toEqual([]);
    expect(conteggi.fuoriDallePiattaforme).toBe(1);
  });

  it('Games with Gold è un abbonamento', () => {
    const { entries } = build({
      owned: [{ productId: 'A', kind: 'gold', acquiredAt: null }],
      catalog: new Map([['A', prodotto()]]),
    });
    expect(entries[0]).toMatchObject({ subscription: 'games_with_gold' });
  });

  it('salta le demo e i prodotti senza piattaforma', () => {
    const { entries, conteggi } = build({
      owned: [
        { productId: 'DEMO', kind: 'owned', acquiredAt: null },
        { productId: 'BUNDLE', kind: 'owned', acquiredAt: null },
      ],
      catalog: new Map([['DEMO', prodotto({ demo: true })]]),
    });
    expect(entries).toEqual([]);
    expect(conteggi).toMatchObject({ demo: 1, senzaCatalogo: 1 });
  });

  it('le ore vanno su una copia sola, la console più recente', () => {
    const { entries } = build(
      {
        owned: [{ productId: 'A', kind: 'owned', acquiredAt: null }],
        catalog: new Map([['A', prodotto({ pc: true })]]),
        history: [titolo({ titleId: '7', productIds: ['A'] })],
        minutes: new Map([['7', 300]]),
      },
      ['pc_windows', 'xbox_one'],
    );
    expect(
      entries.map((e) => [e.platformSlug, e.playtimeMinutes ?? null]),
    ).toEqual([
      ['xbox_one', 300],
      ['pc_windows', null],
    ]);
  });

  it('giocato e non posseduto è Game Pass, nato «played» senza abbonamento', () => {
    const attivo = build({ history: [titolo()] }).entries;
    expect(attivo).toMatchObject([
      { externalId: '9PPT8K6GQHRZ', subscription: 'game_pass' },
    ]);
    expect(attivo[0]!.status).toBeUndefined();

    const scaduto = build({ history: [titolo()] }, ['xbox_series'], false);
    expect(scaduto.entries[0]).toMatchObject({ status: 'played' });
  });

  it('i giochi solo Win32 sono di altri negozi e non entrano', () => {
    const { entries, conteggi } = build(
      { history: [titolo({ devices: ['Win32'], productIds: [] })] },
      ['pc_windows'],
    );
    expect(entries).toEqual([]);
    expect(conteggi.altriNegozi).toBe(1);
  });

  it('un giocato già posseduto non diventa anche Game Pass', () => {
    const { entries } = build({
      owned: [{ productId: 'A', kind: 'owned', acquiredAt: null }],
      catalog: new Map([['A', prodotto()]]),
      history: [titolo({ productIds: ['B', 'A'] })],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.subscription).toBeUndefined();
  });

  it('un 360 comprato va su 360 e sulle console spuntate, e lo storico non lo ripete', () => {
    const { entries } = build(
      {
        backcompat: new Map([['BXX7GBSDF2KN', 'Catherine']]),
        history: [
          titolo({
            name: 'Catherine',
            devices: ['Xbox360', 'XboxOne', 'XboxSeries'],
            productIds: ['BXX7GBSDF2KN'],
          }),
        ],
      },
      ['xbox360', 'xbox_series'],
    );
    expect(entries.map((e) => [e.platformSlug, e.subscription])).toEqual([
      ['xbox_series', undefined],
      ['xbox360', undefined],
    ]);
  });
});

describe('importXboxLibrary', () => {
  const account = { id: 'acc', store: 'xbox' } as never;

  beforeEach(() => {
    vi.mocked(xboxCredentials).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      platforms: ['xbox_series'],
      gamePassActive: false,
    });
    vi.mocked(openXboxSession).mockResolvedValue({
      xuid: '1',
      gamertag: 'g',
      live: 'l',
      store: 's',
    });
    vi.mocked(fetchXboxCollections).mockResolvedValue([]);
    vi.mocked(fetchXboxTitleHistory).mockResolvedValue([titolo()]);
    vi.mocked(fetchXboxCatalog).mockResolvedValue(new Map());
    vi.mocked(findXboxBackcompatOwned).mockResolvedValue(new Map());
    vi.mocked(fetchXboxMinutes).mockResolvedValue(new Map([['1', 90]]));
    vi.mocked(importLibrary).mockResolvedValue({} as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('porta a importLibrary le voci, con le scelte salvate', async () => {
    await importXboxLibrary(account);
    expect(vi.mocked(importLibrary)).toHaveBeenCalledWith(account, [
      expect.objectContaining({
        externalId: '9PPT8K6GQHRZ',
        platformSlug: 'xbox_series',
        subscription: 'game_pass',
        status: 'played',
        playtimeMinutes: 90,
      }),
    ]);
  });

  it('senza console spuntate non cerca i 360', async () => {
    vi.mocked(xboxCredentials).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 0,
      platforms: ['pc_windows'],
      gamePassActive: true,
    });
    await importXboxLibrary(account);
    expect(vi.mocked(findXboxBackcompatOwned)).not.toHaveBeenCalled();
  });

  it('le ore che non arrivano non fermano l’import', async () => {
    vi.mocked(fetchXboxMinutes).mockRejectedValue(new Error('500'));
    await importXboxLibrary(account);
    expect(vi.mocked(importLibrary)).toHaveBeenCalled();
  });

  it('un token rifiutato a metà manda l’account da ricollegare', async () => {
    vi.mocked(fetchXboxCollections).mockRejectedValue(
      new XboxAuthError('revocato'),
    );
    await importXboxLibrary(account);
    expect(vi.mocked(requireReauth)).toHaveBeenCalledWith(account);
    expect(vi.mocked(importLibrary)).not.toHaveBeenCalled();
  });
});
