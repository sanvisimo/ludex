import { scoreSourceValues } from '@repo/contracts/vocabulary';
import { pgEnum } from 'drizzle-orm/pg-core';

// Fonti dei metadati. Distinto da `store` (i negozi) perché OpenCritic, HLTB e
// Metacritic non sono posti da cui si compra: sono posti da cui si legge.
//
// Sta in un file suo, e non accanto a `game_sources` che è il suo uso
// principale, perché lo vogliono anche `games` (quale fonte ha vinto la
// precedenza sul voto critica) e `game_scores`. Lasciandolo in `sources.ts`,
// che per la sua chiave esterna importa `games`, quell'import diventerebbe un
// ciclo — e un pgEnum, al contrario di una `references(() => …)`, viene valutato
// al caricamento del modulo, quindi il ciclo non sarebbe innocuo.
export const dataSource = pgEnum('data_source', [
  'igdb',
  'opencritic',
  'hltb',
  'steamgriddb',
  'metacritic',
]);

/**
 * Le fonti di un **voto**, che sono un sottoinsieme delle fonti di dati.
 *
 * Un enum a parte e non un CHECK su `data_source`, per due ragioni che vanno
 * insieme. La prima è di merito: HLTB e SteamGridDB non danno voti — danno
 * durate e copertine — e una riga di `game_scores` con `source = 'hltb'` non
 * vorrebbe dire niente. È la stessa distinzione che c'è già fra `store` e
 * `data_source`: liste che oggi si somigliano ma rispondono a domande diverse.
 *
 * La seconda è che Postgres non lascia scelta. Un CHECK su `data_source` che
 * nomini `'metacritic'` va scritto nella stessa transazione che quel valore lo
 * crea, e lì il valore non è ancora committato:
 *
 *     ERROR: unsafe use of new value "metacritic" of enum type data_source
 *     HINT:  New enum values must be committed before they can be used.
 *
 * Un tipo nuovo invece nasce già completo, e con l'enum al posto del CHECK il
 * vincolo se ne va del tutto: è il tipo stesso a chiudere il vocabolario.
 */
export const scoreSource = pgEnum('score_source', scoreSourceValues);
