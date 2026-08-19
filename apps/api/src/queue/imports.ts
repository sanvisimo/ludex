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
export type ImportJob = { type: 'steam'; userId: string; steamId: string };

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
 * Accoda l'import della libreria Steam di un utente.
 *
 * Deduplicato per utente e negozio: premere due volte il bottone non fa partire
 * due import. Senza `ttl`, la chiave vive quanto il job e si libera alla fine,
 * così un reimport più tardi passa (vedi il commento in queue/enrichment.ts).
 */
export async function enqueueSteamImport(userId: string, steamId: string) {
  return importsQueue.add(
    'steam',
    { type: 'steam', userId, steamId },
    { deduplication: { id: `steam-${userId}` } },
  );
}

/**
 * C'è un import in corso per questo utente?
 *
 * Si guarda la chiave di deduplicazione e non lo stato dei job: la chiave esiste
 * esattamente finché il job è in coda o in lavorazione, e si libera quando
 * finisce. È la stessa proprietà su cui poggia la deduplicazione.
 */
export async function isSteamImportRunning(userId: string) {
  const jobId = await importsQueue.getDeduplicationJobId(`steam-${userId}`);
  return jobId !== null;
}
