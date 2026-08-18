import postgres from "postgres";

import { testDatabaseUrl } from "./env";

// Gira una volta prima di tutti i file di test, in un processo suo: quello che
// scrive in `process.env` non arriva ai worker, e per questo `DATABASE_URL` la
// imposta il config di vitest e non questo file.

/** Crea il database di test se non c'è. Idempotente: al secondo giro non fa nulla. */
async function ensureDatabase() {
  const url = new URL(testDatabaseUrl!);
  const name = url.pathname.slice(1);

  // Un CREATE DATABASE non si può eseguire dal database che si sta creando: si
  // passa da `postgres`, che esiste sempre.
  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { max: 1 });

  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${name}`;
    if (!existing) await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
}

export async function setup() {
  await ensureDatabase();

  // Importata dopo `ensureDatabase` e con DATABASE_URL già dirottata dal config:
  // @repo/db apre la connessione al momento dell'import, quindi importarla prima
  // la aprirebbe verso il database sbagliato — o verso uno che non esiste ancora.
  process.env.DATABASE_URL = testDatabaseUrl;
  const { runMigrations } = await import("@repo/db/migrate");
  await runMigrations();
}

// Importare @repo/db qui dentro ha aperto un pool anche in *questo* processo,
// che non è quello dei test: senza chiuderlo vitest resta appeso dieci secondi a
// fine corsa e stampa un avviso.
export async function teardown() {
  const { db } = await import("@repo/db");
  await db.$client.end();
}
