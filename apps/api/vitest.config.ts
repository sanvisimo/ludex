import { defineConfig } from 'vitest/config';

import { testDatabaseUrl } from './test/env';

export default defineConfig({
  // I `.ts` prima dei `.js`, al contrario del default di Vite.
  //
  // Non è una preferenza di stile: `tsc src/foo.ts` — con il file passato a
  // mano — ignora il tsconfig, quindi anche il suo `noEmit`, e scrive un
  // `foo.js` CommonJS accanto al sorgente. Con l'ordine di default vitest
  // caricava quello invece del `.ts`, e in un package "type": "module" muore
  // su `exports is not defined`: cinque suite non partivano, e l'errore non
  // nominava nessuno dei file che le avevano rotte. È già successo una volta.
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  test: {
    // @repo/db apre la connessione leggendo `DATABASE_URL` al momento dell'import.
    // Dirottarla qui è l'unico punto che precede con certezza qualunque import
    // dei file di test: farlo in un setup file sarebbe una corsa.
    env: { DATABASE_URL: testDatabaseUrl },
    globalSetup: ['./test/global-setup.ts'],
    // Azzera implementazione e cronologia dei mock fra un caso e l'altro. Senza,
    // un `toHaveBeenCalled` legge le chiamate del test precedente e il caso
    // sembra passare (o fallire) per ragioni che non sono le sue.
    mockReset: true,
    setupFiles: ['./test/setup.ts'],
    // I file condividono un solo database e si troncano le tabelle a vicenda:
    // in parallelo si darebbero il tappeto da sotto i piedi.
    fileParallelism: false,
  },
});
