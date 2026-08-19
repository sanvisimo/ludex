import { db, schema } from "@repo/db";
import { eq } from "@repo/db/orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGame, createUser, linkSteamAccount as seedAccount } from "../../test/factories";
import { resolveSteamId } from "../external/steam";
import { isSteamImportRunning } from "../queue/imports";
import {
  linkSteamAccount,
  listStoreAccounts,
  unlinkSteamAccount,
} from "./store-accounts";

vi.mock("../external/steam", () => ({ resolveSteamId: vi.fn() }));
vi.mock("../queue/imports", () => ({ isSteamImportRunning: vi.fn() }));

const mockedResolve = vi.mocked(resolveSteamId);
const mockedRunning = vi.mocked(isSteamImportRunning);

describe("account di negozio", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
    mockedRunning.mockResolvedValue(false);
  });

  it("collega risolvendo quello che l'utente ha incollato", async () => {
    mockedResolve.mockResolvedValue("76561198015402862");

    const account = await linkSteamAccount(userId, "https://steamcommunity.com/id/pippo");

    expect(account).toMatchObject({ store: "steam", externalAccountId: "76561198015402862" });
  });

  it("ricollegando sovrascrive e dimentica l'ultima importazione", async () => {
    mockedResolve.mockResolvedValue("76561190000000001");
    await linkSteamAccount(userId, "primo");
    await db
      .update(schema.storeAccounts)
      .set({ lastSyncAt: new Date() })
      .where(eq(schema.storeAccounts.userId, userId));

    mockedResolve.mockResolvedValue("76561190000000002");
    const account = await linkSteamAccount(userId, "secondo");

    // Un utente che si accorge di aver messo il profilo sbagliato deve poter
    // correggere senza scollegare prima; e la libreria di prima non è questa.
    expect(account).toMatchObject({ externalAccountId: "76561190000000002", lastSyncAt: null });
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(1);
  });

  it("scollegando lascia i giochi nel backlog e toglie gli scarti", async () => {
    await seedAccount(userId);
    const game = await createGame();
    await db.insert(schema.backlog).values({ userId, gameId: game.id });
    await db.insert(schema.unresolvedImports).values({
      userId,
      store: "steam",
      externalId: "931180",
      name: "Conan Exiles - Public Beta Client",
    });

    await unlinkSteamAccount(userId);

    // I giochi importati restano suoi, come se li avesse inseriti a mano.
    expect(await db.select().from(schema.backlog)).toHaveLength(1);
    // Gli scarti invece senza l'account non vogliono più dire niente.
    expect(await db.select().from(schema.unresolvedImports)).toHaveLength(0);
    expect(await db.select().from(schema.storeAccounts)).toHaveLength(0);
  });

  it("dice se c'è un import in corso, leggendolo dalla coda", async () => {
    await seedAccount(userId);
    mockedRunning.mockResolvedValue(true);

    await expect(listStoreAccounts(userId)).resolves.toMatchObject([{ syncing: true }]);
  });

  it("non mostra gli account di altri utenti", async () => {
    await seedAccount(await createUser());
    await expect(listStoreAccounts(userId)).resolves.toEqual([]);
  });
});
