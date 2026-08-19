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
 * Deduplicato per gioco: se lo stesso gioco viene importato da tre utenti nello
 * stesso momento, BullMQ scarta i doppioni invece di chiamare IGDB tre volte.
 *
 * Si usa `deduplication` e **non `jobId`**, che sarebbe la strada ovvia. Con un
 * jobId fisso un secondo accodamento non viene aggiunto finché quell'id esiste in
 * Redis — e i job completati restano, per via di `removeOnComplete`. Il riaccodo
 * di un gioco già arricchito (cioè tutto il senso della spazzata: riprendere i
 * dati stantii) verrebbe quindi ingoiato in silenzio, e `add` restituirebbe
 * comunque un Job che sembra valido. Senza `ttl` la chiave di deduplicazione vive
 * quanto il job — collassa gli accodamenti concorrenti — e si libera quando
 * finisce, che è esattamente il comportamento che serve.
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
      { deduplication: { id: `igdb-${gameId}` } },
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
