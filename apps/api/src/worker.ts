import './env';

import { Worker } from 'bullmq';

import { redisConnection } from './queue/connection';
import {
  ENRICHMENT_QUEUE,
  enqueueEnrichment,
  enrichmentQueue,
  scheduleEnrichmentSweep,
  type EnrichmentJob,
} from './queue/enrichment';
import { IMPORTS_QUEUE, type ImportJob } from './queue/imports';
import {
  ENRICHMENT_SOURCE_NAMES,
  findGamesNeedingSource,
} from './services/enrichment';
import { enrichGameFromHltb } from './services/hltb-enrichment';
import { enrichGameFromIgdb } from './services/igdb-enrichment';
import { importSteamLibrary } from './services/steam-import';

// Secondo entrypoint di apps/api. Stesso codebase e stessi servizi di server.ts,
// ma qui non si espone HTTP: i job non devono girare nel processo che serve le
// richieste, o uno scrape pesante degraderebbe le API. In sviluppo partono
// insieme, in produzione si scalano e si deployano separatamente.

// L'unico punto in cui una fonte diventa una funzione. Tutto il resto della
// pipeline — predicato, accodamento, spazzata — non sa che fonti esistono.
const enrichers = {
  igdb: enrichGameFromIgdb,
  hltb: enrichGameFromHltb,
};

const worker = new Worker<EnrichmentJob>(
  ENRICHMENT_QUEUE,
  async (job) => {
    if (job.data.type === 'sweep') {
      // La spazzata non arricchisce: accoda. Il lavoro vero resta un job per
      // gioco e per fonte, con i suoi tentativi e il suo stato.
      let enqueued = 0;
      for (const source of ENRICHMENT_SOURCE_NAMES) {
        const games = await findGamesNeedingSource(source);
        for (const game of games) await enqueueEnrichment(source, game.id);
        console.log(
          `[enrichment] spazzata ${source}: ${games.length} giochi accodati`,
        );
        enqueued += games.length;
      }
      return { enqueued };
    }

    const { source, gameId } = job.data;
    const outcome = await enrichers[source](gameId);
    console.log(`[enrichment] ${source} ${gameId} -> ${outcome.status}`);
    return outcome;
  },
  {
    connection: redisConnection,
    // Basso di proposito: il collo di bottiglia è il rate limit delle fonti —
    // 4 richieste al secondo su IGDB, 3 su HLTB — che i client gia' rispettano
    // serializzando. Alzare qui non farebbe andare piu' veloce, farebbe solo
    // accumulare attese.
    concurrency: 2,
  },
);

worker.on('failed', (job, error) => {
  console.error(`[enrichment] job ${job?.id} fallito:`, error.message);
});

// Coda a parte: un import genera centinaia di job di enrichment, e sulla stessa
// coda finirebbe in fila dietro il lavoro che ha appena prodotto.
const importsWorker = new Worker<ImportJob>(
  IMPORTS_QUEUE,
  async (job) => {
    const report = await importSteamLibrary(job.data.userId, job.data.steamId);
    console.log(
      `[import] steam ${job.data.userId}: ${report.total} in libreria, ` +
        `${report.resolved} risolti (${report.newGames} giochi nuovi, ` +
        `${report.newEntries} aggiunti al backlog), ${report.unresolved} da sistemare`,
    );
    return report;
  },
  {
    connection: redisConnection,
    // Uno alla volta: il grosso del lavoro è scritture in blocco sul DB, e due
    // import in parallelo si contenderebbero le stesse righe `games`.
    concurrency: 1,
  },
);

importsWorker.on('failed', (job, error) => {
  console.error(`[import] job ${job?.id} fallito:`, error.message);
});

// La spazzata era registrata come `igdb-sweep` quando IGDB era l'unica fonte.
// Lo scheduler vecchio vive in Redis e continuerebbe a sparare per conto suo
// accanto al nuovo: si toglie qui, non serve ricordarsene a mano.
await enrichmentQueue.removeJobScheduler('igdb-sweep');
await scheduleEnrichmentSweep();

console.log('worker in ascolto sulle code enrichment e imports');

// Senza chiusura pulita i job in corso verrebbero persi e riprovati inutilmente.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal}: chiudo i worker…`);
    await Promise.all([worker.close(), importsWorker.close()]);
    process.exit(0);
  });
}
