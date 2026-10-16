import type { Store } from '@repo/contracts/vocabulary';
import { Queue } from 'bullmq';

import type { LibraryEntry } from '../services/library-import';
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

/**
 * La spazzata periodica: non importa niente, accoda gli import dovuti.
 *
 * Un tipo a parte e non un `type` aggiunto a `ImportJob`: i job d'import già
 * in Redis sono `{ storeAccountId }` e basta, e il worker li deve riconoscere
 * anche senza un campo che quando sono stati scritti non esisteva.
 */
export type ImportsSweepJob = { type: 'sweep' };

/**
 * L'import della **wishlist** di un account (15e): su richiesta, mai dalla
 * spazzata. Anche qui l'account e nient'altro, e per lo stesso motivo un tipo a
 * parte: i job `{ storeAccountId }` già in Redis sono di libreria e devono
 * restarlo.
 */
export type ImportsWishlistJob = { type: 'wishlist'; storeAccountId: string };

/**
 * L'import di una scheda **da file** (10): le voci lette dall'export di
 * Playnite, già ridotte. Qui le voci viaggiano nel job, al contrario di
 * `ImportJob`: non c'è un negozio da cui rileggerle, e non sono un
 * credenziale. Le date arrivano come stringhe, perché passano da JSON.
 */
export type ImportsFileJob = {
  type: 'file';
  storeAccountId: string;
  entries: FileJobEntry[];
};

export type FileJobEntry = Omit<LibraryEntry, 'lastPlayedAt' | 'acquiredAt'> & {
  lastPlayedAt?: string | null;
};

export type ImportsAnyJob =
  | ImportJob
  | ImportsSweepJob
  | ImportsWishlistJob
  | ImportsFileJob;

export const importsQueue = new Queue<ImportsAnyJob>(IMPORTS_QUEUE, {
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

export const isImportsSweep = (job: ImportsAnyJob): job is ImportsSweepJob =>
  'type' in job && job.type === 'sweep';

export const isImportsFile = (job: ImportsAnyJob): job is ImportsFileJob =>
  'type' in job && job.type === 'file';

export const isImportsWishlist = (
  job: ImportsAnyJob,
): job is ImportsWishlistJob => 'type' in job && job.type === 'wishlist';

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
 * Accoda l'import di una scheda da file. Stessa chiave di `enqueueImport`: per
 * la scheda è un import come gli altri, e `syncing` lo legge da lì.
 */
export async function enqueueFileImport(
  store: Store,
  job: Omit<ImportsFileJob, 'type'>,
) {
  return importsQueue.add(
    `${store}:file`,
    { type: 'file', ...job },
    { deduplication: { id: dedupKey(job.storeAccountId) } },
  );
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

/**
 * La chiave dell'import della wishlist: **sua**, non quella della libreria. Le
 * due cose scrivono tabelle diverse e un utente può chiedere la wishlist mentre la
 * libreria si importa (o l'inverso): con la stessa chiave la seconda richiesta
 * verrebbe scartata in silenzio. Uno alla volta ci pensa già la concorrenza 1
 * del worker.
 */
const wishlistDedupKey = (storeAccountId: string) =>
  `${storeAccountId}:wishlist`;

/**
 * Accoda l'import della wishlist di un account. Deduplicato come quello della
 * libreria: premere due volte non ne fa partire due.
 */
export async function enqueueWishlistImport(
  store: Store,
  job: { storeAccountId: string },
) {
  return importsQueue.add(
    `${store}:wishlist`,
    { type: 'wishlist', storeAccountId: job.storeAccountId },
    { deduplication: { id: wishlistDedupKey(job.storeAccountId) } },
  );
}

/** C'è un import della wishlist in corso per questo account? */
export async function isWishlistImportRunning(storeAccountId: string) {
  const jobId = await importsQueue.getDeduplicationJobId(
    wishlistDedupKey(storeAccountId),
  );
  return jobId !== null;
}

const SWEEP_SCHEDULER_ID = 'imports-sweep';
// Ogni sei ore, come la spazzata dell'enrichment. Le soglie vere sono di giorni
// (vedi `AUTO_SYNC_EVERY_DAYS`): la frequenza qui dice solo con quanto ritardo,
// al massimo, un account dovuto viene notato.
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Registra la spazzata periodica degli import.
 *
 * Uno scheduler di BullMQ e non un setInterval, per le stesse ragioni di quello
 * dell'enrichment: lo stato vive in Redis, con più worker parte una volta sola,
 * e a worker spento il giro rimasto indietro si fa appena riparte — che in
 * locale vuol dire «si aggiorna quando avvio il progetto».
 */
export async function scheduleImportsSweep() {
  await importsQueue.upsertJobScheduler(
    SWEEP_SCHEDULER_ID,
    { every: SWEEP_EVERY_MS },
    { name: 'sweep', data: { type: 'sweep' } },
  );
}
