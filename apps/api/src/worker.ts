import "./env";

import { Worker } from "bullmq";

import { redisConnection } from "./queue/connection";
import {
  ENRICHMENT_QUEUE,
  enqueueIgdbEnrichment,
  scheduleIgdbSweep,
  type EnrichmentJob,
} from "./queue/enrichment";
import { enrichGameFromIgdb, findGamesNeedingIgdb } from "./services/enrichment";

// Secondo entrypoint di apps/api. Stesso codebase e stessi servizi di server.ts,
// ma qui non si espone HTTP: i job non devono girare nel processo che serve le
// richieste, o uno scrape pesante degraderebbe le API. In sviluppo partono
// insieme, in produzione si scalano e si deployano separatamente.

const worker = new Worker<EnrichmentJob>(
  ENRICHMENT_QUEUE,
  async (job) => {
    if (job.data.type === "sweep") {
      // La spazzata non arricchisce: accoda. Il lavoro vero resta un job per
      // gioco, con i suoi tentativi e il suo stato.
      const games = await findGamesNeedingIgdb();
      for (const game of games) await enqueueIgdbEnrichment(game.id);
      console.log(`[enrichment] spazzata: ${games.length} giochi accodati`);
      return { enqueued: games.length };
    }

    const outcome = await enrichGameFromIgdb(job.data.gameId);
    console.log(`[enrichment] ${job.data.gameId} -> ${outcome.status}`);
    return outcome;
  },
  {
    connection: redisConnection,
    // Basso di proposito: il collo di bottiglia è il rate limit di IGDB (4
    // richieste al secondo), che il client gia' rispetta serializzando. Alzare
    // qui non farebbe andare piu' veloce, farebbe solo accumulare attese.
    concurrency: 2,
  },
);

worker.on("failed", (job, error) => {
  console.error(`[enrichment] job ${job?.id} fallito:`, error.message);
});

await scheduleIgdbSweep();

console.log("worker in ascolto sulla coda enrichment");

// Senza chiusura pulita i job in corso verrebbero persi e riprovati inutilmente.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal}: chiudo il worker…`);
    await worker.close();
    process.exit(0);
  });
}
