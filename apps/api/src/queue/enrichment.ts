import { Queue } from "bullmq";

import { redisConnection } from "./connection";

export const ENRICHMENT_QUEUE = "enrichment";

/**
 * Due tipi di job sulla stessa coda:
 *
 * - `igdb`: arricchisce un gioco preciso
 * - `sweep`: passa in rassegna i giochi da (ri)arricchire e accoda i primi
 *
 * Il secondo non fa lavoro pesante: accoda soltanto, cosi' il rate limit resta
 * governato da un punto solo.
 */
export type EnrichmentJob = { type: "igdb"; gameId: string } | { type: "sweep" };

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
      { type: "igdb", gameId },
      { jobId: `igdb-${gameId}` },
    );
  } catch (error) {
    console.error(
      `[enrichment] accodamento fallito per ${gameId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

const SWEEP_SCHEDULER_ID = "igdb-sweep";
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Registra la spazzata periodica.
 *
 * E' uno *scheduler* di BullMQ e non un setInterval nel processo: cosi' lo stato
 * vive in Redis, e con piu' worker in esecuzione la spazzata parte una volta
 * sola invece che una per processo. `upsert` lo rende sicuro da rieseguire a
 * ogni avvio.
 */
export async function scheduleIgdbSweep() {
  await enrichmentQueue.upsertJobScheduler(
    SWEEP_SCHEDULER_ID,
    { every: SWEEP_EVERY_MS },
    { name: "sweep", data: { type: "sweep" } },
  );
}
