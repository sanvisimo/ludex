import { db, schema } from "@repo/db";
import { and, eq } from "@repo/db/orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGame,
  hltbDetail,
  hltbHit,
  linkSteamAppId,
  setSource,
} from "../../test/factories";
import { fetchHltbGameDetail, searchHltbGames } from "../external/hltb";
import { enrichGameFromHltb } from "./hltb-enrichment";

// Stubbato al confine del modulo esterno e non su `fetch`: il client vero
// distanzia le chiamate di un terzo di secondo e si porta dietro una sessione in
// cache, due cose che in un test sono solo attesa e stato condiviso fra casi.
vi.mock("../external/hltb", () => ({
  searchHltbGames: vi.fn(),
  fetchHltbGameDetail: vi.fn(),
}));

const mockedSearch = vi.mocked(searchHltbGames);
const mockedDetail = vi.mocked(fetchHltbGameDetail);

beforeEach(() => {
  mockedSearch.mockReset();
  mockedDetail.mockReset();
});

function sourceRow(gameId: string) {
  return db.query.gameSources.findFirst({
    where: and(eq(schema.gameSources.gameId, gameId), eq(schema.gameSources.source, "hltb")),
  });
}

function gameRow(gameId: string) {
  return db.query.games.findFirst({ where: eq(schema.games.id, gameId) });
}

const anno = (year: number) => new Date(Date.UTC(year, 0, 1));

describe("enrichGameFromHltb", () => {
  it("scrive le durate e aggancia l'id della fonte", async () => {
    const game = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    mockedSearch.mockResolvedValue([hltbHit()]);
    mockedDetail.mockResolvedValue(hltbDetail());

    const esito = await enrichGameFromHltb(game.id);

    expect(esito).toMatchObject({ status: "ok", hltbId: 26286, via: "nome" });
    expect(await gameRow(game.id)).toMatchObject({
      hltbMainMinutes: 1621,
      hltbCompletionistMinutes: 3936,
      hltbMainCount: 2739,
      hltbHasSolo: true,
      hltbHasVersus: false,
    });
    expect(await sourceRow(game.id)).toMatchObject({ status: "ok", externalId: "26286" });
  });

  it("dal secondo giro va dritto alla pagina, senza rifare la ricerca", async () => {
    const game = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    await setSource({ gameId: game.id, source: "hltb", status: "ok", externalId: "26286" });
    mockedDetail.mockResolvedValue(hltbDetail({ mainMinutes: 1700 }));

    const esito = await enrichGameFromHltb(game.id);

    // È tutto il senso di salvare l'id: la ricerca per nome è la parte cara e
    // l'unica che può sbagliare, e rifarla ogni sei mesi sarebbe rigiocarsi il
    // match ogni volta.
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(esito).toMatchObject({ status: "ok", via: "id" });
    expect(await gameRow(game.id)).toMatchObject({ hltbMainMinutes: 1700 });
  });

  it("rifà la ricerca se la voce agganciata non esiste più", async () => {
    const game = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    await setSource({ gameId: game.id, source: "hltb", status: "ok", externalId: "999999" });
    // HLTB fonde i doppioni ogni tanto: la pagina sparisce.
    mockedDetail.mockResolvedValueOnce(null);
    mockedSearch.mockResolvedValue([hltbHit()]);
    mockedDetail.mockResolvedValue(hltbDetail());

    const esito = await enrichGameFromHltb(game.id);

    expect(esito).toMatchObject({ status: "ok", hltbId: 26286 });
    expect(await sourceRow(game.id)).toMatchObject({ externalId: "26286" });
  });

  it("aggancia grazie all'appid Steam anche quando il nome non convincerebbe", async () => {
    const game = await createGame({ name: "Nome Che Non Somiglia", firstReleaseDate: anno(2017) });
    await linkSteamAppId(game.id, "367520");
    mockedSearch.mockResolvedValue([hltbHit()]);
    mockedDetail.mockResolvedValue(hltbDetail({ steamAppIds: ["367520"] }));

    const esito = await enrichGameFromHltb(game.id);

    // L'appid è un confronto esatto fra identità: vale più di qualunque
    // punteggio sul nome, ed è ciò che recupera i titoli scritti diversamente
    // dai due cataloghi.
    expect(esito).toMatchObject({ status: "ok", via: "steam" });
    expect(await sourceRow(game.id)).toMatchObject({ status: "ok", externalId: "26286" });
  });

  it("riconosce il gioco anche sull'appid alternativo", async () => {
    const game = await createGame({ name: "BioShock 2", firstReleaseDate: anno(2010) });
    // Il nostro possesso è l'edizione originale; HLTB dichiara per prima la
    // remaster e tiene la nostra come alternativa.
    await linkSteamAppId(game.id, "8850");
    mockedSearch.mockResolvedValue([hltbHit({ hltbId: 1066, name: "BioShock 2", releaseYear: 2010 })]);
    mockedDetail.mockResolvedValue(
      hltbDetail({ hltbId: 1066, name: "BioShock 2", steamAppIds: ["409720", "8850"] }),
    );

    const esito = await enrichGameFromHltb(game.id);

    expect(esito).toMatchObject({ status: "ok", via: "steam" });
  });

  it("un appid diverso non smentisce il match, decide comunque il nome", async () => {
    const game = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    await linkSteamAppId(game.id, "367520");
    mockedSearch.mockResolvedValue([hltbHit()]);
    // Su Steam lo stesso gioco può avere più schede e IGDB ne mappa una sola:
    // trattare la differenza come una smentita butterebbe via match giusti.
    mockedDetail.mockResolvedValue(hltbDetail({ steamAppIds: ["111111"] }));

    const esito = await enrichGameFromHltb(game.id);

    expect(esito).toMatchObject({ status: "ok", via: "nome" });
  });

  it("segna not_found quando la ricerca non torna niente", async () => {
    const game = await createGame({ name: "Gioco Ignoto" });
    mockedSearch.mockResolvedValue([]);

    const esito = await enrichGameFromHltb(game.id);

    expect(esito).toMatchObject({ status: "not_found", reason: "nessun risultato" });
    expect(await sourceRow(game.id)).toMatchObject({ status: "not_found", syncedAt: null });
  });

  it("riprova col titolo accorciato quando la ricerca non torna niente", async () => {
    const game = await createGame({
      name: "The Witcher: Enhanced Edition Director's Cut",
      firstReleaseDate: anno(2008),
    });
    // HLTB cerca in AND su tutti i termini: sul titolo intero non trova nulla.
    mockedSearch.mockResolvedValueOnce([]);
    mockedSearch.mockResolvedValueOnce([
      hltbHit({ hltbId: 10267, name: "The Witcher", releaseYear: 2007 }),
      hltbHit({ hltbId: 10270, name: "The Witcher 3: Wild Hunt", releaseYear: 2015 }),
    ]);
    mockedDetail.mockResolvedValue(hltbDetail({ hltbId: 10267, name: "The Witcher" }));

    const esito = await enrichGameFromHltb(game.id);

    expect(mockedSearch).toHaveBeenNthCalledWith(2, "the witcher");
    // `via` distinto: è un match su un titolo troncato, e non deve sembrare
    // sicuro quanto gli altri.
    expect(esito).toMatchObject({ status: "ok", hltbId: 10267, via: "titolo-corto" });
  });

  it("non riprova quando l'anno non lo sappiamo", async () => {
    const game = await createGame({ name: "The Witcher: Enhanced Edition Director's Cut" });
    mockedSearch.mockResolvedValue([]);

    await enrichGameFromHltb(game.id);

    // Il titolo accorciato si confronta con sé stesso, quindi è più lasco per
    // costruzione: senza anno non resterebbe niente a verificare la scelta.
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });

  it("non riprova quando la ricerca ha dato candidati, solo poco convincenti", async () => {
    const game = await createGame({ name: "Resident Evil 4", firstReleaseDate: anno(2005) });
    mockedSearch.mockResolvedValue([
      hltbHit({ hltbId: 108881, name: "Resident Evil 4", releaseYear: 2023 }),
      hltbHit({ hltbId: 7720, name: "Resident Evil 4", releaseYear: 2005 }),
    ]);

    await enrichGameFromHltb(game.id);

    // "Nessuno convince" è un giudizio già dato: rifare la domanda più larga per
    // ottenere candidati più molli sarebbe cambiare le carte in tavola.
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });

  it("dice anche il titolo accorciato quando falliscono entrambi", async () => {
    const game = await createGame({
      name: "Gabriel Knight 3: Blood of the Sacred",
      firstReleaseDate: anno(1999),
    });
    mockedSearch.mockResolvedValue([]);

    await enrichGameFromHltb(game.id);

    // Senza, dalla admin sembrerebbe che il secondo tentativo non sia stato fatto.
    expect((await sourceRow(game.id))?.error).toContain("Gabriel Knight 3");
  });

  it("segna not_found coi candidati scartati, quando nessuno convince", async () => {
    const game = await createGame({ name: "Resident Evil 4" });
    mockedSearch.mockResolvedValue([
      hltbHit({ hltbId: 108881, name: "Resident Evil 4", releaseYear: 2023 }),
      hltbHit({ hltbId: 7720, name: "Resident Evil 4", releaseYear: 2005 }),
    ]);

    const esito = await enrichGameFromHltb(game.id);

    expect(esito).toMatchObject({ status: "not_found", reason: "candidati non convincenti" });
    // L'errore porta con sé i candidati e il loro punteggio: è ciò che un
    // domani permette di sistemare il caso a mano invece di ripartire da zero.
    expect((await sourceRow(game.id))?.error).toContain("108881");
    expect(mockedDetail).not.toHaveBeenCalled();
  });

  it("rifiuta di agganciare una voce già presa da un altro gioco", async () => {
    const primo = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    await setSource({ gameId: primo.id, source: "hltb", status: "ok", externalId: "26286" });

    const secondo = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    mockedSearch.mockResolvedValue([hltbHit()]);
    mockedDetail.mockResolvedValue(hltbDetail());

    const esito = await enrichGameFromHltb(secondo.id);

    // Due nostri giochi non possono essere la stessa voce HLTB. Il conflitto
    // sull'unique non è un guasto: è il segnale che il match è sbagliato.
    expect(esito).toMatchObject({ status: "not_found" });
    expect(await sourceRow(secondo.id)).toMatchObject({ status: "not_found", externalId: null });
    // E il gioco che l'aveva davvero non è stato toccato.
    expect(await sourceRow(primo.id)).toMatchObject({ externalId: "26286" });
    expect(await gameRow(secondo.id)).toMatchObject({ hltbMainMinutes: null });
  });

  it("rieseguito porta allo stesso stato invece di accumularlo", async () => {
    const game = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    mockedSearch.mockResolvedValue([hltbHit()]);
    mockedDetail.mockResolvedValue(hltbDetail());

    await enrichGameFromHltb(game.id);
    await enrichGameFromHltb(game.id);

    const righe = await db
      .select()
      .from(schema.gameSources)
      .where(eq(schema.gameSources.gameId, game.id));
    expect(righe).toHaveLength(1);
    expect(await gameRow(game.id)).toMatchObject({ hltbMainMinutes: 1621 });
  });

  it("salva i flag di un gioco che non ha una fine", async () => {
    const game = await createGame({ name: "Counter-Strike 2", firstReleaseDate: anno(2012) });
    mockedSearch.mockResolvedValue([
      hltbHit({ hltbId: 1957, name: "Counter-Strike 2", type: "multi", releaseYear: 2012 }),
    ]);
    mockedDetail.mockResolvedValue(
      hltbDetail({
        hltbId: 1957,
        name: "Counter-Strike 2",
        mainMinutes: 8574,
        hasSolo: false,
        hasCoop: false,
        hasVersus: true,
      }),
    );

    await enrichGameFromHltb(game.id);

    // Le 143 ore di "storia principale" di Counter-Strike sono tempo investito,
    // non una durata. Senza i flag la colonna direbbe il contrario, e allo
    // step 7 quel numero finirebbe in un filtro sul tempo disponibile.
    expect(await gameRow(game.id)).toMatchObject({
      hltbMainMinutes: 8574,
      hltbHasSolo: false,
      hltbHasVersus: true,
    });
  });

  it("su un errore temporaneo segna failed, rilancia, e non scollega l'aggancio", async () => {
    const game = await createGame({ name: "Hollow Knight", firstReleaseDate: anno(2017) });
    await setSource({ gameId: game.id, source: "hltb", status: "ok", externalId: "26286" });
    mockedDetail.mockRejectedValue(new Error("HLTB gioco 26286: 503"));

    await expect(enrichGameFromHltb(game.id)).rejects.toThrow("503");

    const riga = await sourceRow(game.id);
    expect(riga).toMatchObject({ status: "failed", error: "HLTB gioco 26286: 503" });
    // Un timeout non deve far dimenticare un aggancio che era stato trovato:
    // il prossimo tentativo deve ripartire dalla pagina, non dalla ricerca.
    expect(riga?.externalId).toBe("26286");
  });

  it("salta un gioco inesistente", async () => {
    const esito = await enrichGameFromHltb("00000000-0000-0000-0000-000000000000");
    expect(esito).toMatchObject({ status: "skipped" });
  });
});
