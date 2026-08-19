"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichmentQueue = exports.ENRICHMENT_QUEUE = void 0;
exports.enqueueEnrichment = enqueueEnrichment;
exports.scheduleEnrichmentSweep = scheduleEnrichmentSweep;
var bullmq_1 = require("bullmq");
var connection_1 = require("./connection");
exports.ENRICHMENT_QUEUE = 'enrichment';
exports.enrichmentQueue = new bullmq_1.Queue(exports.ENRICHMENT_QUEUE, {
    connection: connection_1.redisConnection,
    defaultJobOptions: {
        attempts: 3,
        // Le fonti esterne possono essere temporaneamente irraggiungibili: si
        // riprova diradando.
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
    },
});
/**
 * Accoda l'enrichment di un gioco da una fonte.
 *
 * Deduplicato per (fonte, gioco): se lo stesso gioco viene importato da tre
 * utenti nello stesso momento, BullMQ scarta i doppioni invece di chiamare IGDB
 * tre volte. La chiave comprende la fonte perché IGDB e HLTB dello stesso gioco
 * sono due lavori distinti, che possono benissimo stare in coda insieme.
 *
 * Si usa `deduplication` e **non `jobId`**, che sarebbe la strada ovvia. Con un
 * jobId fisso un secondo accodamento non viene aggiunto finché quell'id esiste in
 * Redis — e i job completati restano, per via di `removeOnComplete`. Il riaccodo
 * di un gioco già arricchito (cioè tutto il senso della spazzata: riprendere i
 * dati stantii) verrebbe quindi ingoiato in silenzio, e `add` restituirebbe
 * comunque un Job che sembra valido. Senza `ttl` la chiave di deduplicazione vive
 * quanto il job — collassa gli accodamenti concorrenti — e si libera quando
 * finisce, che è esattamente il comportamento che serve.
 *
 * Non solleva mai. L'accodamento e' un effetto collaterale della creazione di un
 * gioco: se Redis e' giu', il gioco deve nascere lo stesso e l'utente non deve
 * vedere un errore. Il lavoro non si perde — `findGamesNeedingSource` ritrova i
 * giochi senza `synced_at`, che e' proprio a cosa serve `game_sources`.
 */
function enqueueEnrichment(source, gameId) {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, exports.enrichmentQueue.add('enrich', { type: 'enrich', source: source, gameId: gameId }, { deduplication: { id: "".concat(source, "-").concat(gameId) } })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("[enrichment] accodamento ".concat(source, " fallito per ").concat(gameId, ":"), error_1 instanceof Error ? error_1.message : error_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
var SWEEP_SCHEDULER_ID = 'enrichment-sweep';
var SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
/**
 * Registra la spazzata periodica.
 *
 * E' uno *scheduler* di BullMQ e non un setInterval nel processo: cosi' lo stato
 * vive in Redis, e con piu' worker in esecuzione la spazzata parte una volta
 * sola invece che una per processo. `upsert` lo rende sicuro da rieseguire a
 * ogni avvio.
 */
function scheduleEnrichmentSweep() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.enrichmentQueue.upsertJobScheduler(SWEEP_SCHEDULER_ID, { every: SWEEP_EVERY_MS }, { name: 'sweep', data: { type: 'sweep' } })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
