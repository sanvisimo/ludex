/**
 * Postgres 23505: una violazione di vincolo unique. Con `constraint`, solo
 * quella di quel vincolo.
 *
 * Si scorre la catena delle cause perché Drizzle non rilancia l'errore di
 * postgres-js: lo avvolge in un "Failed query" con la query e i parametri, e il
 * codice resta un livello più sotto.
 *
 * Sta in `lib/` perché lo guardano in tre — l'aggancio HLTB, quello OpenCritic
 * e la risoluzione in blocco — e in tutti e tre i casi per la stessa ragione:
 * un unique che salta su `(fonte, id esterno)` non è un guasto, è la prova che
 * due nostri giochi stanno puntando alla stessa voce. Il quarto è lo slug dei
 * giochi (12f), che con il vincolo in mano distingue la sua corsa dalle altre.
 */
export function isUniqueViolation(error: unknown, constraint?: string) {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    if ('code' in current && current.code === '23505')
      return (
        constraint === undefined ||
        ('constraint_name' in current && current.constraint_name === constraint)
      );
  }
  return false;
}
