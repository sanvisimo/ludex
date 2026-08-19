"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
// Una sola definizione di connessione, condivisa da chi accoda (il server HTTP)
// e da chi consuma (il worker). Sono processi separati che parlano attraverso
// Redis: è proprio quello il punto.
exports.redisConnection = {
    url: (_a = process.env.REDIS_URL) !== null && _a !== void 0 ? _a : 'redis://localhost:6379',
    // BullMQ lo pretende per i comandi bloccanti del worker.
    maxRetriesPerRequest: null,
};
