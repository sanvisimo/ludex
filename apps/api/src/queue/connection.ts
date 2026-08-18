import type { ConnectionOptions } from "bullmq";

// Una sola definizione di connessione, condivisa da chi accoda (il server HTTP)
// e da chi consuma (il worker). Sono processi separati che parlano attraverso
// Redis: è proprio quello il punto.
export const redisConnection: ConnectionOptions = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  // BullMQ lo pretende per i comandi bloccanti del worker.
  maxRetriesPerRequest: null,
};
