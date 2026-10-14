import { db, schema } from '@repo/db';
import { and, eq, isNotNull, isNull, sql } from '@repo/db/orm';

import { fetchIgdbGamePlatforms } from '../external/igdb';

/**
 * Riempie `platform_igdb_ids` sui giochi che c'erano prima della colonna (9b
 * PSN).
 *
 * Gemello di `backfillGameTypes`: senza, quei giochi aspetterebbero il
 * rinfresco dell'enrichment IGDB — fino a trenta giorni — e la lista delle
 * copie su una console sbagliata resterebbe vuota fino ad allora. Qui si chiede
 * in blocco, 500 id per richiesta.
 *
 * Si ferma ai giochi **mai chiesti** (colonna nulla): da qui in avanti la
 * scrive l'enrichment. Un gioco che IGDB conosce ma senza piattaforme prende la
 * lista vuota, ed è chiuso; uno che IGDB non conosce più resta nullo e viene
 * ripescato al giro dopo, come per il tipo.
 */
export async function backfillGamePlatforms(limit = 1000) {
  const candidati = await db
    .select({ id: schema.games.id, igdbId: schema.games.igdbId })
    .from(schema.games)
    .where(
      and(isNotNull(schema.games.igdbId), isNull(schema.games.platformIgdbIds)),
    )
    .limit(limit);

  if (candidati.length === 0) {
    return { candidati: 0, trovati: 0, scritti: 0 };
  }

  const piattaforme = await fetchIgdbGamePlatforms(
    candidati.map((row) => row.igdbId!),
  );

  let scritti = 0;
  for (const gioco of candidati) {
    const ids = piattaforme.get(gioco.igdbId!);
    if (!ids) continue;

    await db
      .update(schema.games)
      .set({ platformIgdbIds: ids, updatedAt: new Date() })
      .where(eq(schema.games.id, gioco.id));
    scritti++;
  }

  return { candidati: candidati.length, trovati: piattaforme.size, scritti };
}

/** Quanti giochi hanno ancora bisogno del backfill: serve solo a dirlo. */
export async function countGamesWithoutPlatforms() {
  const [row] = await db
    .select({ quanti: sql<number>`count(*)::int` })
    .from(schema.games)
    .where(
      and(isNotNull(schema.games.igdbId), isNull(schema.games.platformIgdbIds)),
    );
  return row?.quanti ?? 0;
}
