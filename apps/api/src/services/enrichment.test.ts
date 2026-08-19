import { describe, expect, it } from "vitest";

import { ago, createGame, setSource } from "../../test/factories";
import { findGamesNeedingSource } from "./enrichment";

describe("findGamesNeedingSource", () => {
  // I casi che decidono cosa la spazzata riaccoda. Il predicato è l'unico punto
  // in cui "il dato è vecchio" e "il tentativo è fallito" si incontrano, e
  // sbagliarlo non rompe niente in modo visibile: la coda resta solo zitta.
  const casi = [
    { nome: "mai tentato", source: null, atteso: true },
    {
      nome: "sincronizzato di recente",
      source: { status: "ok" as const, syncedAt: ago.days(5), attemptedAt: ago.days(5) },
      atteso: false,
    },
    {
      nome: "sincronizzato oltre la soglia di freschezza",
      source: { status: "ok" as const, syncedAt: ago.days(40), attemptedAt: ago.days(40) },
      atteso: true,
    },
    {
      nome: "fallito poco fa",
      source: { status: "failed" as const, attemptedAt: ago.hours(1) },
      atteso: false,
    },
    {
      nome: "fallito da più di un giorno",
      source: { status: "failed" as const, attemptedAt: ago.hours(30) },
      atteso: true,
    },
    {
      nome: "not_found, anche vecchissimo",
      source: { status: "not_found" as const, attemptedAt: ago.days(40) },
      atteso: false,
    },
  ];

  for (const caso of casi) {
    it(`${caso.atteso ? "prende" : "salta"} un gioco ${caso.nome}`, async () => {
      const game = await createGame();
      if (caso.source) await setSource({ gameId: game.id, ...caso.source });

      const trovati = await findGamesNeedingSource("igdb");

      expect(trovati.map((row) => row.id)).toEqual(caso.atteso ? [game.id] : []);
    });
  }

  it("mette davanti i mai sincronizzati, poi dal più vecchio", async () => {
    const recente = await createGame();
    await setSource({ gameId: recente.id, status: "ok", syncedAt: ago.days(31) });
    const vecchio = await createGame();
    await setSource({ gameId: vecchio.id, status: "ok", syncedAt: ago.days(90) });
    const mai = await createGame();

    const trovati = await findGamesNeedingSource("igdb");

    // Senza ordinamento, con più candidati del limite le stesse righe possono
    // ripresentarsi a ogni giro e lasciarne altre a digiuno per sempre.
    expect(trovati.map((row) => row.id)).toEqual([mai.id, vecchio.id, recente.id]);
  });

  it("rispetta il limite", async () => {
    await createGame();
    await createGame();
    await expect(findGamesNeedingSource("igdb", 1)).resolves.toHaveLength(1);
  });

  it("salta un gioco non risolto, che non ha nulla da chiedere a IGDB", async () => {
    await createGame({ igdbId: null });
    await expect(findGamesNeedingSource("igdb")).resolves.toEqual([]);
  });
});

describe("findGamesNeedingSource, dipendenze fra fonti", () => {
  // HLTB si aggancia per nome e anno, e li ha solo dopo IGDB. Se il predicato
  // lasciasse passare un gioco non ancora arricchito, il match partirebbe dal
  // titolo digitato dall'utente e senza anno: esattamente le condizioni in cui
  // sbaglia.
  it("non prende per HLTB un gioco che IGDB non ha ancora arricchito", async () => {
    const game = await createGame();
    await expect(findGamesNeedingSource("hltb")).resolves.toEqual([]);

    await setSource({ gameId: game.id, status: "ok", syncedAt: new Date() });

    await expect(findGamesNeedingSource("hltb")).resolves.toEqual([{ id: game.id }]);
  });

  it("non prende per HLTB un gioco su cui IGDB è fallito", async () => {
    const game = await createGame();
    await setSource({ gameId: game.id, status: "failed", attemptedAt: new Date() });

    await expect(findGamesNeedingSource("hltb")).resolves.toEqual([]);
  });

  it("rispetta la soglia di freschezza di HLTB, che non è quella di IGDB", async () => {
    const game = await createGame();
    await setSource({ gameId: game.id, status: "ok", syncedAt: new Date() });
    // Oltre i trenta giorni di IGDB, ben dentro i centottanta di HLTB.
    await setSource({
      gameId: game.id,
      source: "hltb",
      status: "ok",
      syncedAt: ago.days(60),
      attemptedAt: ago.days(60),
    });

    await expect(findGamesNeedingSource("hltb")).resolves.toEqual([]);

    await setSource({
      gameId: game.id,
      source: "hltb",
      status: "ok",
      syncedAt: ago.days(200),
      attemptedAt: ago.days(200),
    });

    await expect(findGamesNeedingSource("hltb")).resolves.toEqual([{ id: game.id }]);
  });
});
