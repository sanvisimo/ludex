import '../env';

import { findIgdbGamesByExternalIds } from '../external/igdb';
import { fetchSteamLibrary } from '../external/steam';
import { findGameIdsByExternalIds } from '../services/games';

// Giro a vuoto dell'import: legge Steam, prova a risolvere, **non scrive niente**.
//
//   pnpm --filter api steam:probe [steamid64]
//
// Serve a guardare una libreria vera prima di darla in pasto al job, e a vedere
// cosa non si risolve. Senza argomento usa STEAM_TEST_USER_ID.

const steamId = process.argv[2] ?? process.env.STEAM_TEST_USER_ID;
if (!steamId) {
  console.error(
    'manca lo SteamID64: passalo come argomento o metti STEAM_TEST_USER_ID nel .env',
  );
  process.exit(1);
}

const library = await fetchSteamLibrary(steamId);
const known = await findGameIdsByExternalIds(
  'steam',
  library.map((entry) => entry.externalId),
);
const missing = library.filter((entry) => !known.has(entry.externalId));
const matches = await findIgdbGamesByExternalIds(
  'steam',
  missing.map((entry) => entry.externalId),
);
const unresolved = missing.filter((entry) => !matches.has(entry.externalId));

const giocati = library.filter((entry) => entry.playtimeMinutes > 0);

console.log(`\nlibreria di ${steamId}`);
console.log(`  voci:                 ${library.length}`);
console.log(`  già note a Ludex:     ${known.size}`);
console.log(`  risolte ora su IGDB:  ${matches.size}`);
console.log(`  irrisolte:            ${unresolved.length}`);
console.log(`  con ore addosso:      ${giocati.length}`);

if (unresolved.length > 0) {
  console.log('\n  da sistemare a mano:');
  for (const entry of unresolved) {
    const ore =
      entry.playtimeMinutes > 0
        ? ` (${Math.round(entry.playtimeMinutes / 60)}h)`
        : '';
    console.log(`    ${entry.externalId.padEnd(9)} ${entry.name}${ore}`);
  }
}

console.log();
process.exit(0);
