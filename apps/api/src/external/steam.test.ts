import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSteamAppCovers,
  fetchSteamAppTypes,
  fetchSteamFamilyLibrary,
  fetchSteamLibrary,
  fetchSteamOwnedAppIds,
  fetchSteamWishlist,
  resolveSteamId,
  SteamLibraryNotVisibleError,
  SteamProfileNotFoundError,
  SteamUnauthorizedError,
  SteamUserDataError,
} from './steam';

// Nessun test esce in rete: si stubba `fetch`, che qui è il confine vero — il
// modulo non ha altre dipendenze. La chiave la si finge, così la suite non
// dipende da credenziali vere.
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.STEAM_API_KEY = 'chiave-di-prova';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonOnce = (body: unknown, ok = true, status = 200) =>
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

describe('resolveSteamId', () => {
  it("prende uno SteamID64 così com'è, senza chiamare Steam", async () => {
    await expect(resolveSteamId('76561198015402862')).resolves.toBe(
      '76561198015402862',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("estrae l'id dall'URL /profiles/", async () => {
    await expect(
      resolveSteamId('https://steamcommunity.com/profiles/76561198015402862/'),
    ).resolves.toBe('76561198015402862');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("risolve il nome scelto dall'URL /id/", async () => {
    jsonOnce({ response: { success: 1, steamid: '76561198015402862' } });

    await expect(
      resolveSteamId('https://steamcommunity.com/id/pippo'),
    ).resolves.toBe('76561198015402862');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('vanityurl=pippo');
  });

  it('accetta anche il solo nome scelto', async () => {
    jsonOnce({ response: { success: 1, steamid: '76561198015402862' } });
    await expect(resolveSteamId('pippo')).resolves.toBe('76561198015402862');
  });

  it('segnala il nome che non esiste', async () => {
    // success 42 = nessuna corrispondenza, ma l'HTTP è 200: senza guardare il
    // corpo si finirebbe per salvare un account inesistente.
    jsonOnce({ response: { success: 42, message: 'No match' } });
    await expect(resolveSteamId('nessuno')).rejects.toBeInstanceOf(
      SteamProfileNotFoundError,
    );
  });

  it('rifiuta un URL /profiles/ che non contiene uno SteamID64', async () => {
    await expect(
      resolveSteamId('https://steamcommunity.com/profiles/non-un-id'),
    ).rejects.toBeInstanceOf(SteamProfileNotFoundError);
  });
});

describe('fetchSteamLibrary', () => {
  it("traduce le voci, con le ore e l'ultima partita", async () => {
    jsonOnce({
      response: {
        game_count: 1,
        games: [
          {
            appid: 220,
            name: 'Half-Life 2',
            playtime_forever: 630,
            rtime_last_played: 1768521600,
          },
        ],
      },
    });

    await expect(fetchSteamLibrary('76561198015402862')).resolves.toEqual([
      {
        externalId: '220',
        name: 'Half-Life 2',
        playtimeMinutes: 630,
        lastPlayedAt: new Date(1768521600 * 1000),
      },
    ]);
  });

  it("tratta rtime_last_played a zero come 'mai giocato'", async () => {
    jsonOnce({
      response: {
        game_count: 1,
        games: [{ appid: 70, name: 'Half-Life', rtime_last_played: 0 }],
      },
    });

    const [entry] = await fetchSteamLibrary('76561198015402862');
    expect(entry).toMatchObject({ playtimeMinutes: 0, lastPlayedAt: null });
  });

  it('distingue la libreria vuota dal profilo che non si può vedere', async () => {
    // Pubblica ma vuota: `game_count` c'è e vale 0.
    jsonOnce({ response: { game_count: 0 } });
    await expect(fetchSteamLibrary('76561198015402862')).resolves.toEqual([]);

    // Privata, dettagli nascosti o SteamID inesistente: corpo vuoto, HTTP 200.
    // Sono due cose che vanno dette all'utente in modo diverso.
    jsonOnce({ response: {} });
    await expect(fetchSteamLibrary('76561198015402862')).rejects.toBeInstanceOf(
      SteamLibraryNotVisibleError,
    );
  });

  it('solleva su chiave rifiutata', async () => {
    jsonOnce({ error: 'Forbidden' }, false, 403);
    await expect(fetchSteamLibrary('76561198015402862')).rejects.toThrow('403');
  });
});

describe('fetchSteamLibrary con un token', () => {
  const TOKEN = 'token-segreto';

  it('manda il token e non la chiave', async () => {
    jsonOnce({ response: { game_count: 0 } });

    await fetchSteamLibrary('76561198015402862', TOKEN);

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('access_token')).toBe(TOKEN);
    expect(url.searchParams.has('key')).toBe(false);
  });

  it('un rifiuto è un credenziale morto, e non porta il token nel messaggio', async () => {
    jsonOnce({}, false, 401);

    const error = await fetchSteamLibrary('76561198015402862', TOKEN).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(SteamUnauthorizedError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain(TOKEN);
  });
});

describe('fetchSteamFamilyLibrary', () => {
  const TOKEN = 'token-segreto';
  const ME = '76561198015402862';
  const OTHER = '76561198000000001';

  const group = { response: { family_groupid: '5101300' } };

  it('chiede il gruppo e poi le app, comprese quelle proprie', async () => {
    jsonOnce(group);
    jsonOnce({ response: { apps: [] } });

    await fetchSteamFamilyLibrary(TOKEN, ME);

    const [first, second] = fetchMock.mock.calls.map(
      (call) => new URL(String(call[0])),
    );
    expect(first!.pathname).toContain('GetFamilyGroupForUser');
    expect(first!.searchParams.get('access_token')).toBe(TOKEN);
    expect(first!.searchParams.get('steamid')).toBe(ME);

    expect(second!.pathname).toContain('GetSharedLibraryApps');
    expect(second!.searchParams.get('family_groupid')).toBe('5101300');
    // `false` non toglie le app che l'utente possiede anche lui: misurato.
    expect(second!.searchParams.get('include_own')).toBe('true');
    // Senza i flag che aprono esclusi, gratuiti e non-giochi.
    expect(second!.searchParams.has('include_excluded')).toBe(false);
  });

  it('traduce le app: proprietari, minuti, date e motivo di esclusione', async () => {
    jsonOnce(group);
    jsonOnce({
      response: {
        apps: [
          {
            appid: 220,
            name: ' Half-Life 2 ',
            owner_steamids: [OTHER, ME],
            exclude_reason: 0,
            rt_time_acquired: 1_731_888_000,
            rt_last_played: 1_700_000_000,
            rt_playtime: 90,
          },
          { appid: 90, exclude_reason: 3 },
        ],
      },
    });

    const { inGroup, apps } = await fetchSteamFamilyLibrary(TOKEN, ME);

    expect(inGroup).toBe(true);
    expect(apps[0]).toEqual({
      externalId: '220',
      name: 'Half-Life 2',
      ownerSteamIds: [OTHER, ME],
      // Zero vuol dire «nessun motivo»: non è un valore.
      excludeReason: null,
      playtimeMinutes: 90,
      lastPlayedAt: new Date(1_700_000_000 * 1000),
      acquiredAt: new Date(1_731_888_000 * 1000),
    });
    // Un'app senza nome, ore o date non si butta: l'appid è comunque l'identità.
    expect(apps[1]).toMatchObject({
      externalId: '90',
      name: 'App 90',
      ownerSteamIds: [],
      excludeReason: 3,
      playtimeMinutes: 0,
      lastPlayedAt: null,
      acquiredAt: null,
    });
  });

  it("tratta una data d'ultima partita antecedente al 2004 come «mai giocato»", async () => {
    // Playnite ha visto `1970-01-02` per i giochi giocati prima che Steam
    // registrasse le date: 86400 secondi, cioè un giorno dopo l'epoch.
    jsonOnce(group);
    jsonOnce({
      response: { apps: [{ appid: 70, rt_last_played: 86_400 }] },
    });

    const { apps } = await fetchSteamFamilyLibrary(TOKEN, ME);

    expect(apps[0]!.lastPlayedAt).toBeNull();
  });

  it('chi non sta in nessun gruppo ha la famiglia vuota, e non si chiedono le app', async () => {
    jsonOnce({ response: { is_not_member_of_any_group: true } });

    await expect(fetchSteamFamilyLibrary(TOKEN, ME)).resolves.toEqual({
      inGroup: false,
      joinedAt: null,
      apps: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un gruppo senza altri membri non è un errore', async () => {
    // Steam omette `apps` invece di mandare una lista vuota.
    jsonOnce(group);
    jsonOnce({ response: {} });

    await expect(fetchSteamFamilyLibrary(TOKEN, ME)).resolves.toEqual({
      inGroup: true,
      joinedAt: null,
      apps: [],
    });
  });

  it('un 401 è un rifiuto, anche se il corpo è una pagina HTML', async () => {
    // È ciò che Steam manda con la sola chiave o con un token che non vale: un
    // «Access is denied» in HTML, che letto come JSON darebbe un errore di
    // parsing senza dire cosa è successo.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
      text: async () => '<html><body>Access is denied.</body></html>',
    });

    const error = await fetchSteamFamilyLibrary(TOKEN, ME).catch((e) => e);

    expect(error).toBeInstanceOf(SteamUnauthorizedError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain(TOKEN);
  });

  it('un 500 è Steam in affanno, non un credenziale morto', async () => {
    jsonOnce({}, false, 500);

    const error = await fetchSteamFamilyLibrary(TOKEN, ME).catch((e) => e);

    expect(error).not.toBeInstanceOf(SteamUnauthorizedError);
    expect(error.message).toContain('500');
    expect(error.message).not.toContain(TOKEN);
  });

  it('un rifiuto sulla seconda chiamata è lo stesso rifiuto', async () => {
    jsonOnce(group);
    jsonOnce({}, false, 403);

    await expect(fetchSteamFamilyLibrary(TOKEN, ME)).rejects.toBeInstanceOf(
      SteamUnauthorizedError,
    );
  });
});

describe('fetchSteamWishlist', () => {
  const urlOf = () => fetchMock.mock.calls[0]![0] as URL;

  it('con la chiave manda la chiave e lo SteamID, e legge appid e data', async () => {
    jsonOnce({
      response: {
        items: [
          { appid: 1621690, priority: 0, date_added: 1791806181 },
          { appid: 499170, priority: 0 },
        ],
      },
    });

    const wishlist = await fetchSteamWishlist('76561198626785118');

    expect(urlOf().pathname).toBe('/IWishlistService/GetWishlist/v1');
    expect(urlOf().searchParams.get('key')).toBe('chiave-di-prova');
    expect(urlOf().searchParams.get('steamid')).toBe('76561198626785118');
    expect(urlOf().searchParams.has('access_token')).toBe(false);
    expect(wishlist).toEqual([
      {
        externalId: '1621690',
        // Il nome non c'è su Steam: si ripiega, come per la libreria.
        name: 'App 1621690',
        addedAt: new Date(1791806181 * 1000),
      },
      { externalId: '499170', name: 'App 499170', addedAt: null },
    ]);
  });

  it('col token manda il token e non la chiave', async () => {
    jsonOnce({ response: { items: [{ appid: 10, date_added: 1 }] } });

    await fetchSteamWishlist('76561198626785118', 'token-di-prova');

    expect(urlOf().searchParams.get('access_token')).toBe('token-di-prova');
    expect(urlOf().searchParams.has('key')).toBe(false);
  });

  it('una risposta vuota è una lista vuota: da qui non si distingue da «non visibile»', async () => {
    jsonOnce({ response: {} });
    await expect(fetchSteamWishlist('76561198626785118')).resolves.toEqual([]);
  });

  it('un rifiuto col token è il credenziale morto, con la chiave un errore qualunque', async () => {
    jsonOnce({}, false, 401);
    await expect(
      fetchSteamWishlist('76561198626785118', 'token-di-prova'),
    ).rejects.toBeInstanceOf(SteamUnauthorizedError);

    jsonOnce({}, false, 403);
    const error = await fetchSteamWishlist('76561198626785118').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SteamUnauthorizedError);
  });

  it('un errore del server non porta mai né la chiave né il token', async () => {
    jsonOnce({ error: 'giù' }, false, 500);
    const error = (await fetchSteamWishlist(
      '76561198626785118',
      'token-segreto',
    ).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain('500');
    expect(error.message).not.toContain('token-segreto');
    expect(error.message).not.toContain('chiave-di-prova');
  });
});

describe('fetchSteamOwnedAppIds', () => {
  const ME = '76561198626785118';

  it('manda il cookie dello store ricostruito dal token, e rende gli appid', async () => {
    jsonOnce({ rgOwnedApps: [238960, 230410], rgOwnedPackages: [0, 21357] });

    await expect(fetchSteamOwnedAppIds(ME, 'token.di.prova')).resolves.toEqual([
      '238960',
      '230410',
    ]);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://store.steampowered.com/dynamicstore/userdata/');
    expect((init.headers as Record<string, string>).cookie).toBe(
      `steamLoginSecure=${ME}%7C%7Ctoken.di.prova`,
    );
  });

  it('un account senza licenze oltre il pacchetto base è vuoto, non un errore', async () => {
    jsonOnce({ rgOwnedApps: [], rgOwnedPackages: [0] });
    await expect(fetchSteamOwnedAppIds(ME, 'token')).resolves.toEqual([]);
  });

  it('la risposta anonima, senza nemmeno il pacchetto base, è la sessione che non vale', async () => {
    jsonOnce({ rgOwnedApps: [], rgOwnedPackages: [] });
    await expect(fetchSteamOwnedAppIds(ME, 'token')).rejects.toBeInstanceOf(
      SteamUserDataError,
    );
  });

  it('una pagina HTML non è una libreria', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    await expect(fetchSteamOwnedAppIds(ME, 'token')).rejects.toBeInstanceOf(
      SteamUserDataError,
    );
  });

  it('un errore porta lo stato e mai il token', async () => {
    jsonOnce({}, false, 429);
    const error = (await fetchSteamOwnedAppIds(ME, 'token-segreto').catch(
      (e: unknown) => e,
    )) as Error;
    expect(error).toBeInstanceOf(SteamUserDataError);
    expect(error.message).toContain('429');
    expect(error.message).not.toContain('token-segreto');
  });
});

describe('fetchSteamAppTypes', () => {
  const inputOf = (call: number) =>
    JSON.parse(
      new URL(String(fetchMock.mock.calls[call]![0])).searchParams.get(
        'input_json',
      )!,
    ) as { ids: { appid: number }[] };

  it('chiede cento app per richiesta, senza chiave né token', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(1000 + i));
    jsonOnce({ response: { store_items: [] } });
    jsonOnce({ response: { store_items: [] } });

    await fetchSteamAppTypes(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(inputOf(0).ids).toHaveLength(100);
    expect(inputOf(1).ids[0]).toEqual({ appid: 1100 });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).not.toContain('key=');
    expect(url).not.toContain('access_token');
  });

  it('tiene tipo e nome delle app che Steam descrive, e lascia fuori le altre', async () => {
    jsonOnce({
      response: {
        store_items: [
          { appid: 238960, success: 1, type: 0, name: 'Path of Exile' },
          { appid: 439890, success: 1, type: 4, name: 'HITMAN™: Episode 2 ' },
          { appid: 5000760, success: 1, type: 1, name: '' },
          // Le app che lo store non descrive tornano senza appid.
          { success: 15 },
        ],
      },
    });

    const types = await fetchSteamAppTypes([
      '238960',
      '439890',
      '5000760',
      '1368430',
    ]);

    expect([...types.entries()]).toEqual([
      ['238960', { type: 0, name: 'Path of Exile' }],
      ['439890', { type: 4, name: 'HITMAN™: Episode 2' }],
      ['5000760', { type: 1, name: 'App 5000760' }],
    ]);
  });

  it('nessuna app, nessuna richiesta', async () => {
    await expect(fetchSteamAppTypes([])).resolves.toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un errore dello store si alza', async () => {
    jsonOnce({}, false, 503);
    await expect(fetchSteamAppTypes(['238960'])).rejects.toThrow('503');
  });
});

describe('fetchSteamAppCovers', () => {
  it('compone l’indirizzo della verticale dal formato dello store, o ripiega sull’orizzontale', async () => {
    jsonOnce({
      response: {
        store_items: [
          {
            appid: 5257350,
            success: 1,
            assets: {
              asset_url_format: 'steam/apps/5257350/${FILENAME}?t=1791363746',
              library_capsule: '0c22de2a/library_capsule.jpg',
              header: '0378ca94/header.jpg',
            },
          },
          {
            appid: 10,
            success: 1,
            assets: {
              asset_url_format: 'steam/apps/10/${FILENAME}',
              header: 'abc/header.jpg',
            },
          },
          // Ritirata dallo store: niente.
          { success: 15 },
        ],
      },
    });

    const covers = await fetchSteamAppCovers(['5257350', '10', '351040']);

    expect([...covers.entries()]).toEqual([
      [
        '5257350',
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/5257350/0c22de2a/library_capsule.jpg?t=1791363746',
      ],
      [
        '10',
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/abc/header.jpg',
      ],
    ]);
    const input = JSON.parse(
      new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get(
        'input_json',
      )!,
    ) as { data_request: unknown };
    expect(input.data_request).toEqual({ include_assets: true });
  });
});
