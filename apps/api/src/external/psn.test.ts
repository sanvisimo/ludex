import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPsnWishlist,
  parseNpsso,
  parsePlayDuration,
  PsnAuthError,
} from './psn';
import {
  toPlatformSlug,
  toPlayedPlatformSlug,
} from '../services/psn-platforms';

// Puro: nessuna rete, nessun database. Su PSN quello che l'utente si trova
// davanti è una pagina JSON come su Epic, ma il campo che conta è uno solo.

describe('parseNpsso', () => {
  const npsso =
    'HcJ2kQ8vT1nR5wLpY7bXeM0aZsD4gFhU3iOoK9lNqVrCtWyPjB6xEfAdSgZmIuTn';

  it('accetta la risposta JSON intera, che è quella che si vede a schermo', () => {
    expect(parseNpsso(`{"npsso":"${npsso}"}`)).toBe(npsso);
    expect(parseNpsso(`  {"npsso": "${npsso}"}  `)).toBe(npsso);
  });

  it('accetta il solo valore, anche con le virgolette appresso', () => {
    expect(parseNpsso(npsso)).toBe(npsso);
    expect(parseNpsso(`"${npsso}"`)).toBe(npsso);
    expect(parseNpsso(`  ${npsso}  `)).toBe(npsso);
  });

  it('rende null su un JSON senza il campo giusto', () => {
    // Succede copiando la pagina sbagliata, o copiandola da sloggati: Sony in
    // quel caso risponde `{"npsso":null}`, che è un JSON buono con dentro
    // niente. Va distinto da un valore illeggibile, perché il rimedio è un
    // altro — lì bisogna prima fare il login.
    expect(parseNpsso('{"npsso":null}')).toBe(null);
    expect(parseNpsso('{"error":"unauthorized"}')).toBe(null);
    expect(parseNpsso('{ rotto')).toBe(null);
  });

  it('rende null su tutto ciò che npsso non è', () => {
    expect(parseNpsso('')).toBe(null);
    expect(parseNpsso('   ')).toBe(null);
    // Un codice Epic: 32 esadecimali, troppo corto per essere un npsso.
    expect(parseNpsso('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe(null);
  });
});

describe('parsePlayDuration', () => {
  it('legge la durata ISO che Sony usa per le ore giocate', () => {
    expect(parsePlayDuration('PT34H12M45S')).toBe(2053);
    expect(parsePlayDuration('PT1H')).toBe(60);
    expect(parsePlayDuration('PT45M')).toBe(45);
    // I giorni non compaiono nelle risposte viste, ma costano una riga e non
    // doverci tornare: un GDR da mille ore non deve diventare zero.
    expect(parsePlayDuration('P2DT3H')).toBe(3060);
  });

  it('rende null invece di zero su ciò che non sa leggere', () => {
    // Zero vorrebbe dire «giocato zero minuti», che è un'altra affermazione:
    // le ore nulle su `ownerships` sono in COALESCE e non cancellano quelle
    // che c'erano, uno zero sì.
    expect(parsePlayDuration(undefined)).toBe(null);
    expect(parsePlayDuration('')).toBe(null);
    expect(parsePlayDuration('34 ore')).toBe(null);
  });
});

describe('toPlatformSlug', () => {
  it('traduce le piattaforme che Sony dichiara', () => {
    expect(toPlatformSlug('PS5')).toBe('sony_playstation5');
    expect(toPlatformSlug('PS4')).toBe('sony_playstation4');
    expect(toPlatformSlug('ps3')).toBe('sony_playstation3');
    expect(toPlatformSlug('PSVITA')).toBe('sony_vita');
  });

  it('rende null su una piattaforma che non conosce', () => {
    // Non ripiega su PS4: la piattaforma è il filtro hard del motore
    // decisionale, e indovinarla vuol dire proporre un gioco che non si può
    // avviare. Chi chiama deve dirlo, non tirare a indovinare.
    expect(toPlatformSlug('PS6')).toBe(null);
    expect(toPlatformSlug('')).toBe(null);
  });
});

describe('toPlayedPlatformSlug', () => {
  it('traduce le categorie dei giocati', () => {
    expect(toPlayedPlatformSlug('ps5_native_game', 'PPSA01521_00')).toBe(
      'sony_playstation5',
    );
    expect(toPlayedPlatformSlug('ps4_game', 'CUSA08519_00')).toBe(
      'sony_playstation4',
    );
  });

  it('sulle righe vecchie `unknown` decide il prefisso del titleId', () => {
    expect(toPlayedPlatformSlug('unknown', 'CUSA05399_00')).toBe(
      'sony_playstation4',
    );
    expect(toPlayedPlatformSlug(null, 'PPSA01341_00')).toBe(
      'sony_playstation5',
    );
  });

  it('un disco PS4 avviato su PS5 resta PS4: è quella la copia che hai', () => {
    expect(toPlayedPlatformSlug('unknown', 'CUSA13801_00')).toBe(
      'sony_playstation4',
    );
  });

  it('rende null quando né la categoria né il prefisso dicono niente', () => {
    expect(toPlayedPlatformSlug('ps3_game', 'NPEB01234_00')).toBe(null);
  });
});

describe('fetchPsnWishlist', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

  const prodotto = (over: Record<string, unknown> = {}) => ({
    __typename: 'Product',
    id: 'EP0002-CUSA13801_00-SEKIROGAME000001',
    name: '  Sekiro™: Shadows Die Twice - Game of the Year Edition ',
    platforms: ['PS4'],
    storeDisplayClassification: 'FULL_GAME',
    boxArt: { url: 'https://image.api.playstation.com/sekiro.png' },
    price: { basePrice: '$59.99' },
    ...over,
  });

  it('chiama m.np con la query persistente e le intestazioni misurate', async () => {
    respond({ data: { storeWishlist: [prodotto()] } });

    await fetchPsnWishlist('token-di-prova');

    const [url, init] = fetchMock.mock.calls[0]!;
    const u = url as URL;
    expect(u.origin + u.pathname).toBe(
      'https://m.np.playstation.com/api/graphql/v1/op',
    );
    expect(u.searchParams.get('operationName')).toBe('metGetStoreWishlist');
    expect(u.searchParams.get('variables')).toBe('{}');
    expect(JSON.parse(u.searchParams.get('extensions')!)).toEqual({
      persistedQuery: {
        version: 1,
        sha256Hash:
          '571149e8aa4d76af7dd33b92e1d6f8f828ebc5fa8f0f6bf51a8324a0e6d71324',
      },
    });
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-di-prova',
      'apollographql-client-name': 'PlayStationApp-Android',
    });
  });

  it('rende un prodotto per voce, con le piattaforme e senza i prezzi', async () => {
    respond({
      data: {
        storeWishlist: [
          prodotto(),
          prodotto({
            id: 'EP3643-PPSA06465_00-3571249245584917',
            name: 'Cult of the Lamb',
            platforms: ['PS4', 'PS5'],
            boxArt: null,
          }),
        ],
      },
    });

    const wishlist = await fetchPsnWishlist('t');

    expect(wishlist).toEqual([
      {
        externalId: 'EP0002-CUSA13801_00-SEKIROGAME000001',
        name: 'Sekiro™: Shadows Die Twice - Game of the Year Edition',
        platforms: ['PS4'],
        classification: 'FULL_GAME',
        imageUrl: 'https://image.api.playstation.com/sekiro.png',
      },
      {
        externalId: 'EP3643-PPSA06465_00-3571249245584917',
        name: 'Cult of the Lamb',
        platforms: ['PS4', 'PS5'],
        classification: 'FULL_GAME',
        imageUrl: null,
      },
    ]);
  });

  it('salta le voci senza id o senza nome', async () => {
    respond({
      data: {
        storeWishlist: [
          prodotto({ id: null }),
          prodotto({ name: '   ' }),
          prodotto({ id: 'buono', name: 'Buono' }),
        ],
      },
    });
    expect((await fetchPsnWishlist('t')).map((p) => p.externalId)).toEqual([
      'buono',
    ]);
  });

  it('una wishlist vuota è una lista vuota', async () => {
    respond({ data: { storeWishlist: [] } });
    await expect(fetchPsnWishlist('t')).resolves.toEqual([]);
  });

  it('una risposta di un’altra forma, o un errore GraphQL, non è una lista vuota', async () => {
    // L'hash della query persistente può smettere di valere: Sony lo dice con un
    // errore. Scambiarlo per una lista vuota farebbe svuotare quella dell'utente.
    respond({ errors: [{ message: 'PersistedQueryNotFound' }] });
    await expect(fetchPsnWishlist('t')).rejects.toThrow(
      /PersistedQueryNotFound/,
    );

    respond({ data: { storeWishlist: null } });
    await expect(fetchPsnWishlist('t')).rejects.toThrow(/senza storeWishlist/);

    respond({ data: {} });
    await expect(fetchPsnWishlist('t')).rejects.toThrow(/senza storeWishlist/);
  });

  it('un rifiuto è il credenziale da rifare, un 500 un errore col corpo', async () => {
    respond({}, 401);
    await expect(fetchPsnWishlist('t')).rejects.toBeInstanceOf(PsnAuthError);

    respond({ message: 'giù' }, 500);
    const error = (await fetchPsnWishlist('t').catch(
      (e: unknown) => e,
    )) as Error;
    expect(error).not.toBeInstanceOf(PsnAuthError);
    expect(error.message).toContain('500');
    expect(error.message).toContain('giù');
  });
});
