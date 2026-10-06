import { sourceReasonValues } from '@repo/contracts/vocabulary';
import { sql } from 'drizzle-orm';
import {
  boolean,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dataSource } from './data-source';
import { games } from './games';
import { timestamps } from './timestamps';

// `failed` e `not_found` sono due cose diverse e tenerle separate è ciò che
// permette alla spazzata di smettere di riprovare.
//
// - `failed`: l'ultimo tentativo è andato male per una ragione che può passare —
//   rete, 500, credenziali scadute. Si riprova, diradando.
// - `not_found`: la fonte non ha questo gioco. Non passerà da sé: riprovare ogni
//   sei ore per sempre è lavoro buttato. Si riapre per evento, quando cambia
//   l'identificativo del gioco su quella fonte, non per scadenza.
export const sourceStatus = pgEnum('source_status', [
  'pending',
  'ok',
  'failed',
  'not_found',
]);

/**
 * Perché una fonte è `not_found` (11a). Il testo di `error` resta, ed è per chi
 * legge; questo è per chi filtra: la sezione «Dati mancanti» dell'admin separa
 * ciò che va sistemato a mano da ciò che va bene così, e su un testo diverso
 * per ogni fonte servirebbe una regex.
 *
 * - `too_old`: uscito prima che la fonte esistesse (OpenCritic nasce nel 2015).
 *   L'unico che va bene così.
 * - `no_results`: la ricerca non ha trovato niente. Può essere vero, ma anche
 *   un nome cercato male: «Kingdom Hearts III + Re Mind».
 * - `ambiguous`: c'erano candidati, nessuno convincente.
 * - `year_mismatch`: la scheda c'è, ma l'anno non torna.
 * - `taken`: la voce scelta è già di un altro gioco.
 * - `gone`: l'id che avevamo non esiste più sulla fonte.
 */
export const sourceReason = pgEnum('source_reason', sourceReasonValues);

/**
 * Stato dell'enrichment, una riga per (gioco, fonte).
 *
 * Esiste perché `games.updatedAt` non sa rispondere alla domanda che serve
 * davvero: le fonti arrivano in momenti diversi — IGDB allo step 3, HLTB allo
 * step 6 — e scrivono sulla stessa riga. Un unico timestamp le collassa e non
 * dice se è vecchio l'IGDB o se l'HLTB non è mai stato preso.
 *
 * Tiene anche l'esito dell'ultimo tentativo: senza, un job fallito diventa
 * indistinguibile da uno mai partito.
 *
 * E tiene l'id del gioco **su quella fonte**. `games.igdbId` resta dov'è perché
 * ha un altro ruolo — è la chiave d'identità del gioco, quella su cui l'import
 * riconosce che due utenti hanno lo stesso gioco. Gli altri sono solo indirizzi
 * per tornare a prendere il dato, e stanno accanto allo stato che li riguarda.
 */
export const gameSources = pgTable(
  'game_sources',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    source: dataSource('source').notNull(),
    status: sourceStatus('status').notNull().default('pending'),
    // Ultimo successo. Null finché non è mai andata a buon fine: è questo il
    // campo su cui si decide che cosa riaccodare.
    syncedAt: timestamp('synced_at'),
    // Ultimo tentativo, riuscito o no.
    attemptedAt: timestamp('attempted_at'),
    error: text('error'),
    // Solo sui `not_found`; nullo su ogni altro stato. Vedi `sourceReason`.
    reason: sourceReason('reason'),
    /**
     * L'id del gioco sulla fonte: il 26286 di Hollow Knight su HLTB.
     *
     * Serve a ripassare fra sei mesi senza rifare la ricerca per nome — che è
     * la parte cara e l'unica che può sbagliare. Nullo finché la fonte non è
     * stata agganciata, e resta nullo su IGDB, che l'id ce l'ha già su `games`.
     */
    externalId: text('external_id'),
    /**
     * L'id l'ha scritto un admin («Inserisci id», 11a), non il match.
     *
     * Una riga manuale è **esente dall'unicità** qui sotto: port e remaster
     * condividono davvero la voce dell'originale — MGS3 Master Collection e
     * MGS3 sono la stessa voce HLTB — e l'admin che lo scrive lo sa. Il match
     * automatico resta vincolato fra righe automatiche, e contro una manuale no:
     * se l'originale arriva dopo, la voce è sua, e quella manuale è in
     * prestito. Lo scrive solo «Inserisci id»; `markSource` non lo tocca.
     */
    manual: boolean('manual').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.source] }),
    // Due nostri giochi non possono essere la stessa voce sulla fonte. Non è
    // prudenza: HLTB ha due "Resident Evil 4" con lo stesso identico nome, e un
    // match per nome li assegnerebbe volentieri entrambi allo stesso id. Il
    // conflitto in scrittura è il segnale che il match è sbagliato. Le righe
    // manuali ne sono fuori: vedi `manual`.
    //
    // Parziale, perché i NULL qui sono la norma: senza il `where`, Postgres li
    // considererebbe comunque tutti distinti, ma l'indice si porterebbe dietro
    // una riga per ogni fonte mai tentata.
    uniqueIndex('game_sources_source_external_id_idx')
      .on(table.source, table.externalId)
      .where(sql`${table.externalId} is not null and not ${table.manual}`),
  ],
);
