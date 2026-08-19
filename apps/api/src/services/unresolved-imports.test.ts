import { db, schema } from "@repo/db";
import { eq } from "@repo/db/orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGame, createUser } from "../../test/factories";
import { findIgdbGameById } from "../external/igdb";
import {
  dismissUnresolvedImport,
  listUnresolvedImports,
  resolveUnresolvedImport,
} from "./unresolved-imports";

vi.mock("../external/igdb", () => ({ findIgdbGameById: vi.fn(), searchIgdbGames: vi.fn() }));
vi.mock("../queue/enrichment", () => ({ enqueueIgdbEnrichment: vi.fn() }));

const mockedFindById = vi.mocked(findIgdbGameById);

async function pending(userId: string, over: { externalId?: string; name?: string; playtimeMinutes?: number } = {}) {
  const [row] = await db
    .insert(schema.unresolvedImports)
    .values({
      userId,
      store: "steam",
      externalId: over.externalId ?? "931180",
      name: over.name ?? "Conan Exiles - Public Beta Client",
      playtimeMinutes: over.playtimeMinutes ?? null,
    })
    .returning({ id: schema.unresolvedImports.id });
  return row!.id;
}

describe("unresolved imports", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it("risolta, la voce diventa backlog e sparisce dagli scarti", async () => {
    const id = await pending(userId, { playtimeMinutes: 660 });
    mockedFindById.mockResolvedValue({
      igdbId: 555,
      name: "Dungeon Alchemist",
      releaseYear: null,
      developer: null,
      gameType: null,
    });

    const esito = await resolveUnresolvedImport(userId, id, 555);

    expect(esito.status).toBe("ok");
    expect(esito.entry).toMatchObject({
      game: { igdbId: 555 },
      ownerships: [{ platformSlug: "pc_windows", store: "steam", playtimeMinutes: 660 }],
    });
    expect(await listUnresolvedImports(userId)).toHaveLength(0);
  });

  it("scrive la mappatura, così l'appid resta risolto per tutti", async () => {
    const id = await pending(userId, { externalId: "1588530" });
    mockedFindById.mockResolvedValue({
      igdbId: 555,
      name: "Dungeon Alchemist",
      releaseYear: null,
      developer: null,
      gameType: null,
    });

    await resolveUnresolvedImport(userId, id, 555);

    // È la parte che conta più della riga di backlog: il prossimo import, suo o
    // di un altro utente, non ripassa da qui.
    expect(await db.select().from(schema.externalIds)).toMatchObject([
      { source: "steam", externalId: "1588530" },
    ]);
  });

  it("non tocca la voce di un altro utente", async () => {
    const altro = await createUser();
    const id = await pending(altro);

    await expect(resolveUnresolvedImport(userId, id, 555)).resolves.toMatchObject({
      status: "not_found",
    });
    await expect(dismissUnresolvedImport(userId, id)).resolves.toBeUndefined();
    expect(await listUnresolvedImports(altro)).toHaveLength(1);
  });

  it("rifiuta un igdbId che IGDB non conosce, senza consumare la voce", async () => {
    const id = await pending(userId);
    mockedFindById.mockResolvedValue(null);

    await expect(resolveUnresolvedImport(userId, id, 999_999)).resolves.toMatchObject({
      status: "unknown_igdb_id",
    });
    expect(await listUnresolvedImports(userId)).toHaveLength(1);
  });

  it("si rifiuta di risolvere lo scarto di un negozio senza piattaforma nota", async () => {
    const [row] = await db
      .insert(schema.unresolvedImports)
      .values({ userId, store: "gog", externalId: "1", name: "Qualcosa" })
      .returning({ id: schema.unresolvedImports.id });

    // Meglio fermarsi che archiviare un gioco GOG come se fosse su PC per
    // default: sarebbe un dato sbagliato scritto senza che nessuno se ne accorga.
    await expect(resolveUnresolvedImport(userId, row!.id, 555)).rejects.toThrow("gog");
  });

  it("scartata, la voce sparisce senza entrare nel backlog", async () => {
    const id = await pending(userId);

    await dismissUnresolvedImport(userId, id);

    expect(await listUnresolvedImports(userId)).toHaveLength(0);
    expect(await db.select().from(schema.backlog)).toHaveLength(0);
  });

  it("risolve su un gioco che esiste già senza duplicarlo", async () => {
    const game = await createGame({ igdbId: 555 });
    const id = await pending(userId);

    const esito = await resolveUnresolvedImport(userId, id, 555);

    expect(esito.status).toBe("ok");
    expect(await db.select().from(schema.games).where(eq(schema.games.igdbId, 555))).toHaveLength(1);
    expect(esito.status === "ok" && esito.entry?.game.id).toBe(game.id);
    // Il gioco c'era: non si ricontrolla su IGDB.
    expect(mockedFindById).not.toHaveBeenCalled();
  });
});
