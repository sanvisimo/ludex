import { Queue } from "bullmq";

import { redisConnection } from "./connection";

export const ENRICHMENT_QUEUE = "enrichment";

/** Un job per (gioco, fonte): le fonti restano indipendenti anche in coda. */
export type EnrichmentJob = {
  gameId: string;
  source: "igdb";
};

export const enrichmentQueue = new Queue<EnrichmentJob>(ENRICHMENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    // IGDB puo' essere temporaneamente irraggiungibile: si riprova diradando.
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Accoda l'enrichment di un gioco.
 *
 * `jobId` deterministico: se lo stesso gioco viene importato da tre utenti nello
 * stesso momento, BullMQ scarta i doppioni invece di chiamare IGDB tre volte.
 * (Niente `:` nell'id: BullMQ lo rifiuta, lo usa come separatore nelle chiavi.)
 *
 * Non solleva mai. L'accodamento e' un effetto collaterale della creazione di un
 * gioco: se Redis e' giu', il gioco deve nascere lo stesso e l'utente non deve
 * vedere un errore. Il lavoro non si perde — `findGamesNeedingIgdb` ritrova i
 * giochi senza `synced_at`, che e' proprio a cosa serve `game_sources`.
 */
export async function enqueueIgdbEnrichment(gameId: string) {
  try {
    await enrichmentQueue.add(
      "igdb",
      { gameId, source: "igdb" },
      { jobId: `igdb-${gameId}` },
    );
  } catch (error) {
    console.error(
      `[enrichment] accodamento fallito per ${gameId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
