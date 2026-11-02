import { db, schema } from '@repo/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGame, linkSteamAppId } from '../../test/factories';
import {
  fetchItadInfo,
  fetchItadOverview,
  itadEnabled,
  lookupItadIds,
  type ItadOverview,
} from '../external/itad';
import { findGamePrice, resolveItadId } from './itad';

// Redis in memoria: il Redis di sviluppo è uno solo e i test non vanno a
// scriverci. Funzioni normali e non `vi.fn`: `mockReset` le svuoterebbe.
const redis = vi.hoisted(() => ({
  values: new Map<string, { value: string; ttl: number }>(),
}));

vi.mock('../lib/redis', () => ({
  cacheGet: async (key: string) => redis.values.get(key)?.value ?? null,
  cacheSet: async (key: string, value: string, ttl: number) => {
    redis.values.set(key, { value, ttl });
  },
}));

vi.mock('../external/itad', () => ({
  fetchItadInfo: vi.fn(),
  fetchItadOverview: vi.fn(),
  itadEnabled: vi.fn(),
  lookupItadIds: vi.fn(),
}));

const DAY = 24 * 60 * 60;

function linkGogId(gameId: string, externalId: string) {
  return db
    .insert(schema.externalIds)
    .values({ gameId, source: 'gog', externalId });
}

/** ITAD risponde con questi UUID, per id di negozio. */
function itadKnows(uuids: Record<string, string>) {
  vi.mocked(lookupItadIds).mockImplementation(async (_store, ids) => {
    return new Map(ids.map((id) => [id, uuids[id] ?? null]));
  });
}

/** Le voci che ITAD dà come `game`: le altre non hanno tipo, come i Playtest. */
function itadGames(...uuids: string[]) {
  vi.mocked(fetchItadInfo).mockImplementation(async (uuid) => ({
    id: uuid,
    title: uuid,
    type: uuids.includes(uuid) ? 'game' : null,
  }));
}

beforeEach(() => {
  redis.values.clear();
  vi.mocked(itadEnabled).mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveItadId', () => {
  it("dà l'UUID di un gioco con un id Steam, e non chiede il tipo", async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '220');
    itadKnows({ '220': 'uuid-hl2' });

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-hl2');
    expect(lookupItadIds).toHaveBeenCalledWith('steam', ['220']);
    expect(fetchItadInfo).not.toHaveBeenCalled();
  });

  it('non chiama ITAD per un gioco senza id Steam o GOG', async () => {
    const game = await createGame();
    await db
      .insert(schema.externalIds)
      .values({ gameId: game.id, source: 'psn', externalId: 'CUSA00001' });

    await expect(resolveItadId(game.id)).resolves.toBeNull();
    expect(lookupItadIds).not.toHaveBeenCalled();
  });

  it('non chiama ITAD senza chiave', async () => {
    vi.mocked(itadEnabled).mockReturnValue(false);
    const game = await createGame();
    await linkSteamAppId(game.id, '220');

    await expect(resolveItadId(game.id)).resolves.toBeNull();
    expect(lookupItadIds).not.toHaveBeenCalled();
  });

  it('ricorda sia gli id trovati sia quelli che ITAD non conosce', async () => {
    const trovato = await createGame();
    await linkSteamAppId(trovato.id, '220');
    const ignoto = await createGame();
    await linkSteamAppId(ignoto.id, '999');
    itadKnows({ '220': 'uuid-hl2' });

    await resolveItadId(trovato.id);
    await resolveItadId(ignoto.id);
    vi.mocked(lookupItadIds).mockClear();

    await expect(resolveItadId(trovato.id)).resolves.toBe('uuid-hl2');
    await expect(resolveItadId(ignoto.id)).resolves.toBeNull();
    expect(lookupItadIds).not.toHaveBeenCalled();
    expect(redis.values.get('itad:id:steam:220')?.ttl).toBe(30 * DAY);
    expect(redis.values.get('itad:id:steam:999')?.ttl).toBe(7 * DAY);
  });

  it("legge le durate dall'ambiente, e ignora i valori che non vanno", async () => {
    vi.stubEnv('ITAD_ID_TTL_DAYS', '2');
    vi.stubEnv('ITAD_NOT_FOUND_TTL_DAYS', 'domani');
    const trovato = await createGame();
    await linkSteamAppId(trovato.id, '220');
    const ignoto = await createGame();
    await linkSteamAppId(ignoto.id, '999');
    itadKnows({ '220': 'uuid-hl2' });

    await resolveItadId(trovato.id);
    await resolveItadId(ignoto.id);

    expect(redis.values.get('itad:id:steam:220')?.ttl).toBe(2 * DAY);
    expect(redis.values.get('itad:id:steam:999')?.ttl).toBe(7 * DAY);
  });

  it('chiede a ITAD solo gli id che non ha in cache', async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '100');
    await linkSteamAppId(game.id, '200');
    redis.values.set('itad:id:steam:100', { value: 'uuid-100', ttl: DAY });
    itadKnows({ '200': 'uuid-100' });

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-100');
    expect(lookupItadIds).toHaveBeenCalledWith('steam', ['200']);
  });

  it('non scrive «non lo conosce» quando ITAD è giù', async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '220');
    vi.mocked(lookupItadIds).mockRejectedValueOnce(new Error('ITAD giù'));

    await expect(resolveItadId(game.id)).rejects.toThrow('ITAD giù');
    expect(redis.values.size).toBe(0);

    itadKnows({ '220': 'uuid-hl2' });
    await expect(resolveItadId(game.id)).resolves.toBe('uuid-hl2');
  });

  it('non chiede il tipo se Steam e GOG danno lo stesso UUID', async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '220');
    await linkGogId(game.id, '1207');
    itadKnows({ '220': 'uuid-hl2', '1207': 'uuid-hl2' });

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-hl2');
    expect(fetchItadInfo).not.toHaveBeenCalled();
  });

  it('scarta il Playtest anche se ha il suo id più basso', async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '100');
    await linkSteamAppId(game.id, '900');
    itadKnows({ '100': 'uuid-playtest', '900': 'uuid-gioco' });
    itadGames('uuid-gioco');

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-gioco');
  });

  it('fra due giochi veri, Steam vince su GOG', async () => {
    const game = await createGame();
    await linkGogId(game.id, '1');
    await linkSteamAppId(game.id, '900');
    itadKnows({ '1': 'uuid-gog', '900': 'uuid-steam' });
    itadGames('uuid-gog', 'uuid-steam');

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-steam');
  });

  it("fra due giochi veri sullo stesso negozio, vince l'id più basso", async () => {
    const game = await createGame();
    // Come numeri: da testo, «100» verrebbe prima di «99».
    await linkSteamAppId(game.id, '100');
    await linkSteamAppId(game.id, '99');
    itadKnows({ '99': 'uuid-basso', '100': 'uuid-alto' });
    itadGames('uuid-basso', 'uuid-alto');

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-basso');
  });

  it('se nessuna voce è un gioco, vale comunque Steam su GOG', async () => {
    const game = await createGame();
    await linkGogId(game.id, '1');
    await linkSteamAppId(game.id, '900');
    itadKnows({ '1': 'uuid-gog', '900': 'uuid-steam' });
    itadGames();

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-steam');
  });

  it('ricorda il tipo e non lo richiede', async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '100');
    await linkSteamAppId(game.id, '900');
    itadKnows({ '100': 'uuid-playtest', '900': 'uuid-gioco' });
    itadGames('uuid-gioco');

    await resolveItadId(game.id);
    vi.mocked(fetchItadInfo).mockClear();

    await expect(resolveItadId(game.id)).resolves.toBe('uuid-gioco');
    expect(fetchItadInfo).not.toHaveBeenCalled();
  });
});

describe('findGamePrice', () => {
  const URL = 'https://isthereanydeal.com/game/id:uuid-hl2/info/';

  function overview(
    flag: ItadOverview['current']['flag'],
    amountInt = 1299,
    regularInt = 2599,
  ): ItadOverview {
    const price = (cents: number) => ({
      amount: cents / 100,
      amountInt: cents,
      currency: 'EUR',
    });
    return {
      id: 'uuid-hl2',
      current: {
        shop: { id: 35, name: 'GOG' },
        price: price(amountInt),
        regular: price(regularInt),
        cut: 50,
        flag,
      },
      lowest: null,
      urls: { game: 'https://isthereanydeal.com/game/id:uuid-hl2/' },
    };
  }

  async function gameOnItad() {
    const game = await createGame();
    await linkSteamAppId(game.id, '220');
    itadKnows({ '220': 'uuid-hl2' });
    return game.id;
  }

  it('dà prezzo, negozio e link, e tiene la risposta per 3 ore', async () => {
    const gameId = await gameOnItad();
    vi.mocked(fetchItadOverview).mockResolvedValue(overview(null));

    await expect(findGamePrice(gameId)).resolves.toEqual({
      url: URL,
      current: {
        amount: 12.99,
        currency: 'EUR',
        shop: 'GOG',
        historicalLow: false,
      },
    });
    expect(redis.values.get('itad:price:uuid-hl2')?.ttl).toBe(3 * 60 * 60);

    vi.mocked(fetchItadOverview).mockClear();
    await findGamePrice(gameId);
    expect(fetchItadOverview).not.toHaveBeenCalled();
  });

  it.each([
    ['H', true],
    ['N', true],
    ['S', false],
  ] as const)(
    'col flag %s, minimo storico: %s',
    async (flag, historicalLow) => {
      const gameId = await gameOnItad();
      vi.mocked(fetchItadOverview).mockResolvedValue(overview(flag));

      const price = await findGamePrice(gameId);
      expect(price?.current?.historicalLow).toBe(historicalLow);
    },
  );

  it('non segna il minimo storico su un gioco sempre gratuito', async () => {
    const gameId = await gameOnItad();
    vi.mocked(fetchItadOverview).mockResolvedValue(overview('H', 0, 0));

    const price = await findGamePrice(gameId);
    expect(price?.current).toMatchObject({ amount: 0, historicalLow: false });
  });

  it('lo segna su un gioco scontato al 100%', async () => {
    const gameId = await gameOnItad();
    vi.mocked(fetchItadOverview).mockResolvedValue(overview('H', 0, 2599));

    const price = await findGamePrice(gameId);
    expect(price?.current).toMatchObject({ amount: 0, historicalLow: true });
  });

  it('senza offerte la riga resta, e la risposta si ricorda', async () => {
    const gameId = await gameOnItad();
    vi.mocked(fetchItadOverview).mockResolvedValue(null);

    await expect(findGamePrice(gameId)).resolves.toEqual({
      url: URL,
      current: null,
    });

    vi.mocked(fetchItadOverview).mockClear();
    await findGamePrice(gameId);
    expect(fetchItadOverview).not.toHaveBeenCalled();
  });

  it("con l'id noto e ITAD giù resta il link, e non si ricorda", async () => {
    const gameId = await gameOnItad();
    vi.mocked(fetchItadOverview).mockRejectedValue(new Error('ITAD giù'));

    await expect(findGamePrice(gameId)).resolves.toEqual({
      url: URL,
      current: null,
    });
    expect(redis.values.has('itad:price:uuid-hl2')).toBe(false);
  });

  it("senza id ITAD non c'è la riga", async () => {
    const game = await createGame();

    await expect(findGamePrice(game.id)).resolves.toBeNull();
  });

  it("se non si riesce a risolvere l'id non c'è la riga, e non lancia", async () => {
    const game = await createGame();
    await linkSteamAppId(game.id, '220');
    vi.mocked(lookupItadIds).mockRejectedValue(new Error('ITAD giù'));

    await expect(findGamePrice(game.id)).resolves.toBeNull();
  });
});
