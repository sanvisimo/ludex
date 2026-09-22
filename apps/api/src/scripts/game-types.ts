import '../env';

import {
  backfillGameTypes,
  countGamesWithoutType,
} from '../services/game-types';

// Riempie in blocco `game_type` e `parent_igdb_id` sui giochi che c'erano prima
// di quelle colonne.
//
//   pnpm --filter api igdb:types [quanti]
//
// Chiede due campi a IGDB, 500 id per richiesta. Serve al primo giro: da lì in
// avanti li scrive l'enrichment, che passa comunque.

const limit = Number(process.argv[2] ?? 1000);
const report = await backfillGameTypes(limit);

console.log(
  `${report.candidati} giochi senza tipo, ${report.trovati} noti a IGDB, ` +
    `${report.scritti} scritti`,
);

const restano = await countGamesWithoutType();
if (restano > 0) console.log(`ne restano ${restano}: rilancia per continuare`);

process.exit(0);
