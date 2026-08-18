import { db, schema } from "@repo/db";
import { eq } from "@repo/db/orm";
import { describe, expect, it, vi } from "vitest";

import { createGame } from "../../test/factories";
import { findIgdbGameById } from "../external/igdb";
import { enqueueIgdbEnrichment } from "../queue/enrichment";
import { resolveGameFromIgdb } from "./games";

vi.mock("../external/igdb", () => ({ findIgdbGameById: vi.fn(), searchIgdbGames: vi.fn() }));
// Stubbata per non aprire Redis nei test: qui interessa *se* si accoda, non che
// BullMQ funzioni — quello è già suo.
vi.mock("../queue/enrichment", () => ({ enqueueIgdbEnrichment: vi.fn() }));

const mockedFindById = vi.mocked(findIgdbGameById);
const mockedEnqueue = vi.mocked(enqueueIgdbEnrichment);

const hit = (igdbId: number, name: string) => ({
  igdbId,
  name,
  releaseYear: null,
  developer: null,
  gameType: null,
});

describe("resolveGameFromIgdb", () => {
  it("riusa la riga esistente invece di crearne una seconda", async () => {
    const esistente = await createGame({ igdbId: 4242, name: "Hollow Knight" });

    const risolto = await resolveGameFromIgdb(4242);

    // È la regola che fa risparmiare l'enrichment quando il secondo utente
    // importa un gioco che il primo aveva già: `games` è condivisa.
    expect(risolto?.id).toBe(esistente.id);
    const righe = await db.select().from(schema.games).where(eq(schema.games.igdbId, 4242));
    expect(righe).toHaveLength(1);
    // Né si richiama IGDB, né si riaccoda: il lavoro è già stato pagato.
    expect(mockedFindById).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("crea la riga e accoda l'enrichment quando il gioco è nuovo", async () => {
    mockedFindById.mockResolvedValue(hit(777, "Celeste"));

    const risolto = await resolveGameFromIgdb(777);

    expect(risolto).toMatchObject({ igdbId: 777, name: "Celeste" });
    // L'accodamento sta nel servizio e non nella procedura oRPC perché vale per
    // qualunque strada porti a un gioco nuovo, import Steam compreso.
    expect(mockedEnqueue).toHaveBeenCalledWith(risolto!.id);
  });

  it("restituisce null se IGDB non conosce l'id", async () => {
    mockedFindById.mockResolvedValue(null);

    await expect(resolveGameFromIgdb(999_999)).resolves.toBeNull();
    expect(await db.select().from(schema.games)).toHaveLength(0);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});
