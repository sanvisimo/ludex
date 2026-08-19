import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSteamLibrary,
  resolveSteamId,
  SteamLibraryNotVisibleError,
  SteamProfileNotFoundError,
} from "./steam";

// Nessun test esce in rete: si stubba `fetch`, che qui è il confine vero — il
// modulo non ha altre dipendenze. La chiave la si finge, così la suite non
// dipende da credenziali vere.
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.STEAM_API_KEY = "chiave-di-prova";
  vi.stubGlobal("fetch", fetchMock);
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

describe("resolveSteamId", () => {
  it("prende uno SteamID64 così com'è, senza chiamare Steam", async () => {
    await expect(resolveSteamId("76561198015402862")).resolves.toBe("76561198015402862");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("estrae l'id dall'URL /profiles/", async () => {
    await expect(
      resolveSteamId("https://steamcommunity.com/profiles/76561198015402862/"),
    ).resolves.toBe("76561198015402862");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("risolve il nome scelto dall'URL /id/", async () => {
    jsonOnce({ response: { success: 1, steamid: "76561198015402862" } });

    await expect(resolveSteamId("https://steamcommunity.com/id/pippo")).resolves.toBe(
      "76561198015402862",
    );
    expect(String(fetchMock.mock.calls[0]![0])).toContain("vanityurl=pippo");
  });

  it("accetta anche il solo nome scelto", async () => {
    jsonOnce({ response: { success: 1, steamid: "76561198015402862" } });
    await expect(resolveSteamId("pippo")).resolves.toBe("76561198015402862");
  });

  it("segnala il nome che non esiste", async () => {
    // success 42 = nessuna corrispondenza, ma l'HTTP è 200: senza guardare il
    // corpo si finirebbe per salvare un account inesistente.
    jsonOnce({ response: { success: 42, message: "No match" } });
    await expect(resolveSteamId("nessuno")).rejects.toBeInstanceOf(SteamProfileNotFoundError);
  });

  it("rifiuta un URL /profiles/ che non contiene uno SteamID64", async () => {
    await expect(
      resolveSteamId("https://steamcommunity.com/profiles/non-un-id"),
    ).rejects.toBeInstanceOf(SteamProfileNotFoundError);
  });
});

describe("fetchSteamLibrary", () => {
  it("traduce le voci, con le ore e l'ultima partita", async () => {
    jsonOnce({
      response: {
        game_count: 1,
        games: [
          { appid: 220, name: "Half-Life 2", playtime_forever: 630, rtime_last_played: 1768521600 },
        ],
      },
    });

    await expect(fetchSteamLibrary("76561198015402862")).resolves.toEqual([
      {
        appId: "220",
        name: "Half-Life 2",
        playtimeMinutes: 630,
        lastPlayedAt: new Date(1768521600 * 1000),
      },
    ]);
  });

  it("tratta rtime_last_played a zero come 'mai giocato'", async () => {
    jsonOnce({
      response: { game_count: 1, games: [{ appid: 70, name: "Half-Life", rtime_last_played: 0 }] },
    });

    const [entry] = await fetchSteamLibrary("76561198015402862");
    expect(entry).toMatchObject({ playtimeMinutes: 0, lastPlayedAt: null });
  });

  it("distingue la libreria vuota dal profilo che non si può vedere", async () => {
    // Pubblica ma vuota: `game_count` c'è e vale 0.
    jsonOnce({ response: { game_count: 0 } });
    await expect(fetchSteamLibrary("76561198015402862")).resolves.toEqual([]);

    // Privata, dettagli nascosti o SteamID inesistente: corpo vuoto, HTTP 200.
    // Sono due cose che vanno dette all'utente in modo diverso.
    jsonOnce({ response: {} });
    await expect(fetchSteamLibrary("76561198015402862")).rejects.toBeInstanceOf(
      SteamLibraryNotVisibleError,
    );
  });

  it("solleva su chiave rifiutata", async () => {
    jsonOnce({ error: "Forbidden" }, false, 403);
    await expect(fetchSteamLibrary("76561198015402862")).rejects.toThrow("403");
  });
});
