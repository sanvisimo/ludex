import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchItadOverview, itadEnabled, lookupItadIds } from './itad';

// Puro: nessuna rete, nessun database. Le forme delle risposte sono quelle vere,
// misurate con `itad:probe`.
const redis = vi.hoisted(() => ({
  values: new Map<string, { value: string; ttl: number }>(),
}));

vi.mock('../lib/redis', () => ({
  cacheGet: async (key: string) => redis.values.get(key)?.value ?? null,
  cacheSet: async (key: string, value: string, ttl: number) => {
    redis.values.set(key, { value, ttl });
  },
}));

const fetchMock = vi.fn<typeof fetch>();

function answer(body: unknown, status = 200, headers = {}) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers }),
  );
}

const sentTo = () => String(fetchMock.mock.calls[0]?.[0]);
const sentInit = () => fetchMock.mock.calls[0]?.[1];

beforeEach(() => {
  redis.values.clear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('ITAD_API_KEY', 'chiave');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('itadEnabled', () => {
  it('è spento senza chiave', () => {
    vi.stubEnv('ITAD_API_KEY', '');
    expect(itadEnabled()).toBe(false);
  });
});

describe('lookupItadIds', () => {
  it('manda a Steam `app/<appid>` e risponde coi nostri id', async () => {
    answer({ 'app/220': 'uuid-hl2', 'app/999': null });

    const found = await lookupItadIds('steam', ['220', '999']);

    expect(sentTo()).toContain('/lookup/id/shop/61/v1');
    expect(JSON.parse(String(sentInit()?.body))).toEqual([
      'app/220',
      'app/999',
    ]);
    expect(found).toEqual(
      new Map([
        ['220', 'uuid-hl2'],
        ['999', null],
      ]),
    );
  });

  it("manda a GOG l'id nudo", async () => {
    answer({ '1207659193': 'uuid-gog' });

    const found = await lookupItadIds('gog', ['1207659193']);

    expect(sentTo()).toContain('/lookup/id/shop/35/v1');
    expect(found.get('1207659193')).toBe('uuid-gog');
  });
});

describe('fetchItadOverview', () => {
  const voce = {
    id: 'uuid-hl2',
    current: {
      shop: { id: 35, name: 'GOG' },
      price: { amount: 12.99, amountInt: 1299, currency: 'EUR' },
      cut: 50,
      flag: 'H',
    },
    lowest: null,
    urls: { game: 'https://isthereanydeal.com/game/id:uuid-hl2/' },
  };

  it('chiede IT senza voucher, con la chiave nell’header', async () => {
    answer({ prices: [voce], bundles: [] });

    await expect(fetchItadOverview('uuid-hl2')).resolves.toEqual(voce);

    expect(sentTo()).toContain('/games/overview/v2?country=IT&vouchers=false');
    expect(sentTo()).not.toContain('chiave');
    expect(sentInit()?.headers).toMatchObject({ 'ITAD-API-Key': 'chiave' });
  });

  it('dà null se ITAD non restituisce il gioco', async () => {
    answer({ prices: [], bundles: [] });

    await expect(fetchItadOverview('uuid-ritirato')).resolves.toBeNull();
  });

  it('dice che la chiave è stata rifiutata', async () => {
    answer({ status_code: 403 }, 403);

    await expect(fetchItadOverview('uuid-hl2')).rejects.toThrow(
      'chiave rifiutata',
    );
  });
});

describe('dopo un 429', () => {
  it('si ferma per il tempo di Retry-After, senza chiamare', async () => {
    answer({}, 429, { 'Retry-After': '120' });

    await expect(lookupItadIds('steam', ['220'])).rejects.toThrow('429');
    expect(redis.values.get('itad:cooldown')?.ttl).toBe(120);

    fetchMock.mockClear();
    await expect(fetchItadOverview('uuid-hl2')).rejects.toThrow('in pausa');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('senza Retry-After aspetta i 5 minuti della finestra', async () => {
    answer({}, 429);

    await expect(lookupItadIds('steam', ['220'])).rejects.toThrow('429');
    expect(redis.values.get('itad:cooldown')?.ttl).toBe(300);
  });
});
