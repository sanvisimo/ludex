import "../env";

import { enqueueEnrichment } from "../queue/enrichment";
import { ENRICHMENT_SOURCE_NAMES, findGamesNeedingSource } from "../services/enrichment";

// Accoda l'enrichment per i giochi che non ce l'hanno mai avuto o che ce l'hanno
// vecchio, una fonte alla volta. Serve per i giochi entrati prima che la
// pipeline esistesse, e per non aspettare la spazzata quando si sa che c'e'
// lavoro da fare.
//
// Non forza: usa lo stesso predicato della spazzata, quindi rispetta le soglie di
// freschezza e non ripesca i `not_found`. Rilanciarlo due volte di fila non
// raddoppia niente.
//
//   pnpm --filter api backfill
//
// Non fa il lavoro: lo mette in coda. A farlo e' il worker, che rispetta il rate
// limit delle fonti.
const limit = Number(process.argv[2] ?? 500);
let total = 0;

for (const source of ENRICHMENT_SOURCE_NAMES) {
  const games = await findGamesNeedingSource(source, limit);
  for (const game of games) await enqueueEnrichment(source, game.id);
  console.log(`${source}: accodati ${games.length} giochi`);
  total += games.length;
}

// HLTB pretende che IGDB sia gia' andato a buon fine: al primo giro su un
// database appena popolato la sua quota e' zero, e si riempira' da sola man mano
// che i giochi vengono arricchiti. Non e' un errore, e rilanciare lo script dopo
// il primo giro la trova piena.
if (total === 0) console.log("niente da arricchire: tutto aggiornato");

process.exit(0);
