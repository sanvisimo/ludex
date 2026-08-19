import { db, schema } from "@repo/db";
import { and, eq } from "@repo/db/orm";
import { describe, expect, it, vi } from "vitest";

import { ago, createGame, igdbMetadata, setSource } from "../../test/factories";
import { fetchIgdbGameMetadata } from "../external/igdb";
import { enrichGameFromIgdb } from "./igdb-enrichment";

// Stubbato al confine del servizio esterno e non su `fetch`: il client vero
// serializza le chiamate a 250ms l'una e si porta dietro un token in cache, due
// cose che in un test sono solo attesa e stato condiviso fra casi.
vi.mock("../external/igdb", () => ({ fetchIgdbGameMetadata: vi.fn() }));

// L'enrichment IGDB riuscito accoda quello HLTB: qui non deve toccare Redis.
vi.mock("../queue/enrichment", () => ({ enqueueEnrichment: vi.fn() }));

const mockedFetch = vi.mocked(fetchIgdbGameMetadata);

function sourceRow(gameId: string) {
  return db.query.gameSources.findFirst({
    where: and(eq(schema.gameSources.gameId, gameId), eq(schema.gameSources.source, "igdb")),
  });
}

function attributeNames(gameId: string) {
  return db
    .select({ name: schema.igdbAttributes.name })
    .from(schema.gameAttributes)
    .innerJoin(
      schema.igdbAttributes,
      eq(schema.igdbAttributes.id, schema.gameAttributes.attributeId),
    )
    .where(eq(schema.gameAttributes.gameId, gameId));
}

describe("enrichGameFromIgdb", () => {
  it("scrive i metadati, gli attributi e segna la fonte sincronizzata", async () => {
    const game = await createGame();
    mockedFetch.mockResolvedValue(
      igdbMetadata({
        name: "Pikmin 4",
        summary: "Un sommario",
        aggregatedRating: 87.5,
        attributes: [
          { kind: "genre", igdbId: 13, name: "Strategia" },
          { kind: "theme", igdbId: 17, name: "Fantasy" },
        ],
      }),
    );

    const esito = await enrichGameFromIgdb(game.id);

    expect(esito).toEqual({ status: "ok", name: "Pikmin 4", attributes: 2 });
    const salvato = await db.query.games.findFirst({ where: eq(schema.games.id, game.id) });
    expect(salvato).toMatchObject({ name: "Pikmin 4", summary: "Un sommario", aggregatedRating: 87.5 });
    expect(await sourceRow(game.id)).toMatchObject({ status: "ok" });
    expect((await sourceRow(game.id))?.syncedAt).toBeInstanceOf(Date);
  });

  it("rieseguito porta allo stesso stato invece di accumularlo", async () => {
    const game = await createGame();
    mockedFetch.mockResolvedValue(
      igdbMetadata({ attributes: [{ kind: "genre", igdbId: 13, name: "Strategia" }] }),
    );

    await enrichGameFromIgdb(game.id);
    await enrichGameFromIgdb(game.id);

    // È la proprietà che il CLAUDE.md impone all'enrichment: le fonti si
    // riaggiornano nel tempo, e un secondo giro non deve duplicare nulla.
    expect(await attributeNames(game.id)).toEqual([{ name: "Strategia" }]);
  });

  it("toglie gli attributi che IGDB non riporta più", async () => {
    const game = await createGame();
    mockedFetch.mockResolvedValue(
      igdbMetadata({
        attributes: [
          { kind: "genre", igdbId: 13, name: "Strategia" },
          { kind: "theme", igdbId: 17, name: "Fantasy" },
        ],
      }),
    );
    await enrichGameFromIgdb(game.id);

    mockedFetch.mockResolvedValue(
      igdbMetadata({ attributes: [{ kind: "genre", igdbId: 13, name: "Strategia" }] }),
    );
    await enrichGameFromIgdb(game.id);

    expect(await attributeNames(game.id)).toEqual([{ name: "Strategia" }]);
  });

  it("aggiorna il nome di un attributo rinominato su IGDB", async () => {
    const primo = await createGame();
    mockedFetch.mockResolvedValue(
      igdbMetadata({ attributes: [{ kind: "genre", igdbId: 13, name: "Strategy" }] }),
    );
    await enrichGameFromIgdb(primo.id);

    const secondo = await createGame();
    mockedFetch.mockResolvedValue(
      igdbMetadata({ attributes: [{ kind: "genre", igdbId: 13, name: "Strategia" }] }),
    );
    await enrichGameFromIgdb(secondo.id);

    // Un solo vocabolo, col nome nuovo: il conflitto su (kind, igdbId) aggiorna
    // invece di ignorare, o resterebbero due righe per lo stesso genere.
    expect(await attributeNames(primo.id)).toEqual([{ name: "Strategia" }]);
  });

  it("segna not_found quando IGDB non conosce l'id, senza sollevare", async () => {
    const game = await createGame();
    mockedFetch.mockResolvedValue(null);

    const esito = await enrichGameFromIgdb(game.id);

    // Non `failed`: riprovarlo non lo farebbe comparire, e la spazzata deve
    // poterlo lasciare in pace.
    expect(esito).toEqual({ status: "not_found" });
    expect(await sourceRow(game.id)).toMatchObject({ status: "not_found", syncedAt: null });
  });

  it("su un errore temporaneo segna failed, rilancia, e non tocca synced_at", async () => {
    const game = await createGame();
    const sincronizzato = ago.days(2);
    await setSource({
      gameId: game.id,
      status: "ok",
      syncedAt: sincronizzato,
      attemptedAt: sincronizzato,
    });
    mockedFetch.mockRejectedValue(new Error("IGDB games: 503"));

    // Rilanciato di proposito: è BullMQ a decidere se e quando riprovare.
    await expect(enrichGameFromIgdb(game.id)).rejects.toThrow("503");

    const riga = await sourceRow(game.id);
    expect(riga).toMatchObject({ status: "failed", error: "IGDB games: 503" });
    // Un fallimento non deve far sembrare fresco un dato vecchio, né vecchio un
    // dato fresco: `synced_at` resta dov'era.
    expect(riga?.syncedAt?.getTime()).toBe(sincronizzato.getTime());
    expect(riga?.attemptedAt?.getTime()).toBeGreaterThan(sincronizzato.getTime());
  });

  it("salta un gioco non risolto senza scrivere la fonte", async () => {
    const game = await createGame({ igdbId: null });

    const esito = await enrichGameFromIgdb(game.id);

    expect(esito).toMatchObject({ status: "skipped" });
    // Nessuna riga: segnarlo fallito lo farebbe riprovare in eterno, segnarlo
    // sincronizzato sarebbe una bugia.
    expect(await sourceRow(game.id)).toBeUndefined();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("salta un gioco inesistente", async () => {
    const esito = await enrichGameFromIgdb("00000000-0000-0000-0000-000000000000");
    expect(esito).toMatchObject({ status: "skipped" });
  });
});
