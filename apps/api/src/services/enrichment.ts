import { db, schema } from "@repo/db";
import { and, eq, isNull, lt, ne, or, sql } from "@repo/db/orm";

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

/**
 * Dopo quanto un dato IGDB già preso va ripreso. Voti, copertine e sommari si
 * muovono, ma piano: sotto il mese si spenderebbero chiamate per riscrivere le
 * stesse righe. HLTB allo step 6 avrà la sua soglia, nel suo modulo — le fonti
 * non invecchiano allo stesso ritmo.
 */
const IGDB_STALE_AFTER_DAYS = 30;

/**
 * Quanto aspettare prima di ritentare un fallimento temporaneo. La spazzata gira
 * ogni sei ore: senza questa attesa riaccoderebbe lo stesso gioco rotto a ogni
 * giro. Sotto le sei ore il valore non cambierebbe nulla.
 */
const IGDB_RETRY_AFTER_HOURS = 24;

async function markSource(
  gameId: string,
  status: "ok" | "failed" | "not_found",
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
      // Non `failed`: riprovarlo non lo farà comparire. Si riapre per evento,
      // quando l'`igdbId` del gioco cambia — cosa che diventa possibile allo
      // step 5, con la modifica del gioco.
      await markSource(gameId, "not_found", `IGDB non conosce l'id ${game.igdbId}`);
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

/**
 * Giochi risolti da (ri)arricchire con IGDB.
 *
 * «Da riarricchire» non è «mai arricchito»: un gioco sincronizzato mesi fa è un
 * candidato quanto uno mai visto, altrimenti la coda va in quiescenza appena il
 * primo giro finisce e i dati invecchiano senza che nessuno lo dica.
 *
 * Tre cose del predicato che non sono ovvie rileggendolo:
 *
 * - il ramo `game_sources.game_id IS NULL` è obbligatorio, non difensivo. Con la
 *   LEFT JOIN, su un gioco mai tentato tutte le colonne di `game_sources` sono
 *   NULL, e `status <> 'not_found'` vale NULL: senza questo ramo i giochi nuovi —
 *   quelli che servono di più — spariscono dal risultato.
 * - `attempted_at` governa i fallimenti temporanei. `synced_at` da solo non basta:
 *   su un gioco che fallisce resta indietro, e la spazzata lo riaccoderebbe ogni
 *   sei ore.
 * - l'ordinamento non è cosmetico. Se i candidati sono più del limite, senza
 *   ORDER BY Postgres può restituire le stesse righe a ogni giro e lasciarne
 *   altre a digiuno per sempre. `nulls first` mette davanti i mai sincronizzati.
 */
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
      and(
        // Un gioco non risolto non ha nulla da chiedere a IGDB.
        sql`${schema.games.igdbId} is not null`,
        or(
          isNull(schema.gameSources.gameId),
          and(
            ne(schema.gameSources.status, "not_found"),
            or(
              isNull(schema.gameSources.syncedAt),
              lt(
                schema.gameSources.syncedAt,
                sql`now() - ${IGDB_STALE_AFTER_DAYS} * interval '1 day'`,
              ),
            ),
            or(
              isNull(schema.gameSources.attemptedAt),
              lt(
                schema.gameSources.attemptedAt,
                sql`now() - ${IGDB_RETRY_AFTER_HOURS} * interval '1 hour'`,
              ),
            ),
          ),
        ),
      ),
    )
    // `sql` grezzo e non `asc()`: quello avvolge l'espressione e produrrebbe
    // `synced_at nulls first asc`, che Postgres rifiuta.
    .orderBy(sql`${schema.gameSources.syncedAt} asc nulls first`)
    .limit(limit);
}
