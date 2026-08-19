import { db, schema } from '@repo/db';
import { eq, sql } from '@repo/db/orm';

import { fetchIgdbGameMetadata, type IgdbAttribute } from '../external/igdb';
import { enqueueEnrichment } from '../queue/enrichment';
import { markSource } from './enrichment';

/**
 * Enrichment IGDB di un singolo gioco.
 *
 * Due proprieta' che il CLAUDE.md impone e che vanno lette insieme:
 *
 * - **per singola fonte**: questo tocca solo IGDB e solo la riga `game_sources`
 *   di IGDB. HLTB ha la sua funzione e non si intralciano.
 * - **idempotente**: rieseguirlo porta allo stesso stato, non ne accumula. Gli
 *   attributi si riscrivono in blocco, i campi si sovrascrivono.
 */

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
  | { status: 'ok'; name: string; attributes: number }
  | { status: 'skipped'; reason: string }
  | { status: 'not_found' };

export async function enrichGameFromIgdb(
  gameId: string,
): Promise<EnrichmentOutcome> {
  const game = await db.query.games.findFirst({
    columns: { id: true, igdbId: true },
    where: eq(schema.games.id, gameId),
  });

  if (!game) return { status: 'skipped', reason: 'gioco inesistente' };

  // Un gioco inserito a mano non ha `igdbId`: non è un errore, è un gioco non
  // ancora risolto. Si annota e si esce senza segnare un fallimento, che
  // farebbe riprovare all'infinito qualcosa che non puo' riuscire.
  if (game.igdbId === null) {
    return { status: 'skipped', reason: 'gioco senza igdbId, non risolto' };
  }

  try {
    const metadata = await fetchIgdbGameMetadata(game.igdbId);

    if (!metadata) {
      // Non `failed`: riprovarlo non lo farà comparire. Si riapre per evento,
      // quando l'`igdbId` del gioco cambia — cosa che oggi non può ancora
      // succedere: il ri-collegamento a IGDB è rimasto fuori dallo step 5,
      // perché fondere due righe `games` non è una modifica personale.
      await markSource({
        gameId,
        source: 'igdb',
        status: 'not_found',
        error: `IGDB non conosce l'id ${game.igdbId}`,
      });
      return { status: 'not_found' };
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

    await markSource({ gameId, source: 'igdb', status: 'ok' });

    // HLTB aspetta questo momento: prima di adesso il gioco non aveva né il
    // titolo canonico né l'anno, e senza quei due il match sbaglia. Accodare
    // qui vuol dire che un gioco nuovo prende la sua durata in minuti, non alla
    // prossima spazzata.
    await enqueueEnrichment('hltb', gameId);

    return {
      status: 'ok',
      name: metadata.name,
      attributes: attributeIds.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSource({
      gameId,
      source: 'igdb',
      status: 'failed',
      error: message.slice(0, 500),
    });
    // Rilanciato: è BullMQ a decidere se e quando riprovare.
    throw error;
  }
}
