import './env';

import { UnrecoverableError, Worker } from 'bullmq';

import { openCriticQuota } from './external/opencritic';
import { redisConnection } from './queue/connection';
import {
  ENRICHMENT_QUEUE,
  enqueueEnrichment,
  enrichmentQueue,
  scheduleEnrichmentSweep,
  scheduleOpenCriticResolve,
  type EnrichmentJob,
} from './queue/enrichment';
import { IMPORTS_QUEUE, type ImportJob } from './queue/imports';
import {
  ENRICHMENT_SOURCE_NAMES,
  findGamesNeedingSource,
  type EnrichmentSource,
} from './services/enrichment';
import { enrichGameFromHltb } from './services/hltb-enrichment';
import { enrichGameFromIgdb } from './services/igdb-enrichment';
import { enrichGameFromMetacritic } from './services/metacritic-enrichment';
import { enrichGameFromOpenCritic } from './services/opencritic-enrichment';
import { resolveOpenCriticIds } from './services/opencritic-resolve';
import { importGogLibrary } from './services/gog-import';
import { importSteamLibrary } from './services/steam-import';
import { StoreReauthRequiredError } from './services/store-accounts';

// Secondo entrypoint di apps/api. Stesso codebase e stessi servizi di server.ts,
// ma qui non si espone HTTP: i job non devono girare nel processo che serve le
// richieste, o uno scrape pesante degraderebbe le API. In sviluppo partono
// insieme, in produzione si scalano e si deployano separatamente.

// L'unico punto in cui una fonte diventa una funzione. Tutto il resto della
// pipeline — predicato, accodamento, spazzata — non sa che fonti esistono.
const enrichers = {
  igdb: enrichGameFromIgdb,
  hltb: enrichGameFromHltb,
  opencritic: enrichGameFromOpenCritic,
  metacritic: enrichGameFromMetacritic,
};

/**
 * Quanti giochi accodare per una fonte a ogni spazzata.
 *
 * Cento per le fonti che hanno un limite al secondo: quello lo rispettano già i
 * client, serializzando, e accodarne di più vuol dire solo aspettare di più.
 *
 * OpenCritic no: il suo limite è **al giorno**, e la coda non lo conosce.
 * Accodarne cento con un budget di venti significherebbe ottanta job che si
 * svegliano, scoprono il muro e tornano a dormire — rumore nei log e nella
 * dashboard, per giunta indistinguibile da un guasto vero. Si accoda quello
 * che si può spendere, e il resto lo prende la spazzata di stanotte.
 *
 * `null` vuol dire che il budget non lo sappiamo ancora — nessuna risposta è
 * ancora arrivata da quando il worker è partito — e lì si prova: la prima
 * risposta ce lo dirà.
 */
function sweepLimit(source: EnrichmentSource) {
  if (source !== 'opencritic') return 100;
  const { requests } = openCriticQuota();
  return requests === null ? 100 : Math.max(0, Math.min(100, requests));
}

const worker = new Worker<EnrichmentJob>(
  ENRICHMENT_QUEUE,
  async (job) => {
    if (job.data.type === 'resolve') {
      // Non arricchisce e non parla con le fonti: chiede a Wikidata gli id
      // OpenCritic dei giochi che non ne hanno uno e li scrive. È quello che
      // evita di spendere le 25 ricerche al giorno per l'identità dei giochi.
      const report = await resolveOpenCriticIds();
      console.log(
        `[enrichment] aggancio opencritic: ${report.candidati} da agganciare, ` +
          `${report.conMappa} noti a Wikidata, ${report.agganciati} scritti` +
          (report.conflitti > 0 ? `, ${report.conflitti} in conflitto` : ''),
      );
      return report;
    }

    if (job.data.type === 'sweep') {
      // La spazzata non arricchisce: accoda. Il lavoro vero resta un job per
      // gioco e per fonte, con i suoi tentativi e il suo stato.
      let enqueued = 0;
      for (const source of ENRICHMENT_SOURCE_NAMES) {
        const limit = sweepLimit(source);
        const games =
          limit > 0 ? await findGamesNeedingSource(source, limit) : [];
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
    const { store, userId } = job.data;

    try {
      const report =
        store === 'steam'
          ? await importSteamLibrary(userId, job.data.steamId!)
          : await importGogLibrary(userId);

      console.log(
        `[import] ${store} ${userId}: ${report.total} in libreria, ` +
          `${report.resolved} risolti (${report.resolvedByName} per nome, ` +
          `${report.newGames} giochi nuovi, ${report.newEntries} aggiunti al ` +
          `backlog), ${report.unresolved} da sistemare`,
      );
      return report;
    } catch (error) {
      // Un credenziale morto non si aggiusta riprovando: i tre tentativi con
      // backoff esponenziale servono alle reti che cadono, non a un refresh
      // token revocato. `UnrecoverableError` li salta e manda il job a fallito
      // subito, che è anche ciò che libera la chiave di deduplicazione.
      // Lo stato `needs_reauth` sulla riga l'ha già scritto chi ha alzato.
      if (error instanceof StoreReauthRequiredError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
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
await scheduleOpenCriticResolve();

console.log('worker in ascolto sulle code enrichment e imports');

// Senza chiusura pulita i job in corso verrebbero persi e riprovati inutilmente.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal}: chiudo i worker…`);
    await Promise.all([worker.close(), importsWorker.close()]);
    process.exit(0);
  });
}
