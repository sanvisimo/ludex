import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSteamFamilyLibrary,
  fetchSteamLibrary,
  resolveSteamId,
  SteamLibraryNotVisibleError,
  SteamProfileNotFoundError,
  SteamUnauthorizedError,
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
