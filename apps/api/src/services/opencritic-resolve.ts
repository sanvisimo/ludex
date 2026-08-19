import { db, schema } from '@repo/db';
import { and, eq, isNotNull, isNull, ne, or, sql } from '@repo/db/orm';

import { fetchOpenCriticIdsBySlug } from '../external/wikidata';
import { isUniqueViolation } from '../lib/pg-error';

/**
 * L'aggancio dei giochi a OpenCritic, in blocco e senza spendere ricerche.
 *
 * È il passo che rende praticabile lo step 8 sul piano gratuito. OpenCritic dà
 * 25 ricerche al giorno: agganciare per nome 446 giochi vorrebbe dire diciotto
 * giorni. Wikidata tiene lo stesso collegamento — slug IGDB da una parte, id
 * OpenCritic dall'altra — e lo dà tutto in una richiesta, gratis.
 *
 * Sta separato dall'enrichment, e non è un dettaglio organizzativo:
 *
 * - **gira di rado**. La mappa di Wikidata si muove di settimana in settimana,
 *   non di ora in ora, e il servizio è gratuito e a volte in affanno.
 * - **non chiama OpenCritic**. Scrive solo l'indirizzo; a prendere il voto è
 *   il job per gioco, con i suoi tentativi e il suo stato.
 * - **un suo guasto non tocca lo stato delle fonti**. Se Wikidata è giù, i
 *   giochi restano da agganciare: è già il loro stato.
 */

export type ResolveReport = {
  candidati: number;
  conMappa: number;
  agganciati: number;
  conflitti: number;
};

/**
 * I giochi che uno slug ce l'hanno e un id OpenCritic no.
 *
 * `not_found` resta fuori: se OpenCritic quel gioco non ce l'ha, riprovare a
 * dargli un indirizzo ogni settimana è lavoro buttato. Si riapre per evento,
 * come per le altre fonti.
 */
function findGamesNeedingOpenCriticId(limit: number) {
  return db
    .select({ id: schema.games.id, slug: schema.games.igdbSlug })
    .from(schema.games)
    .leftJoin(
      schema.gameSources,
      and(
        eq(schema.gameSources.gameId, schema.games.id),
        eq(schema.gameSources.source, 'opencritic'),
      ),
    )
    .where(
      and(
        isNotNull(schema.games.igdbSlug),
        isNull(schema.gameSources.externalId),
        // Il ramo sul NULL è obbligatorio: con la LEFT JOIN, su un gioco mai
        // tentato `status <> 'not_found'` vale NULL, e senza questo sparirebbero
        // proprio i giochi nuovi.
        or(
          isNull(schema.gameSources.gameId),
          ne(schema.gameSources.status, 'not_found'),
        ),
      ),
    )
    .orderBy(sql`${schema.games.createdAt} asc`)
    .limit(limit);
}

export async function resolveOpenCriticIds(
  limit = 500,
): Promise<ResolveReport> {
  const giochi = await findGamesNeedingOpenCriticId(limit);
  const report: ResolveReport = {
    candidati: giochi.length,
    conMappa: 0,
    agganciati: 0,
    conflitti: 0,
  };

  if (giochi.length === 0) return report;

  const mappa = await fetchOpenCriticIdsBySlug(
    giochi.map((gioco) => gioco.slug!),
  );

  for (const gioco of giochi) {
    const openCriticId = mappa.get(gioco.slug!);
    if (openCriticId === undefined) continue;
    report.conMappa += 1;

    try {
      // Uno alla volta e non in blocco: l'unique su (fonte, id esterno) può
      // rifiutare una riga sola — due nostri giochi che su Wikidata puntano
      // allo stesso id OpenCritic, che capita fra un gioco e la sua remaster —
      // e in blocco quel rifiuto porterebbe giù anche gli altri.
      await db
        .insert(schema.gameSources)
        .values({
          gameId: gioco.id,
          source: 'opencritic',
          // `pending` e non `ok`: qui si è scritto solo l'indirizzo, il voto
          // non è ancora stato preso. È il job di enrichment a dire `ok`.
          status: 'pending',
          externalId: String(openCriticId),
        })
        .onConflictDoUpdate({
          target: [schema.gameSources.gameId, schema.gameSources.source],
          // Solo l'indirizzo: stato, tentativi e sincronizzazioni sono di chi
          // arricchisce, e riscriverli qui cancellerebbe la storia della fonte.
          set: { externalId: String(openCriticId), updatedAt: new Date() },
        });
      report.agganciati += 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        report.conflitti += 1;
        continue;
      }
      throw error;
    }
  }

  return report;
}
