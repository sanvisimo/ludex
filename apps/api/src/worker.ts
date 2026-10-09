import './env';

import { storeAccountName } from '@repo/contracts';
import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { UnrecoverableError, Worker, type Job } from 'bullmq';

import { openCriticEnabled, openCriticQuota } from './external/opencritic';
import {
  flushGameChanges,
  flushSourcesChanged,
  notifyGameChanged,
  notifySourcesChanged,
  publishEvent,
} from './lib/events';
import { redisConnection } from './queue/connection';
import {
  ENRICHMENT_QUEUE,
  enqueueEnrichment,
  enrichmentQueue,
  scheduleEnrichmentSweep,
  scheduleOpenCriticResolve,
  type EnrichmentJob,
} from './queue/enrichment';
import {
  IMPORTS_QUEUE,
  type ImportJob,
  type ImportsSweepJob,
  isImportsSweep,
  scheduleImportsSweep,
} from './queue/imports';
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
import { enqueueDueImports } from './services/library-sync';
import { importNintendoLibrary } from './services/nintendo-import';
import { importPsnLibrary } from './services/psn-import';
import { type ImportReport } from './services/library-import';
import { SteamLibraryNotVisibleError } from './external/steam';
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
 *
 * Con `ENABLE_OPENCRITIC=0` il budget è zero per definizione.
 */
function sweepLimit(source: EnrichmentSource) {
  if (source !== 'opencritic') return 100;
  if (!openCriticEnabled()) return 0;
  const { requests } = openCriticQuota();
  return requests === null ? 100 : Math.max(0, Math.min(100, requests));
}

const worker = new Worker<EnrichmentJob>(
  ENRICHMENT_QUEUE,
  async (job) => {
    if (job.data.type === 'resolve' || job.data.type === 'post-import') {
      // Non arricchisce e non parla con le fonti: chiede a Wikidata gli id
      // OpenCritic dei giochi che non ne hanno uno e li scrive. È quello che
      // evita di spendere le 25 ricerche al giorno per l'identità dei giochi.
      const report = await resolveOpenCriticIds();
      console.log(
        `[enrichment] aggancio opencritic: ${report.candidati} da agganciare, ` +
          `${report.conMappa} noti a Wikidata, ${report.agganciati} scritti` +
          (report.conflitti > 0 ? `, ${report.conflitti} in conflitto` : ''),
      );
      if (job.data.type === 'resolve') return report;

      // Dopo un import: i giochi appena agganciati prendono il voto adesso e
      // non alla prossima spazzata. Solo chi l'id ce l'ha, cioè una richiesta
      // a testa e mai una ricerca, e non oltre il budget del giorno — è la
      // ragione per cui OpenCritic non segue IGDB come HLTB e Metacritic.
      const limit = sweepLimit('opencritic');
      const games =
        limit > 0
          ? await findGamesNeedingSource('opencritic', limit, {
              onlyLinked: true,
            })
          : [];
      for (const game of games) await enqueueEnrichment('opencritic', game.id);
      console.log(
        `[enrichment] dopo l'import: ${games.length} giochi accodati su opencritic`,
      );
      return { ...report, enqueued: games.length };
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
    // La spazzata spenta non basta: `backfill` e `catchup` accodano da fuori, e
    // un job può essere in coda da prima. Si chiude senza toccare
    // `game_sources`, così alla riaccensione il gioco risulta ancora dovuto.
    if (source === 'opencritic' && !openCriticEnabled()) {
      console.log(`[enrichment] opencritic ${gameId} -> saltato (spento)`);
      return { status: 'disabled' };
    }
    const outcome = await enrichers[source](gameId);
    console.log(`[enrichment] ${source} ${gameId} -> ${outcome.status}`);
    // Solo `ok` cambia ciò che una pagina mostra: un `not_found` scrive lo
    // stato della fonte, che nessuna schermata legge.
    if (outcome.status === 'ok') notifyGameChanged(gameId);
    return outcome;
  },
  {
    connection: redisConnection,
    // Basso di proposito: il collo di bottiglia è il rate limit delle fonti —
    // 4 richieste al secondo su IGDB, 1 su HLTB — che i client gia' rispettano
    // serializzando. Alzare qui non farebbe andare piu' veloce, farebbe solo
    // accumulare attese.
    concurrency: 2,
  },
);

// Lo stato di una fonte cambia con qualunque esito — `ok`, `not_found`, `failed`
// — e «Dati mancanti» dell'admin lo legge: `notifyGameChanged` non basta, parla
// solo dei giochi che una pagina mostra.
worker.on('completed', (job) => {
  if (job.data.type === 'enrich') notifySourcesChanged();
});

worker.on('failed', (job, error) => {
  console.error(`[enrichment] job ${job?.id} fallito:`, error.message);
  if (job?.data.type === 'enrich') notifySourcesChanged();
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
  nintendo: importNintendoLibrary,
};

// Coda a parte: un import genera centinaia di job di enrichment, e sulla stessa
// coda finirebbe in fila dietro il lavoro che ha appena prodotto.
const importsWorker = new Worker<ImportJob | ImportsSweepJob>(
  IMPORTS_QUEUE,
  async (job) => {
    if (isImportsSweep(job.data)) {
      // Come la spazzata dell'enrichment: accoda, non importa. Gli import veri
      // restano un job per account, in fila dietro a questo.
      const queued = await enqueueDueImports();
      console.log(`[import] spazzata: ${queued} account accodati`);
      return { queued };
    }

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
      // Un profilo privato non diventa pubblico fra un tentativo e l'altro: i tre
      // giri con backoff sono per le reti che cadono. Il messaggio dice cosa
      // fare — rendere pubblico il profilo, o accedere con Steam.
      if (error instanceof SteamLibraryNotVisibleError) {
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

/**
 * Avvisa il proprietario dell'account che un tentativo d'import è partito o
 * finito.
 *
 * Negli eventi del worker e non nel `finally` del processore, ed è il punto:
 * `completed` e `failed` arrivano dopo che BullMQ ha chiuso il job e liberato
 * la chiave di deduplicazione, cioè quando `syncing` è già falso. Un avviso
 * mandato prima farebbe rileggere un account ancora `syncing`, e nessun evento
 * dopo verrebbe a smentirlo.
 */
async function publishImportEvent(
  job: Job<ImportJob | ImportsSweepJob> | undefined,
  phase: 'started' | 'finished',
) {
  if (!job || isImportsSweep(job.data)) return;
  const { storeAccountId } = job.data;
  try {
    const account = await db.query.storeAccounts.findFirst({
      columns: { userId: true },
      where: eq(schema.storeAccounts.id, storeAccountId),
    });
    if (account)
      await publishEvent({
        type: 'import',
        phase,
        storeAccountId,
        userId: account.userId,
      });
  } catch (error) {
    console.error(
      `[import] avviso ${phase} non mandato per ${storeAccountId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

importsWorker.on('active', (job) => void publishImportEvent(job, 'started'));
importsWorker.on(
  'completed',
  (job) => void publishImportEvent(job, 'finished'),
);
importsWorker.on('failed', (job, error) => {
  console.error(`[import] job ${job?.id} fallito:`, error.message);
  void publishImportEvent(job, 'finished');
});

// La spazzata era registrata come `igdb-sweep` quando IGDB era l'unica fonte.
// Lo scheduler vecchio vive in Redis e continuerebbe a sparare per conto suo
// accanto al nuovo: si toglie qui, non serve ricordarsene a mano.
await enrichmentQueue.removeJobScheduler('igdb-sweep');
await scheduleEnrichmentSweep();
await scheduleOpenCriticResolve();
await scheduleImportsSweep();

console.log('worker in ascolto sulle code enrichment e imports');

// Senza chiusura pulita i job in corso verrebbero persi e riprovati inutilmente.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal}: chiudo i worker…`);
    await Promise.all([worker.close(), importsWorker.close()]);
    // L'ultimo blocco di giochi non aspetta il suo timer: il processo muore.
    await Promise.all([flushGameChanges(), flushSourcesChanged()]);
    process.exit(0);
  });
}
