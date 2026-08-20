import './env';

import { storeAccountName } from '@repo/contracts';
import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
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
import { importAmazonLibrary } from './services/amazon-import';
import { importEpicLibrary } from './services/epic-import';
import { importGogLibrary } from './services/gog-import';
import { importPsnLibrary } from './services/psn-import';
import { type ImportReport } from './services/library-import';
import { importSteamLibrary } from './services/steam-import';
import {
  type StoreAccountRow,
  StoreReauthRequiredError,
} from './services/store-accounts';

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

// L'unico punto in cui un negozio diventa una funzione, come `enrichers` qui
// sopra: il worker non sa quali negozi esistano, sa che ce n'è uno da importare.
//
// Prendono tutti **la riga dell'account** e non `(userId, store)`: da lì si
// leggono l'utente, l'identità pubblica e il credenziale cifrato. Steam non ha
// più un argomento in più — il suo SteamID64 è `externalAccountId`, e tenerne
// una copia nel job voleva dire due posti da cui poteva arrivare la verità.
const importers: Partial<
  Record<Store, (account: StoreAccountRow) => Promise<ImportReport>>
> = {
  steam: importSteamLibrary,
  gog: importGogLibrary,
  epic: importEpicLibrary,
  amazon: importAmazonLibrary,
  psn: importPsnLibrary,
};

// Coda a parte: un import genera centinaia di job di enrichment, e sulla stessa
// coda finirebbe in fila dietro il lavoro che ha appena prodotto.
const importsWorker = new Worker<ImportJob>(
  IMPORTS_QUEUE,
  async (job) => {
    const { storeAccountId } = job.data;

    // L'account si rilegge qui e non arriva dentro il job: fra l'accodamento e
    // adesso può essere stato scollegato, o il suo token rinnovato da qualcun
    // altro. Un job che porta con sé una copia della riga lavora su una verità
    // vecchia di minuti.
    const account = await db.query.storeAccounts.findFirst({
      where: eq(schema.storeAccounts.id, storeAccountId),
    });

    // Scollegato mentre il job aspettava in coda. Non è un guasto e riprovare
    // non lo aggiusta: l'utente ha detto che quell'account non lo vuole più.
    if (!account || account.status === 'unlinked') {
      throw new UnrecoverableError(
        `L'account ${storeAccountId} non è più collegato`,
      );
    }

    try {
      const importer = importers[account.store];
      // Un negozio non ancora implementato non deve fallire tre volte con un
      // "not a function": succede solo se qualcuno accoda a mano dalla
      // dashboard, ma il messaggio deve dirlo.
      if (!importer) {
        throw new UnrecoverableError(
          `Nessun import per il negozio ${account.store}`,
        );
      }

      const report = await importer(account);

      // L'account e non l'utente: con due account sullo stesso negozio, due
      // righe di log con lo stesso userId sarebbero indistinguibili — lo stesso
      // problema che le schede avevano a schermo.
      console.log(
        `[import] ${account.store} ${storeAccountName(account)}: ${report.total} in libreria, ` +
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
