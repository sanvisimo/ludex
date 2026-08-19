"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
require("./env");
var api_1 = require("@bull-board/api");
var bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
var hono_1 = require("@bull-board/hono");
var node_server_1 = require("@hono/node-server");
var serve_static_1 = require("@hono/node-server/serve-static");
var hono_2 = require("hono");
var enrichment_1 = require("./queue/enrichment");
var imports_1 = require("./queue/imports");
// Arnese, non pipeline: si accende quando qualcosa nelle code non torna — un
// enrichment fermo, un import fallito, la spazzata che non è ripartita — e si
// spegne subito dopo. Per questo non sta dentro `pnpm dev`.
//
// Processo suo e porta sua, non montato su server.ts: è una superficie da
// operatore, e l'API pubblica non deve averla addosso. Non c'è ancora un ruolo
// admin (è lo step 9) e non lo si inventa qui: la protezione è che ascolta
// **solo su localhost**. Da remoto ci si arriva con un tunnel SSH, non
// esponendo la porta.
var port = Number((_a = process.env.BULL_BOARD_PORT) !== null && _a !== void 0 ? _a : 3002);
var serverAdapter = new hono_1.HonoAdapter(serve_static_1.serveStatic);
(0, api_1.createBullBoard)({
    // Le stesse `Queue` che usano server.ts e worker.ts: qui non si ridichiara
    // niente, si legge lo stato che vive in Redis.
    queues: [new bullMQAdapter_1.BullMQAdapter(enrichment_1.enrichmentQueue), new bullMQAdapter_1.BullMQAdapter(imports_1.importsQueue)],
    serverAdapter: serverAdapter,
});
serverAdapter.setBasePath('/');
var app = new hono_2.Hono();
app.route('/', serverAdapter.registerPlugin());
(0, node_server_1.serve)({ fetch: app.fetch, port: port, hostname: '127.0.0.1' }, function (_a) {
    var port = _a.port;
    console.log("dashboard code su http://localhost:".concat(port));
});
