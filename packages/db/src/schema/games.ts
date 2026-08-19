import { storeValues } from '@repo/contracts/vocabulary';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { scoreSource } from './data-source';
import { timestamps } from './timestamps';

// Negozi da cui un gioco può provenire. Serve a due cose che oggi hanno la stessa
// lista: da dove si lancia il gioco (`ownerships.store`) e in che namespace vive
// un id esterno (`external_ids.source`). Quando arriveranno sorgenti che non sono
// negozi — HLTB e OpenCritic, step 6 e 8 — `external_ids.source` vorrà un enum
// suo e le due cose si separeranno.
//
// I valori arrivano da @repo/contracts perché servono anche a web e mobile, che
// non possono importare questo package.
export const store = pgEnum('store', storeValues);

// Condivisa fra tutti gli utenti: se l'utente 2 importa un gioco già presente
// riusa questa riga e l'enrichment si paga una volta sola. Per questo qui NON
// c'è userId — il possesso sta su `backlog`.
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Chiave esterna canonica, ma nullable: un gioco inserito a mano e non
    // ancora risolto su IGDB è legittimo. Nessuna query può quindi dare per
    // scontato che i metadata siano popolati.
    igdbId: integer('igdb_id').unique(),
    // Lo slug IGDB ("hollow-knight"). È l'indirizzo con cui Wikidata riconosce
    // un gioco, e da lì arriva l'id OpenCritic senza spendere una ricerca — la
    // risorsa scarsa dello step 8. Vale per ogni negozio, al contrario
    // dell'appid Steam: un gioco comprato su Epic si aggancia allo stesso modo.
    //
    // **Non è unique**, al contrario di `igdbId`: IGDB riscrive lo slug quando
    // rinomina un gioco, e il vecchio può finire a un altro. Un vincolo qui
    // trasformerebbe quel giorno in un enrichment che fallisce per sempre su un
    // gioco valido. L'identità resta l'id numerico; questo è solo un indirizzo.
    igdbSlug: text('igdb_slug'),
    name: text('name').notNull(),

    // --- metadati, popolati dall'enrichment dello step 3 ---
    // Tutti nullable: un gioco esiste prima di essere arricchito, e le fonti
    // arrivano in momenti diversi. Che cosa sia gia stato preso lo dice
    // `game_sources`, non il fatto che una colonna sia piena.
    summary: text('summary'),
    firstReleaseDate: timestamp('first_release_date'),
    // IGDB restituisce un `image_id`: l'URL si compone al momento di mostrarlo,
    // scegliendo la dimensione. Salvare l'URL gia fatto vincolerebbe al formato.
    coverImageId: text('cover_image_id'),
    coverWidth: integer('cover_width'),
    coverHeight: integer('cover_height'),

    // --- voto della critica: il numero su cui si filtra e si ordina ---
    //
    // I voti veri stanno in `game_scores`, una riga per fonte e per
    // piattaforma. Questi due sono la **denormalizzazione** di quella tabella:
    // il miglior voto complessivo che abbiamo per questo gioco, con la fonte da
    // cui viene, ricalcolati in coda a ogni enrichment secondo una precedenza
    // scritta in un punto solo (OpenCritic → Metacritic → IGDB).
    //
    // Esistono per lo step 7: il filtro "sopra 80" e l'ordinamento per voto
    // critica leggono una colonna indicizzabile invece di infilare tre
    // sottoquery correlate nella query di ricerca, che è già la più complessa
    // del progetto. Il prezzo è che vanno ricalcolati a ogni scrittura di
    // `game_scores` — e per questo il ricalcolo sta nella stessa transazione,
    // non in un passo che si può dimenticare.
    //
    // `criticScoreSource` non è decorazione: senza, la scheda mostrerebbe un
    // numero senza poter dire di chi è, e OpenCritic e Metacritic non stanno
    // sulla stessa scala.
    criticScore: real('critic_score'),
    criticScoreSource: scoreSource('critic_score_source'),

    // --- durate HowLongToBeat, popolate dall'enrichment dello step 6 ---
    //
    // In minuti e non in secondi, che è come li dà HLTB: la precisione al
    // secondo su una media di migliaia di segnalazioni è finta, e
    // `ownerships.playtimeMinutes` è già in minuti — allo step 7 il filtro
    // "stasera ho due ore" confronta le stesse unità senza conversioni.
    hltbMainMinutes: integer('hltb_main_minutes'),
    hltbPlusMinutes: integer('hltb_plus_minutes'),
    hltbCompletionistMinutes: integer('hltb_completionist_minutes'),
    hltbAllStylesMinutes: integer('hltb_all_styles_minutes'),

    // Quante segnalazioni stanno dietro ciascuna media. Non è statistica per la
    // statistica: una durata con tre segnalazioni è rumore e una con tremila no,
    // e allo step 12 le due cose non possono pesare uguale. I quattro conteggi
    // divergono parecchio sullo stesso gioco (Hollow Knight: 2739 sulla storia
    // principale, 9418 sul totale), quindi non se ne può tenere uno solo.
    hltbMainCount: integer('hltb_main_count'),
    hltbPlusCount: integer('hltb_plus_count'),
    hltbCompletionistCount: integer('hltb_completionist_count'),
    hltbAllStylesCount: integer('hltb_all_styles_count'),

    // Che tipo di tempi ha senso leggere su questo gioco. Servono a distinguere
    // "non ha una fine" da "durata non ancora presa", che senza sarebbero la
    // stessa colonna vuota — e soprattutto a non leggere come durata un numero
    // che durata non è: Counter-Strike 2 riporta 143 ore di "storia
    // principale", che sono tempo investito. Come trattarli l'ha deciso lo
    // step 7: il filtro sulla durata lascia fuori chi una fine non ce l'ha. Qui
    // si salva il dato grezzo e ciò che serve a interpretarlo.
    hltbHasSolo: boolean('hltb_has_solo'),
    hltbHasCoop: boolean('hltb_has_coop'),
    hltbHasVersus: boolean('hltb_has_versus'),

    ...timestamps,
  },
  // Ordinamento del catalogo pubblico: ultimi giochi conosciuti da Ludex.
  (table) => [index('games_created_at_idx').on(table.createdAt)],
);

// Mappa Steam appid, GOG, PSN, Xbox… tutti sulla stessa riga `games`. Ogni nuova
// libreria importabile aggiunge righe qui, non colonne a `games`.
export const externalIds = pgTable(
  'external_ids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    source: store('source').notNull(),
    externalId: text('external_id').notNull(),
    ...timestamps,
  },
  (table) => [
    // Lo stesso id su Steam non può puntare a due giochi diversi.
    uniqueIndex('external_ids_source_external_id_idx').on(
      table.source,
      table.externalId,
    ),
    index('external_ids_game_id_idx').on(table.gameId),
  ],
);
