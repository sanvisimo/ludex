import { Queue } from 'bullmq';

import type { EnrichmentSource } from '../services/enrichment';
import { redisConnection } from './connection';

export const ENRICHMENT_QUEUE = 'enrichment';

/**
 * Due tipi di job sulla stessa coda:
 *
 * - `enrich`: arricchisce un gioco preciso da una fonte precisa
 * - `sweep`: passa in rassegna i giochi da (ri)arricchire e accoda i primi
 *
 * Il secondo non fa lavoro pesante: accoda soltanto, cosi' il rate limit resta
 * governato da un punto solo.
 *
 * La fonte sta **dentro il job** e non in code separate: ogni fonte ha il suo
 * rate limit da rispettare, ma il lavoro è lo stesso e le code separate
 * sarebbero due worker da tenere in piedi per la stessa cosa.
 */
export type EnrichmentJob =
  | { type: 'enrich'; source: EnrichmentSource; gameId: string }
  | { type: 'sweep' };

export const enrichmentQueue = new Queue<EnrichmentJob>(ENRICHMENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    // Le fonti esterne possono essere temporaneamente irraggiungibili: si
    // riprova diradando.
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Accoda l'enrichment di un gioco da una fonte.
 *
 * Deduplicato per (fonte, gioco): se lo stesso gioco viene importato da tre
 * utenti nello stesso momento, BullMQ scarta i doppioni invece di chiamare IGDB
 * tre volte. La chiave comprende la fonte perché IGDB e HLTB dello stesso gioco
 * sono due lavori distinti, che possono benissimo stare in coda insieme.
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
 * vedere un errore. Il lavoro non si perde — `findGamesNeedingSource` ritrova i
 * giochi senza `synced_at`, che e' proprio a cosa serve `game_sources`.
 */
export async function enqueueEnrichment(
  source: EnrichmentSource,
  gameId: string,
) {
  try {
    await enrichmentQueue.add(
      'enrich',
      { type: 'enrich', source, gameId },
      { deduplication: { id: `${source}-${gameId}` } },
    );
  } catch (error) {
    console.error(
      `[enrichment] accodamento ${source} fallito per ${gameId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

const SWEEP_SCHEDULER_ID = 'enrichment-sweep';
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Registra la spazzata periodica.
 *
 * E' uno *scheduler* di BullMQ e non un setInterval nel processo: cosi' lo stato
 * vive in Redis, e con piu' worker in esecuzione la spazzata parte una volta
 * sola invece che una per processo. `upsert` lo rende sicuro da rieseguire a
 * ogni avvio.
 */
export async function scheduleEnrichmentSweep() {
  await enrichmentQueue.upsertJobScheduler(
    SWEEP_SCHEDULER_ID,
    { every: SWEEP_EVERY_MS },
    { name: 'sweep', data: { type: 'sweep' } },
  );
}
