import type { Store } from '@repo/contracts/vocabulary';
import { Queue } from 'bullmq';

import { redisConnection } from './connection';

export const IMPORTS_QUEUE = 'imports';

/**
 * Coda separata da `enrichment`, non per gusto di simmetria.
 *
 * L'import **produce** job di enrichment: sulla stessa coda una libreria da 450
 * giochi finirebbe dietro i 450 job che ha appena generato lei, e un secondo
 * utente aspetterebbe il primo. E i due lavori hanno ritmi diversi — l'import è
 * una manciata di richieste, l'enrichment è vincolato al rate limit di IGDB.
 */

/**
 * Un import da fare, per un utente e un negozio.
 *
 * Allo step 4 c'era il solo `{ type: 'steam', steamId }`. Dal 9a il negozio è un
 * campo e **il job non porta il credenziale**: chi lo esegue va a leggerlo da
 * `store_accounts`. Portarlo dentro il job vorrebbe dire scrivere un refresh
 * token in chiaro dentro Redis, dove resta nella cronologia dei job completati
 * per giorni — e vorrebbe dire eseguire con un token già rinnovato da qualcun
 * altro nel frattempo.
 *
 * Steam resta l'eccezione e tiene il suo `steamId` nel job: non è un segreto,
 * è l'identificativo pubblico di un profilo.
 */
export type ImportJob = { store: Store; userId: string; steamId?: string };

export const importsQueue = new Queue<ImportJob>(IMPORTS_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    // Tenuti più a lungo dei job di enrichment: sono pochi e l'utente vuole
    // sapere com'è andata l'ultima importazione.
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

/**
 * La chiave di deduplicazione: un import per utente **e per negozio**.
 *
 * Il negozio dentro la chiave non è un dettaglio: senza, collegare GOG mentre
 * gira l'import di Steam scarterebbe silenziosamente il secondo, e l'utente
 * vedrebbe una libreria che non arriva mai.
 */
const dedupKey = (store: Store, userId: string) => `${store}-${userId}`;

/**
 * Accoda l'import di una libreria.
 *
 * Deduplicato: premere due volte il bottone non fa partire due import. Senza
 * `ttl`, la chiave vive quanto il job e si libera alla fine, così un reimport
 * più tardi passa (vedi il commento in queue/enrichment.ts).
 */
export async function enqueueImport(job: ImportJob) {
  return importsQueue.add(job.store, job, {
    deduplication: { id: dedupKey(job.store, job.userId) },
  });
}

/**
 * C'è un import in corso per questo utente su questo negozio?
 *
 * Si guarda la chiave di deduplicazione e non lo stato dei job: la chiave esiste
 * esattamente finché il job è in coda o in lavorazione, e si libera quando
 * finisce. È la stessa proprietà su cui poggia la deduplicazione.
 */
export async function isImportRunning(store: Store, userId: string) {
  const jobId = await importsQueue.getDeduplicationJobId(
    dedupKey(store, userId),
  );
  return jobId !== null;
}
