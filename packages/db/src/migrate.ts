import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from './index';

// Il path della cartella delle migration sta qui e non in chi lo usa: le
// migration le possiede questo package, e chi le applica (oggi il setup dei test)
// non deve sapere com'è fatto dentro. `import.meta.url` invece di un path
// relativo al cwd, perché il chiamante gira da un'altra cartella.
export const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;

/**
 * Applica le migration al database puntato da `DATABASE_URL`.
 *
 * In sviluppo lo fa `pnpm db:migrate` con drizzle-kit; questa esiste per il
 * database di test, che va creato e migrato da codice prima che i test partano.
 */
export function runMigrations() {
  return migrate(db, { migrationsFolder });
}
