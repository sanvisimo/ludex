import { db, schema } from '@repo/db';
import { and, isNotNull, isNull, sql } from '@repo/db/orm';

import { fetchIgdbGamesMetadata } from '../external/igdb';
import { saveIgdbMetadata } from './igdb-enrichment';

/**
 * Riempie i link della pagina del gioco (`websites`) sui giochi arricchiti
 * prima della colonna.
 *
 * Come `backfillGameMedia`, di cui è gemella: il dettaglio si chiede in blocco,
 * cento giochi per richiesta, e si scrive con la stessa funzione del job, tutto
 * ciò che IGDB sa e non solo i link, così le due strade non lasciano un gioco
 * in uno stato che l'altra non produce.
 *
 * I candidati sono i giochi con `websites` nullo, «mai chiesto»; la lista vuota
 * è «IGDB non ne ha». Un gioco che IGDB non conosce più resta nullo e viene
 * ripescato al giro dopo.
 */
export async function backfillGameWebsites(limit = 1000) {
  const candidati = await db
    .select({ id: schema.games.id, igdbId: schema.games.igdbId })
    .from(schema.games)
    .where(and(isNotNull(schema.games.igdbId), isNull(schema.games.websites)))
    .limit(limit);

  if (candidati.length === 0) {
    return { candidati: 0, trovati: 0, scritti: 0 };
  }

  const dettagli = await fetchIgdbGamesMetadata(
    candidati.map((row) => row.igdbId!),
  );

  let scritti = 0;
  for (const gioco of candidati) {
    const metadata = dettagli.get(gioco.igdbId!);
    if (!metadata) continue;
    await saveIgdbMetadata(gioco.id, metadata);
    scritti++;
  }

  return { candidati: candidati.length, trovati: dettagli.size, scritti };
}

/** Quanti giochi aspettano ancora l'arnese: serve solo a dirlo. */
export async function countGamesWithoutWebsites() {
  const [row] = await db
    .select({ quanti: sql<number>`count(*)::int` })
    .from(schema.games)
    .where(and(isNotNull(schema.games.igdbId), isNull(schema.games.websites)));
  return row?.quanti ?? 0;
}

/**
 * Su quanti giochi c'è ciascun tipo di link, fra quelli già passati da IGDB
 * con la colonna, e quanti ne sono senza.
 */
export async function websitesCoverage() {
  const [totale] = await db.execute<{ giochi: number; senza: number }>(sql`
    select
      count(*)::int as giochi,
      count(*) filter (where jsonb_array_length(websites) = 0)::int as senza
    from games
    where websites is not null
  `);
  const tipi = await db.execute<{ type: string; giochi: number }>(sql`
    select site->>'type' as type, count(*)::int as giochi
    from games, jsonb_array_elements(websites) as site
    group by 1
    order by 2 desc
  `);
  return { ...totale!, tipi: [...tipi] };
}
