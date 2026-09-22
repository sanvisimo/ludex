import { db, schema } from '@repo/db';
import { and, eq, isNotNull, isNull, sql } from '@repo/db/orm';

import { fetchIgdbGameTypes } from '../external/igdb';

/**
 * Riempie `game_type` e `parent_igdb_id` sui giochi che c'erano prima delle due
 * colonne.
 *
 * Senza, quei giochi aspetterebbero il rinfresco naturale dell'enrichment IGDB
 * — fino a trenta giorni — per dire una cosa che IGDB sa già. Qui si chiede in
 * blocco, 500 id per richiesta: su un catalogo vero sono una manciata di
 * richieste, non una per gioco.
 *
 * Si ferma ai giochi **senza tipo**: da qui in avanti lo scrive l'enrichment,
 * che passa comunque, e questo arnese non ha più niente da fare. Un gioco che
 * IGDB non conosce più resta senza tipo e viene ripescato al giro dopo: è
 * vero, non lo sappiamo, e non vale una colonna per ricordarselo.
 */
export async function backfillGameTypes(limit = 1000) {
  const candidati = await db
    .select({ id: schema.games.id, igdbId: schema.games.igdbId })
    .from(schema.games)
    .where(and(isNotNull(schema.games.igdbId), isNull(schema.games.gameType)))
    .limit(limit);

  if (candidati.length === 0) {
    return { candidati: 0, trovati: 0, scritti: 0 };
  }

  const tipi = await fetchIgdbGameTypes(
    candidati.map((row) => row.igdbId!).filter((id) => id !== null),
  );

  let scritti = 0;
  for (const gioco of candidati) {
    const tipo = tipi.get(gioco.igdbId!);
    // `gameType` nullo vuol dire che IGDB ha un tipo che noi non traduciamo:
    // scriverlo sarebbe scrivere «non lo so» sopra «non lo so», e al prossimo
    // giro il gioco tornerebbe candidato comunque.
    if (!tipo?.gameType) continue;

    await db
      .update(schema.games)
      .set({
        gameType: tipo.gameType,
        parentIgdbId: tipo.parentIgdbId,
        updatedAt: new Date(),
      })
      .where(eq(schema.games.id, gioco.id));
    scritti++;
  }

  return { candidati: candidati.length, trovati: tipi.size, scritti };
}

/** Quanti giochi hanno ancora bisogno del backfill: serve solo a dirlo. */
export async function countGamesWithoutType() {
  const [row] = await db
    .select({ quanti: sql<number>`count(*)::int` })
    .from(schema.games)
    .where(and(isNotNull(schema.games.igdbId), isNull(schema.games.gameType)));
  return row?.quanti ?? 0;
}
