import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./test/env";

export default defineConfig({
  test: {
    // @repo/db apre la connessione leggendo `DATABASE_URL` al momento dell'import.
    // Dirottarla qui è l'unico punto che precede con certezza qualunque import
    // dei file di test: farlo in un setup file sarebbe una corsa.
    env: { DATABASE_URL: testDatabaseUrl },
    globalSetup: ["./test/global-setup.ts"],
    // Azzera implementazione e cronologia dei mock fra un caso e l'altro. Senza,
    // un `toHaveBeenCalled` legge le chiamate del test precedente e il caso
    // sembra passare (o fallire) per ragioni che non sono le sue.
    mockReset: true,
    setupFiles: ["./test/setup.ts"],
    // I file condividono un solo database e si troncano le tabelle a vicenda:
    // in parallelo si darebbero il tappeto da sotto i piedi.
    fileParallelism: false,
  },
});
