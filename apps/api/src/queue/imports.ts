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
 * Un import da fare: **l'account, e nient'altro**.
 *
 * Allo step 4 c'era `{ type: 'steam', steamId }`, poi `{ store, userId }`. Ora è
 * l'id della riga di `store_accounts`, da cui si leggono negozio, utente e
 * identità pubblica: due account Amazon dello stesso utente sono due import
 * distinti, e `{ store, userId }` non sapeva distinguerli — il secondo veniva
 * scartato dalla deduplicazione del primo.
 *
 * **Il job non porta il credenziale** e non lo portava nemmeno prima: chi lo
 * esegue va a leggerlo da `store_accounts`. Portarlo dentro vorrebbe dire
 * scrivere un refresh token in chiaro in Redis, dove resta nella cronologia dei
 * job completati per giorni, e vorrebbe dire eseguire con un token che nel
 * frattempo qualcun altro ha già rinnovato.
 *
 * Anche lo `steamId` è sparito di qui, e non perché fosse un segreto: è
 * `externalAccountId` sulla riga, e tenerne una copia nel job voleva dire due
 * posti da cui poteva arrivare la verità.
 */
export type ImportJob = { storeAccountId: string };

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
 * La chiave di deduplicazione: un import **per account**.
 *
 * Era `${store}-${userId}`, che con due account sullo stesso negozio si
 * escludono a vicenda: colleghi il secondo Amazon mentre gira il primo e il suo
 * import viene scartato in silenzio, con l'utente che aspetta una libreria che
 * non arriva mai. L'id dell'account è già unico per (utente, negozio, account) e
 * non ha bisogno di prefissi.
 */
const dedupKey = (storeAccountId: string) => storeAccountId;

/**
 * Accoda l'import di una libreria.
 *
 * Deduplicato: premere due volte il bottone non fa partire due import. Senza
 * `ttl`, la chiave vive quanto il job e si libera alla fine, così un reimport
 * più tardi passa (vedi il commento in queue/enrichment.ts).
 *
 * Il nome del job resta il negozio, che è ciò che si legge nella dashboard: l'id
 * dell'account lì non direbbe niente a nessuno.
 */
export async function enqueueImport(store: Store, job: ImportJob) {
  return importsQueue.add(store, job, {
    deduplication: { id: dedupKey(job.storeAccountId) },
  });
}

/**
 * C'è un import in corso per questo account?
 *
 * Si guarda la chiave di deduplicazione e non lo stato dei job: la chiave esiste
 * esattamente finché il job è in coda o in lavorazione, e si libera quando
 * finisce. È la stessa proprietà su cui poggia la deduplicazione.
 */
export async function isImportRunning(storeAccountId: string) {
  const jobId = await importsQueue.getDeduplicationJobId(
    dedupKey(storeAccountId),
  );
  return jobId !== null;
}
