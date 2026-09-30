import '../env';

import {
  backfillGameMedia,
  countGamesWithoutMedia,
  mediaCoverage,
} from '../services/game-media';

// Riempie media, autori e giochi legati sui giochi arricchiti prima della
// pagina del gioco (12d), e dice su quanti giochi c'è ciascuna cosa.
//
//   pnpm --filter api igdb:media [quanti]
//
// Cento giochi per richiesta a IGDB. Serve al primo giro: da lì in avanti li
// scrive l'enrichment, che passa comunque.

const limit = Number(process.argv[2] ?? 1000);
const report = await backfillGameMedia(limit);

console.log(
  `${report.candidati} giochi da riempire, ${report.trovati} noti a IGDB, ` +
    `${report.scritti} scritti`,
);

const restano = await countGamesWithoutMedia();
if (restano > 0) console.log(`ne restano ${restano}: rilancia per continuare`);

const c = await mediaCoverage();
const pct = (n: number) =>
  c.giochi === 0 ? '—' : `${Math.round((n / c.giochi) * 100)}%`;
console.log(`\nsu ${c.giochi} giochi coi campi nuovi:`);
console.log(`  artwork      ${c.artwork}  ${pct(c.artwork)}`);
console.log(`  screenshot   ${c.screenshot}  ${pct(c.screenshot)}`);
console.log(`  video        ${c.video}  ${pct(c.video)}`);
console.log(`  sviluppo     ${c.sviluppo}  ${pct(c.sviluppo)}`);
console.log(`  remake/rem.  ${c.remake}  ${pct(c.remake)}`);
console.log(`  simili       ${c.simili}  ${pct(c.simili)}`);

process.exit(0);
