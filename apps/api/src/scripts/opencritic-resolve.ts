import '../env';

import { resolveOpenCriticIds } from '../services/opencritic-resolve';

// Aggancia in blocco gli id OpenCritic dei giochi che non ne hanno uno,
// chiedendoli a Wikidata.
//
//   pnpm --filter api opencritic:resolve [quanti]
//
// **Non chiama OpenCritic e non spende budget**: scrive solo dove andare a
// guardare. A prendere i voti è poi la spazzata, o `pnpm --filter api backfill`.
//
// Nel worker gira da solo una volta a settimana; questo serve al primo giro,
// quando il catalogo è pieno e nessuno è ancora agganciato.

const limit = Number(process.argv[2] ?? 500);
const report = await resolveOpenCriticIds(limit);

console.log(
  `${report.candidati} giochi da agganciare, ${report.conMappa} noti a Wikidata, ` +
    `${report.agganciati} scritti` +
    (report.conflitti > 0
      ? `, ${report.conflitti} scartati perché l'id era già di un altro gioco`
      : ''),
);

if (report.candidati > 0 && report.conMappa === 0) {
  console.log(
    'nessuno mappato: se i giochi non hanno lo slug IGDB, prima deve ripassare ' +
      "l'enrichment IGDB",
  );
}

process.exit(0);
