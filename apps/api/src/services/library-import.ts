import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, eq, inArray, sql } from '@repo/db/orm';

import {
  findIgdbGamesByExternalIds,
  igdbSourceFor,
  searchIgdbGames,
} from '../external/igdb';
import { chunk } from '../lib/chunk';
import { enqueueEnrichment } from '../queue/enrichment';
import { ensureBacklogEntries, ensureOwnerships } from './backlog';
import {
  type ExternalGameLink,
  findGameIdsByExternalIds,
  linkExternalGames,
} from './games';
import {
  normalizeTitle,
  pickByName,
  rankCandidates,
  shortenTitle,
} from './title-match';

/**
 * L'import di una libreria, per qualunque negozio.
 *
 * È il corpo che era dentro `steam-import.ts` allo step 4, tirato fuori al 9a
 * quando i negozi sono diventati quattro. Ciò che varia da negozio a negozio sta
 * **prima** di qui — come si ottiene un token, come si scarica l'elenco — e
 * arriva già ridotto a `LibraryEntry[]`. Da questo punto in giù non c'è più
 * niente di specifico, ed è il motivo per cui non esiste un'interfaccia
 * `LibraryProvider`: metterebbe un oggetto con quattro metodi dove basta un
 * parametro.
 *
 * L'ordine dei passi è la parte che conta:
 *
 * 1. **prima il nostro DB**: gli id già in `external_ids` sono risolti senza
 *    uscire. `games` è condivisa fra tutti gli utenti, quindi il secondo che
 *    importa una libreria simile alla prima non paga quasi nulla.
 * 2. **poi IGDB per id**, in blocchi da 500 e solo per il resto. Dove il negozio
 *    ha una sorgente su IGDB questo risolve quasi tutto: su GOG il 94,5% di 435
 *    giochi in tre richieste.
 * 3. **poi IGDB per nome**, una ricerca per voce rimasta. È il passo nuovo del
 *    9a, e serve ai negozi che IGDB non mappa affatto — Amazon in testa, dove
 *    *tutte* le voci passano di qui.
 * 4. **poi le scritture**, tutte idempotenti: reimportare non deve accumulare
 *    niente né spostare lo stato di ciò che l'utente ha già in mano.
 */

/**
 * Una voce di libreria, ridotta a ciò che l'import usa davvero.
 *
 * Le ore sono opzionali perché quasi nessun negozio le dà: Steam sì, GOG no —
 * la sua API dell'account non le espone — Epic e Amazon nemmeno.
 */
export type LibraryEntry = {
  externalId: string;
  name: string;
  playtimeMinutes?: number | null;
  lastPlayedAt?: Date | null;
  /** Solo per il match per nome del passo 3, dove distingue i remake. */
  releaseYear?: number | null;
};

/**
 * La piattaforma su cui finisce il possesso, per negozio.
 *
 * Fissa e non dedotta: GOG dichiarerebbe anche Mac e Linux in `worksOn`, ma
 * sapere su cosa un gioco *girerebbe* non è sapere su cosa ci giochi, e la
 * piattaforma qui è il filtro hard del motore decisionale ("stasera ho la Switch
 * accesa"). L'utente la corregge dalla schermata dello step 5.
 *
 * I negozi console non ci sono e non è un buco: lì la piattaforma la dice la
 * fonte riga per riga — PSN sa se una voce è PS4 o PS5 — e chi li aggiungerà
 * dovrà portarla dentro `LibraryEntry`, non qui.
 */
const STORE_PLATFORM: Partial<Record<Store, string>> = {
  steam: 'pc_windows',
  gog: 'pc_windows',
  epic: 'pc_windows',
  amazon: 'pc_windows',
};

/**
 * Fallisce invece di indovinare. Indovinare la piattaforma vorrebbe dire
 * scrivere dati sbagliati in silenzio dentro una tabella su cui poi si filtra.
 */
export function platformFor(store: Store): string {
  const platform = STORE_PLATFORM[store];
  if (!platform) {
    throw new Error(`Nessuna piattaforma definita per il negozio ${store}`);
  }
  return platform;
}

/**
 * Quante ricerche per nome si spendono al massimo in un import.
 *
 * Serve perché il costo del passo 3 dipende dal negozio in modo brutale: GOG ne
 * chiede 24 su 435 giochi, Amazon 92 su 92. A 4 richieste al secondo — il tetto
 * di IGDB — una libreria Amazon di mille voci fermerebbe la coda per quattro
 * minuti buoni. Oltre il tetto le voci restanti vanno negli irrisolti, dove
 * l'utente le vede: è un rinvio, non una perdita, e il reimport successivo
 * riparte da lì perché nel frattempo il passo 1 non le conosce ancora.
 */
const NAME_SEARCH_CAP = 300;

/**
 * Di quanti anni possono discostarsi l'anno del negozio e quello di IGDB.
 *
 * Più larga del default di `title-match` perché i cataloghi dei negozi datano
 * l'edizione che vendono loro, non la prima uscita mondiale. Resta stretta
 * abbastanza da fare il lavoro per cui l'anno esiste — separare un gioco dal suo
 * remake — che è una distanza di decenni, non di anni.
 */
const STORE_YEAR_TOLERANCE = 5;

export type ImportReport = {
  /** Voci nella libreria del negozio. */
  total: number;
  /** Legate a un gioco, vecchio o nuovo. */
  resolved: number;
  /** Di quelle, agganciate per nome invece che per id. */
  resolvedByName: number;
  /** Finite in `unresolved_imports`. */
  unresolved: number;
  /** Righe `games` create: sono le uniche per cui si accoda l'enrichment. */
  newGames: number;
  /** Righe `backlog` create. Le altre c'erano già e non sono state toccate. */
  newEntries: number;
};

/** Le voci che non si sono legate a niente. Restano dell'utente, non sporcano `games`. */
async function recordUnresolved(
  userId: string,
  store: Store,
  entries: LibraryEntry[],
) {
  if (entries.length === 0) return;

  for (const page of chunk(entries, 500)) {
    await db
      .insert(schema.unresolvedImports)
      .values(
        page.map((entry) => ({
          userId,
          store,
          externalId: entry.externalId,
          name: entry.name,
          playtimeMinutes: entry.playtimeMinutes ?? null,
          lastPlayedAt: entry.lastPlayedAt ?? null,
        })),
      )
      // Un reimport aggiorna nome e ore invece di duplicare la voce.
      .onConflictDoUpdate({
        target: [
          schema.unresolvedImports.userId,
          schema.unresolvedImports.store,
          schema.unresolvedImports.externalId,
        ],
        // `excluded` e non la colonna: riferendo la colonna si riscriverebbe il
        // valore vecchio su sé stesso, e il reimport non aggiornerebbe nulla.
        set: {
          name: sql`excluded.name`,
          playtimeMinutes: sql`excluded.playtime_minutes`,
          lastPlayedAt: sql`excluded.last_played_at`,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Toglie dagli irrisolti le voci che nel frattempo si sono risolte.
 *
 * Serve perché IGDB cresce: un gioco che oggi non c'è può esserci fra un mese, e
 * al reimport la voce va tolta dalla lista degli scarti invece di restare lì a
 * chiedere un intervento manuale che non serve più.
 */
async function clearResolved(
  userId: string,
  store: Store,
  externalIds: string[],
) {
  if (externalIds.length === 0) return;

  for (const page of chunk(externalIds, 1000)) {
    await db
      .delete(schema.unresolvedImports)
      .where(
        and(
          eq(schema.unresolvedImports.userId, userId),
          eq(schema.unresolvedImports.store, store),
          inArray(schema.unresolvedImports.externalId, page),
        ),
      );
  }
}

/**
 * Cerca il titolo intero e, se non trova niente, riprova accorciandolo.
 *
 * Stessa strada di `findHltbCandidates`, e per lo stesso motivo: i cataloghi
 * scrivono lo stesso gioco in modi diversi, e la ricerca a titolo intero manca
 * il bersaglio quando il negozio aggiunge un pezzo che l'altro non ha. Su una
 * libreria GOG vera vale cinque giochi su 435 — i «Prologue», che GOG vende
 * come voce a sé e IGDB tiene sotto il titolo del gioco, e *Wargame
 * Construction Set III* che su GOG si porta dietro «+ Campaigns».
 *
 * Testa e poi coda: la testa è il titolo privato del sottotitolo, la coda apre
 * molto di più ed è l'ultima spiaggia.
 *
 * `searchedAs` non è decorazione: torna al giudizio, che confronta **anche** la
 * forma con cui si è cercato. Senza, «Wargame Construction Set III: Age of
 * Rifles 1846-1905 + Campaigns» verrebbe scartato pur avendo trovato il gioco
 * giusto, perché il titolo intero non gli somiglia abbastanza.
 *
 * Esportata per la stessa ragione di `findHltbCandidates`: un arnese che voglia
 * mostrare cosa farebbe l'import deve percorrere **questa** strada, non una sua
 * copia — o mostrerebbe scarti che il job non farebbe, che è esattamente il
 * modo in cui questo ripiego era stato dimenticato la prima volta.
 */
export async function searchWithFallback(name: string) {
  const hits = await searchIgdbGames(name);
  if (hits.length > 0) return { hits, searchedAs: null as string | null };

  const tried: string[] = [];
  for (const searchedAs of [shortenTitle(name), shortenTitle(name, true)]) {
    if (!searchedAs || tried.includes(searchedAs)) continue;
    tried.push(searchedAs);

    const altri = await searchIgdbGames(normalizeTitle(searchedAs));
    if (altri.length > 0) return { hits: altri, searchedAs };
  }

  return { hits: [], searchedAs: null as string | null };
}

/**
 * Passo 3: cerca su IGDB per nome ciò che l'id non ha risolto.
 *
 * Usa lo stesso giudice di HLTB e Metacritic — `title-match` — che davanti a due
 * candidati appaiati preferisce non scegliere. Le voci su cui rinuncia finiscono
 * negli irrisolti e le sceglie l'utente: su una libreria GOG vera sono due su
 * 435, su una Amazon tredici su 92.
 *
 * Le voci che restano fuori sono spesso **giuste così**: raccolte di *goodies*,
 * artbook, editor di mod e versioni alfa, che GOG marca `isGame` come tutto il
 * resto. Non c'è un campo per distinguerle, e non serve inventarne uno: non
 * essere su IGDB è già la risposta.
 */
async function resolveByName(
  entries: LibraryEntry[],
): Promise<ExternalGameLink[]> {
  const links: ExternalGameLink[] = [];

  for (const entry of entries.slice(0, NAME_SEARCH_CAP)) {
    const { hits, searchedAs } = await searchWithFallback(entry.name);
    if (hits.length === 0) continue;

    const picked = pickByName(
      rankCandidates(
        {
          name: entry.name,
          searchedAs,
          releaseYear: entry.releaseYear ?? null,
          yearTolerance: STORE_YEAR_TOLERANCE,
        },
        hits.map((hit) => ({
          name: hit.name,
          releaseYear: hit.releaseYear,
          // `rankCandidates` butta i DLC, ma li riconosce da questa stringa: la
          // ricerca IGDB rende l'etichetta leggibile, non il codice.
          type: hit.gameType === 'DLC' ? 'dlc' : null,
          igdbId: hit.igdbId,
        })),
      ),
    );
    if (!picked) continue;

    links.push({
      externalId: entry.externalId,
      igdbId: picked.hit.igdbId,
      // Il nome di IGDB, non quello del negozio: i negozi decorano i titoli con
      // l'edizione, e quello finirebbe su una riga `games` condivisa da tutti.
      name: picked.hit.name,
    });
  }

  return links;
}

export async function importLibrary(
  store: Store,
  userId: string,
  library: LibraryEntry[],
): Promise<ImportReport> {
  const platformSlug = platformFor(store);

  // 1. Quello che Ludex conosce già.
  const known = await findGameIdsByExternalIds(
    store,
    library.map((entry) => entry.externalId),
  );

  // 2. Il resto su IGDB, per id. Con un negozio che IGDB non mappa questa non
  //    esce nemmeno in rete e cade tutto al passo 3.
  const missing = library.filter((entry) => !known.has(entry.externalId));
  const byId = await findIgdbGamesByExternalIds(
    store,
    igdbSourceFor(store) === null
      ? []
      : missing.map((entry) => entry.externalId),
  );

  const idLinks: ExternalGameLink[] = missing
    .map((entry) => {
      const match = byId.get(entry.externalId);
      return match ? { externalId: entry.externalId, ...match } : null;
    })
    .filter((link): link is ExternalGameLink => link !== null);

  // 3. E per nome, ciò che l'id non ha preso.
  const nameLinks = await resolveByName(
    missing.filter((entry) => !byId.has(entry.externalId)),
  );

  const { byExternalId, createdGameIds } = await linkExternalGames(store, [
    ...idLinks,
    ...nameLinks,
  ]);

  const gameIdByExternalId = new Map([...known, ...byExternalId]);
  const resolved = library.filter((entry) =>
    gameIdByExternalId.has(entry.externalId),
  );
  const unresolved = library.filter(
    (entry) => !gameIdByExternalId.has(entry.externalId),
  );

  // 4. Le scritture.
  await recordUnresolved(userId, store, unresolved);
  await clearResolved(
    userId,
    store,
    resolved.map((entry) => entry.externalId),
  );

  const { byGameId, created } = await ensureBacklogEntries(
    userId,
    resolved.map((entry) => gameIdByExternalId.get(entry.externalId)!),
  );

  // Un possesso per voce di libreria. Due id che puntano allo stesso gioco
  // producono la stessa riga: il vincolo unique la collassa, e vince l'ultima
  // che porta le ore.
  await ensureOwnerships(
    resolved.map((entry) => ({
      backlogId: byGameId.get(gameIdByExternalId.get(entry.externalId)!)!,
      platformSlug,
      store,
      playtimeMinutes: entry.playtimeMinutes ?? null,
      lastPlayedAt: entry.lastPlayedAt ?? null,
    })),
  );

  // Solo i giochi nati adesso: gli altri l'enrichment ce l'hanno già, o ce
  // l'hanno vecchio e ci pensa la spazzata.
  for (const gameId of createdGameIds) await enqueueEnrichment('igdb', gameId);

  await db
    .update(schema.storeAccounts)
    .set({ lastSyncAt: new Date() })
    .where(
      and(
        eq(schema.storeAccounts.userId, userId),
        eq(schema.storeAccounts.store, store),
      ),
    );

  return {
    total: library.length,
    resolved: resolved.length,
    resolvedByName: nameLinks.length,
    unresolved: unresolved.length,
    newGames: createdGameIds.length,
    newEntries: created.size,
  };
}
