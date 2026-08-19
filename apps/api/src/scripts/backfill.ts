import "../env";

import { enqueueIgdbEnrichment } from "../queue/enrichment";
import { findGamesNeedingIgdb } from "../services/enrichment";

// Accoda l'enrichment per i giochi che non ce l'hanno mai avuto o che ce l'hanno
// vecchio. Serve per i giochi entrati prima che la pipeline esistesse, e per non
// aspettare la spazzata quando si sa che c'e' lavoro da fare.
//
// Non forza: usa lo stesso predicato della spazzata, quindi rispetta le soglie di
// freschezza e non ripesca i `not_found`. Rilanciarlo due volte di fila non
// raddoppia niente.
//
//   pnpm --filter api backfill
//
// Non fa il lavoro: lo mette in coda. A farlo e' il worker, che rispetta il rate
// limit di IGDB.
const limit = Number(process.argv[2] ?? 500);
const games = await findGamesNeedingIgdb(limit);

if (games.length === 0) {
  console.log("niente da arricchire: tutti i giochi risolti sono aggiornati");
} else {
  for (const game of games) {
    await enqueueIgdbEnrichment(game.id);
  }
  console.log(`accodati ${games.length} giochi`);
}

process.exit(0);
