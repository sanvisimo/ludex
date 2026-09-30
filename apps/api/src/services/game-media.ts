import { db, schema } from '@repo/db';
import { and, isNotNull, isNull, sql } from '@repo/db/orm';

import { fetchIgdbGamesMetadata } from '../external/igdb';
import { saveIgdbMetadata } from './igdb-enrichment';

/**
 * Riempie media, autori e giochi legati sui giochi arricchiti prima che la
 * pagina del gioco (12d) li chiedesse.
 *
 * Senza, quei giochi aspetterebbero il rinfresco naturale dell'enrichment IGDB
 * — fino a trenta giorni — per campi che IGDB ha già. Qui il dettaglio si
 * chiede in blocco, cento giochi per richiesta, e si scrive con la stessa
 * funzione del job: tutto ciò che IGDB sa, non solo i campi nuovi, così le due
 * strade non possono lasciare un gioco in uno stato che l'altra non produce.
 *
 * I candidati sono i giochi con `artwork_image_ids` nullo: nullo vuol dire «mai
 * chiesto», la lista vuota «IGDB non ne ha». Un gioco che IGDB non conosce più
 * resta nullo e viene ripescato al giro dopo, come in `igdb:types`.
 */
export async function backfillGameMedia(limit = 1000) {
  const candidati = await db
    .select({ id: schema.games.id, igdbId: schema.games.igdbId })
    .from(schema.games)
    .where(
      and(isNotNull(schema.games.igdbId), isNull(schema.games.artworkImageIds)),
    )
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
export async function countGamesWithoutMedia() {
  const [row] = await db
    .select({ quanti: sql<number>`count(*)::int` })
    .from(schema.games)
    .where(
      and(isNotNull(schema.games.igdbId), isNull(schema.games.artworkImageIds)),
    );
  return row?.quanti ?? 0;
}

/**
 * Su quanti giochi c'è ciascuna cosa, fra quelli già passati da IGDB coi campi
 * nuovi. È la misura che il piano del 12d chiede prima di disegnare: quanto
 * spesso la hero ripiega sullo screenshot o sulla copertina, e quanto spesso
 * una sezione della pagina resta vuota.
 */
export async function mediaCoverage() {
  const [row] = await db.execute<{
    giochi: number;
    artwork: number;
    screenshot: number;
    video: number;
    sviluppo: number;
    remake: number;
    simili: number;
  }>(sql`
    select
      count(*)::int as giochi,
      count(*) filter (where cardinality(g.artwork_image_ids) > 0)::int as artwork,
      count(*) filter (where cardinality(g.screenshot_image_ids) > 0)::int as screenshot,
      count(*) filter (where jsonb_array_length(g.videos) > 0)::int as video,
      count(*) filter (where cardinality(g.developers) > 0)::int as sviluppo,
      count(*) filter (where exists (
        select 1 from game_related r
        where r.game_id = g.id and r.kind in ('remake', 'remaster')
      ))::int as remake,
      count(*) filter (where exists (
        select 1 from game_related r
        where r.game_id = g.id and r.kind = 'similar'
      ))::int as simili
    from games g
    where g.artwork_image_ids is not null
  `);
  return row!;
}
