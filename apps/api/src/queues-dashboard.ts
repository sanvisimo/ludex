import "./env";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import { enrichmentQueue } from "./queue/enrichment";
import { importsQueue } from "./queue/imports";

// Arnese, non pipeline: si accende quando qualcosa nelle code non torna — un
// enrichment fermo, un import fallito, la spazzata che non è ripartita — e si
// spegne subito dopo. Per questo non sta dentro `pnpm dev`.
//
// Processo suo e porta sua, non montato su server.ts: è una superficie da
// operatore, e l'API pubblica non deve averla addosso. Non c'è ancora un ruolo
// admin (è lo step 9) e non lo si inventa qui: la protezione è che ascolta
// **solo su localhost**. Da remoto ci si arriva con un tunnel SSH, non
// esponendo la porta.
const port = Number(process.env.BULL_BOARD_PORT ?? 3002);

const serverAdapter = new HonoAdapter(serveStatic);

createBullBoard({
  // Le stesse `Queue` che usano server.ts e worker.ts: qui non si ridichiara
  // niente, si legge lo stato che vive in Redis.
  queues: [new BullMQAdapter(enrichmentQueue), new BullMQAdapter(importsQueue)],
  serverAdapter,
});

serverAdapter.setBasePath("/");

const app = new Hono();
app.route("/", serverAdapter.registerPlugin());

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(`dashboard code su http://localhost:${port}`);
});
