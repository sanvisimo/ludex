import { db, schema, type Db } from '@repo/db';
import { and, eq, inArray, isNull, notInArray, sql } from '@repo/db/orm';

/**
 * Scrittura dei voti della critica, per la parte che è uguale a tutte le fonti.
 *
 * Le fonti restano separate — un file per fonte, come per l'enrichment — ma
 * l'atto di **scrivere** un punteggio è lo stesso ovunque, e ha una regola che
 * non può stare in tre copie: dopo ogni scrittura va ricalcolato il voto
 * denormalizzato su `games`, o lo step 7 filtrerebbe su un numero vecchio.
 */

export type ScoreSource = 'igdb' | 'opencritic' | 'metacritic';

/** Il `tx` che Drizzle passa dentro `db.transaction`, senza doverlo nominare. */
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

type Executor = Db | Transaction;

/**
 * Chi vince quando lo stesso gioco ha più voti.
 *
 * OpenCritic per primo perché è l'unico dei tre che dice **come** aggrega:
 * media dei critici di punta, con la percentuale di chi lo consiglia accanto.
 * Metacritic secondo, che sul catalogo vecchio arriva dove OpenCritic non
 * arriva — è nato nel 2015. IGDB per ultimo: c'è quasi sempre, ma è
 * un'aggregazione di cui non conosciamo il perimetro.
 *
 * Non è un ordine di qualità dei voti, è un ordine di **trasparenza su come
 * sono fatti**. E vive qui, in un punto solo: la scheda del gioco mostra tutti
 * e tre i numeri, questa precedenza decide soltanto quale finisce nella colonna
 * su cui si filtra.
 */
export const CRITIC_PRECEDENCE: readonly ScoreSource[] = [
  'opencritic',
  'metacritic',
  'igdb',
];

/**
 * Un punteggio da scrivere. `platformSlug` nullo è il voto complessivo del
 * gioco — l'unico che IGDB e OpenCritic producono.
 */
export type ScoreInput = {
  platformSlug?: string | null;
  score: number;
  reviewCount?: number | null;
  medianScore?: number | null;
  percentRecommended?: number | null;
  tier?: string | null;
  positiveCount?: number | null;
  neutralCount?: number | null;
  negativeCount?: number | null;
  sentiment?: string | null;
};

/**
 * Ricalcola il voto denormalizzato di un gioco dalla tabella dei punteggi.
 *
 * Due istruzioni invece di una UPDATE con sottoquery, e non è pigrizia: quando
 * di punteggi non ce n'è nemmeno uno le colonne vanno **azzerate**, e una
 * `UPDATE … FROM` che non trova righe non aggiorna niente — lascerebbe lì il
 * numero di prima. Con la SELECT davanti il caso "nessun voto" è una riga di
 * codice come le altre.
 *
 * Guarda solo le righe con `platform_slug` nullo: il voto per piattaforma
 * esiste, ma "quanto vale questo gioco" non può dipendere da chi lo guarda —
 * `games` è condivisa fra tutti gli utenti.
 */
export async function recomputeCriticScore(
  gameId: string,
  executor: Executor = db,
) {
  const rows = await executor
    .select({
      source: schema.gameScores.source,
      score: schema.gameScores.score,
    })
    .from(schema.gameScores)
    .where(
      and(
        eq(schema.gameScores.gameId, gameId),
        isNull(schema.gameScores.platformSlug),
      ),
    );

  const best = CRITIC_PRECEDENCE.map((source) =>
    rows.find((row) => row.source === source),
  ).find(Boolean);

  await executor
    .update(schema.games)
    .set({
      criticScore: best?.score ?? null,
      criticScoreSource: best?.source ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.games.id, gameId));

  return best ?? null;
}

/**
 * Riscrive i voti di **una** fonte per un gioco, e ricalcola il denormalizzato.
 *
 * Riscrittura in blocco e non un diff, come gli attributi IGDB: è ciò che rende
 * la funzione idempotente e che gestisce da solo il caso in cui una fonte
 * *toglie* qualcosa — Metacritic che smette di elencare una piattaforma, o un
 * voto che sparisce perché le recensioni sono state ritirate. Un upsert e basta
 * lascerebbe lì la riga vecchia per sempre.
 *
 * Tocca solo le righe della fonte passata: le altre due non le riguarda.
 */
export async function saveScores(
  gameId: string,
  source: ScoreSource,
  scores: ScoreInput[],
  executor: Executor = db,
) {
  const rows = scores.map((score) => ({
    gameId,
    source,
    platformSlug: score.platformSlug ?? null,
    score: score.score,
    reviewCount: score.reviewCount ?? null,
    medianScore: score.medianScore ?? null,
    percentRecommended: score.percentRecommended ?? null,
    tier: score.tier ?? null,
    positiveCount: score.positiveCount ?? null,
    neutralCount: score.neutralCount ?? null,
    negativeCount: score.negativeCount ?? null,
    sentiment: score.sentiment ?? null,
  }));

  // Le chiavi che sopravvivono, con il complessivo ridotto a stringa vuota.
  // Serve perché in SQL i NULL non si confrontano: `platform_slug not in ('pc')`
  // non è vero sulla riga del voto complessivo, che quindi sfuggirebbe a ogni
  // pulizia e resterebbe lì anche quando la fonte ha smesso di darlo. Nessuno
  // slug vero è la stringa vuota — sono chiavi primarie di `platforms` — quindi
  // il collasso non può creare collisioni.
  const chiavi = rows.map((row) => row.platformSlug ?? '');

  await executor
    .delete(schema.gameScores)
    .where(
      and(
        eq(schema.gameScores.gameId, gameId),
        eq(schema.gameScores.source, source),
        chiavi.length > 0
          ? notInArray(sql`coalesce(${schema.gameScores.platformSlug}, '')`, chiavi)
          : undefined,
      ),
    );

  if (rows.length > 0) {
    await executor
      .insert(schema.gameScores)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          schema.gameScores.gameId,
          schema.gameScores.source,
          schema.gameScores.platformSlug,
        ],
        set: {
          score: sql`excluded.score`,
          reviewCount: sql`excluded.review_count`,
          medianScore: sql`excluded.median_score`,
          percentRecommended: sql`excluded.percent_recommended`,
          tier: sql`excluded.tier`,
          positiveCount: sql`excluded.positive_count`,
          neutralCount: sql`excluded.neutral_count`,
          negativeCount: sql`excluded.negative_count`,
          sentiment: sql`excluded.sentiment`,
          updatedAt: new Date(),
        },
      });
  }

  return recomputeCriticScore(gameId, executor);
}

/** I voti di un gioco, tutte le fonti e tutte le piattaforme. */
export function findScores(gameId: string, executor: Executor = db) {
  return executor
    .select()
    .from(schema.gameScores)
    .where(eq(schema.gameScores.gameId, gameId));
}

/** I voti di più giochi in un colpo, per le liste. */
export function findScoresForGames(gameIds: string[], executor: Executor = db) {
  if (gameIds.length === 0) return Promise.resolve([]);
  return executor
    .select()
    .from(schema.gameScores)
    .where(inArray(schema.gameScores.gameId, gameIds));
}
