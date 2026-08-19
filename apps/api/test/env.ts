import { config } from "dotenv";

// Caricato sia dal config di vitest sia dal global setup, che girano in processi
// diversi: entrambi devono arrivare alla stessa URL senza passarsela.
config({ path: "../../.env" });

/**
 * URL del database di test.
 *
 * È un database separato nello stesso container: i test troncano le tabelle a
 * ogni caso, e puntare lo stesso `DATABASE_URL` dello sviluppo vorrebbe dire
 * cancellare la propria libreria lanciando `pnpm test`.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL non impostata: vedi .env.example");
}

// Rifiuta di partire se punta al database di sviluppo. La svista costerebbe i
// dati, e un controllo qui costa una riga.
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL è uguale a DATABASE_URL: i test cancellerebbero i tuoi dati");
}
