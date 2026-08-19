/**
 * Postgres 23505: una violazione di vincolo unique.
 *
 * Si scorre la catena delle cause perché Drizzle non rilancia l'errore di
 * postgres-js: lo avvolge in un "Failed query" con la query e i parametri, e il
 * codice resta un livello più sotto.
 *
 * Sta in `lib/` perché lo guardano in tre — l'aggancio HLTB, quello OpenCritic
 * e la risoluzione in blocco — e in tutti e tre i casi per la stessa ragione:
 * un unique che salta su `(fonte, id esterno)` non è un guasto, è la prova che
 * due nostri giochi stanno puntando alla stessa voce.
 */
export function isUniqueViolation(error: unknown) {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    if ('code' in current && current.code === '23505') return true;
  }
  return false;
}
