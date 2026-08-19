import { db, schema } from "@repo/db";
import { and, eq } from "@repo/db/orm";

import { resolveSteamId } from "../external/steam";
import { isSteamImportRunning } from "../queue/imports";

/**
 * Gli account di negozio collegati dall'utente.
 *
 * `syncing` non viene dal DB ma dalla coda: durante il primo import `lastSyncAt`
 * è ancora nullo, e senza questo la pagina non avrebbe niente da mostrare per
 * mezzo minuto.
 */
export async function listStoreAccounts(userId: string) {
  const rows = await db
    .select({
      store: schema.storeAccounts.store,
      externalAccountId: schema.storeAccounts.externalAccountId,
      lastSyncAt: schema.storeAccounts.lastSyncAt,
    })
    .from(schema.storeAccounts)
    .where(eq(schema.storeAccounts.userId, userId));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      syncing: row.store === "steam" ? await isSteamImportRunning(userId) : false,
    })),
  );
}

export function findSteamAccount(userId: string) {
  return db.query.storeAccounts.findFirst({
    where: and(eq(schema.storeAccounts.userId, userId), eq(schema.storeAccounts.store, "steam")),
  });
}

/**
 * Collega Steam a partire da quello che l'utente ha incollato.
 *
 * Ricollegare sovrascrive: un utente che si accorge di aver messo il profilo
 * sbagliato deve poter correggere senza scollegare prima. `lastSyncAt` torna
 * nullo, perché la libreria di prima non è quella di adesso.
 */
export async function linkSteamAccount(userId: string, profile: string) {
  const steamId = await resolveSteamId(profile);

  const [row] = await db
    .insert(schema.storeAccounts)
    .values({ userId, store: "steam", externalAccountId: steamId })
    .onConflictDoUpdate({
      target: [schema.storeAccounts.userId, schema.storeAccounts.store],
      set: { externalAccountId: steamId, lastSyncAt: null, updatedAt: new Date() },
    })
    .returning({
      store: schema.storeAccounts.store,
      externalAccountId: schema.storeAccounts.externalAccountId,
      lastSyncAt: schema.storeAccounts.lastSyncAt,
    });

  return row!;
}

/**
 * Scollega Steam.
 *
 * Non tocca il backlog: i giochi importati restano dell'utente, come se li avesse
 * inseriti a mano. Toglie invece gli irrisolti di quel negozio, che senza
 * l'account collegato non vogliono più dire niente.
 */
export async function unlinkSteamAccount(userId: string) {
  await db
    .delete(schema.unresolvedImports)
    .where(
      and(
        eq(schema.unresolvedImports.userId, userId),
        eq(schema.unresolvedImports.store, "steam"),
      ),
    );

  const [row] = await db
    .delete(schema.storeAccounts)
    .where(and(eq(schema.storeAccounts.userId, userId), eq(schema.storeAccounts.store, "steam")))
    .returning({ id: schema.storeAccounts.id });

  return row;
}
