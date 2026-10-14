import '../env';

import {
  backfillGamePlatforms,
  countGamesWithoutPlatforms,
} from '../services/game-platforms';

// Riempie in blocco `platform_igdb_ids` sui giochi che c'erano prima della
// colonna (9b PSN).
//
//   pnpm --filter api igdb:platforms [quanti]
//
// Chiede un campo a IGDB, 500 id per richiesta. Serve al primo giro: da lì in
// avanti lo scrive l'enrichment, che passa comunque.

const limit = Number(process.argv[2] ?? 1000);
const report = await backfillGamePlatforms(limit);

console.log(
  `${report.candidati} giochi senza piattaforme, ${report.trovati} noti a IGDB, ` +
    `${report.scritti} scritti`,
);

const restano = await countGamesWithoutPlatforms();
if (restano > 0) console.log(`ne restano ${restano}: rilancia per continuare`);

process.exit(0);
