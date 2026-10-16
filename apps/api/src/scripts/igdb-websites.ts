import '../env';

import {
  backfillGameWebsites,
  countGamesWithoutWebsites,
  websitesCoverage,
} from '../services/game-websites';

// Riempie i link della pagina del gioco (`websites`) sui giochi arricchiti
// prima della colonna, e dice su quanti giochi c'è ciascun tipo.
//
//   pnpm --filter api igdb:websites [quanti]
//
// Cento giochi per richiesta a IGDB. Serve al primo giro: da lì in avanti li
// scrive l'enrichment, che passa comunque. La misura che ha deciso quali tipi
// tenere è in plans/link-pagina-gioco.md.

const limit = Number(process.argv[2] ?? 1000);
const report = await backfillGameWebsites(limit);

console.log(
  `${report.candidati} giochi da riempire, ${report.trovati} noti a IGDB, ` +
    `${report.scritti} scritti`,
);

const restano = await countGamesWithoutWebsites();
if (restano > 0) console.log(`ne restano ${restano}: rilancia per continuare`);

const c = await websitesCoverage();
const pct = (n: number) =>
  c.giochi === 0 ? '—' : `${Math.round((n / c.giochi) * 100)}%`;
console.log(`\nsu ${c.giochi} giochi con la colonna, ${c.senza} senza link:`);
for (const { type, giochi } of c.tipi) {
  console.log(
    `  ${type.padEnd(12)} ${String(giochi).padStart(5)}  ${pct(giochi)}`,
  );
}

process.exit(0);
