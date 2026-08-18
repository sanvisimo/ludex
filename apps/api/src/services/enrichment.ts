import { db, schema } from "@repo/db";
import { and, eq, sql } from "@repo/db/orm";

import { fetchIgdbGameMetadata, type IgdbAttribute } from "../external/igdb";

/**
 * Enrichment IGDB di un singolo gioco.
 *
 * Due proprieta' che il CLAUDE.md impone e che vanno lette insieme:
 *
 * - **per singola fonte**: questo tocca solo IGDB e solo la riga `game_sources`
 *   di IGDB. HLTB e OpenCritic avranno funzioni proprie e non si intralceranno.
 * - **idempotente**: rieseguirlo porta allo stesso stato, non ne accumula. Gli
 *   attributi si riscrivono in blocco, i campi si sovrascrivono.
 *
 * Non è un job monolitico proprio perché le fonti arrivano in step diversi e
 * vanno riaggiornate a ritmi diversi.
 */

async function markSource(
  gameId: string,
  status: "ok" | "failed",
  error: string | null,
) {
  const now = new Date();
  await db
    .insert(schema.gameSources)
    .values({
      gameId,
      source: "igdb",
      status,
      // `syncedAt` si muove solo sul successo: è il campo su cui si decide
      // cosa riaccodare, e un fallimento non deve far sembrare fresco un dato.
      syncedAt: status === "ok" ? now : null,
      attemptedAt: now,
      error,
    })
    .onConflictDoUpdate({
      target: [schema.gameSources.gameId, schema.gameSources.source],
      set: {
        status,
        attemptedAt: now,
        error,
        updatedAt: now,
        ...(status === "ok" ? { syncedAt: now } : {}),
      },
    });
}

/** Inserisce gli attributi mancanti nel vocabolario e restituisce i loro id. */
async function upsertAttributes(attributes: IgdbAttribute[]) {
  if (attributes.length === 0) return [] as number[];

  const rows = await db
    .insert(schema.igdbAttributes)
    .values(
      attributes.map((a) => ({ kind: a.kind, igdbId: a.igdbId, name: a.name })),
    )
    // Il nome su IGDB puo' cambiare: si aggiorna invece di ignorare il conflitto,
    // cosi' il vocabolario resta allineato senza righe duplicate.
    .onConflictDoUpdate({
      target: [schema.igdbAttributes.kind, schema.igdbAttributes.igdbId],
      set: { name: sql`excluded.name`, updatedAt: new Date() },
    })
    .returning({ id: schema.igdbAttributes.id });

  return rows.map((row) => row.id);
}

export type EnrichmentOutcome =
  | { status: "ok"; name: string; attributes: number }
  | { status: "skipped"; reason: string }
  | { status: "not_found" };

export async function enrichGameFromIgdb(
  gameId: string,
): Promise<EnrichmentOutcome> {
  const game = await db.query.games.findFirst({
    columns: { id: true, igdbId: true },
    where: eq(schema.games.id, gameId),
  });

  if (!game) return { status: "skipped", reason: "gioco inesistente" };

  // Un gioco inserito a mano non ha `igdbId`: non è un errore, è un gioco non
  // ancora risolto. Si annota e si esce senza segnare un fallimento, che
  // farebbe riprovare all'infinito qualcosa che non puo' riuscire.
  if (game.igdbId === null) {
    return { status: "skipped", reason: "gioco senza igdbId, non risolto" };
  }

  try {
    const metadata = await fetchIgdbGameMetadata(game.igdbId);

    if (!metadata) {
      await markSource(
        gameId,
        "failed",
        `IGDB non conosce l'id ${game.igdbId}`,
      );
      return { status: "not_found" };
    }

    const attributeIds = await upsertAttributes(metadata.attributes);

    await db.transaction(async (tx) => {
      await tx
        .update(schema.games)
        .set({
          name: metadata.name,
          summary: metadata.summary,
          firstReleaseDate: metadata.firstReleaseDate,
          coverImageId: metadata.coverImageId,
          coverWidth: metadata.coverWidth,
          coverHeight: metadata.coverHeight,
          aggregatedRating: metadata.aggregatedRating,
          aggregatedRatingCount: metadata.aggregatedRatingCount,
        })
        .where(eq(schema.games.id, gameId));

      // Riscrittura in blocco invece di un diff: è cio' che rende la funzione
      // idempotente, e gestisce da solo gli attributi tolti da IGDB.
      await tx
        .delete(schema.gameAttributes)
        .where(eq(schema.gameAttributes.gameId, gameId));

      if (attributeIds.length > 0) {
        await tx
          .insert(schema.gameAttributes)
          .values(attributeIds.map((attributeId) => ({ gameId, attributeId })));
      }
    });

    await markSource(gameId, "ok", null);
    return {
      status: "ok",
      name: metadata.name,
      attributes: attributeIds.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSource(gameId, "failed", message.slice(0, 500));
    // Rilanciato: è BullMQ a decidere se e quando riprovare.
    throw error;
  }
}

/** Giochi risolti che IGDB non ha mai arricchito con successo. */
export function findGamesNeedingIgdb(limit = 100) {
  return db
    .select({ id: schema.games.id })
    .from(schema.games)
    .leftJoin(
      schema.gameSources,
      and(
        eq(schema.gameSources.gameId, schema.games.id),
        eq(schema.gameSources.source, "igdb"),
      ),
    )
    .where(
      sql`${schema.games.igdbId} is not null and ${schema.gameSources.syncedAt} is null`,
    )
    .limit(limit);
}
