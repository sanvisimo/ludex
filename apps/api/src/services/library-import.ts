import type { Store, Subscription } from '@repo/contracts/vocabulary';
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
import type { StoreAccountRow } from './store-accounts';
import {
  type ExternalGameLink,
  findGameIdsByExternalIds,
  linkExternalGames,
} from './games';
import {
  NAME_THRESHOLD,
  normalizeTitle,
  pickByName,
  type Ranked,
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
  /**
   * La piattaforma di **questa riga**, per i negozi che la dicono.
   *
   * Nulla sui negozi PC, dove la piattaforma è una costante del negozio e la
   * mette `platformFor`. Valorizzata da PSN in poi: la stessa libreria porta
   * PS4 e PS5 insieme, e lo stesso gioco comprato una volta sola in cross-buy
   * arriva come **due righe**, che sono due copie vere — a lanciarle si accende
   * una console diversa.
   */
  platformSlug?: string | null;
  /**
   * Da quale abbonamento viene il diritto, se non è un acquisto.
   *
   * Nullo = comprato. Su PSN sono 274 righe su 336, quindi non è un angolo: è
   * quasi tutta la libreria, e senza questo il backlog non saprebbe distinguere
   * ciò che è tuo da ciò che hai finché paghi.
   */
  subscription?: Subscription | null;
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
 *
 * Dal 9b non è più l'unica strada: i negozi console la piattaforma la dicono
 * riga per riga, e quella vince. Questa resta per i negozi PC — dove la riga
 * non ne porta nessuna — e continua ad alzare per chi non è né l'uno né
 * l'altro, che è il modo giusto di accorgersi di un negozio aggiunto a metà.
 */
export function platformFor(store: Store): string {
  const platform = STORE_PLATFORM[store];
  if (!platform) {
    throw new Error(`Nessuna piattaforma definita per il negozio ${store}`);
  }
  return platform;
}

/** La piattaforma di una voce: quella che dice lei, o quella del negozio. */
export function platformOf(store: Store, entry: LibraryEntry): string {
  return entry.platformSlug ?? platformFor(store);
}

/**
 * Quante ricerche per nome si spendono al massimo in un import.
 *
 * Serve perché il costo del passo 3 dipende dal negozio in modo brutale, e sono
 * numeri misurati su librerie vere: GOG ne chiede 24 su 435 giochi, perché il
 * suo product id IGDB lo conosce; **Epic 705 su 705 e Amazon 92 su 92**, perché
 * i loro id IGDB non li ha affatto.
 *
 * A 4 richieste al secondo — il tetto di IGDB — settecento voci sono tre minuti
 * di coda. È accettabile per un job che gira in background e succede una volta:
 * al reimport le voci risolte le riconosce il passo 1 dal nostro database.
 *
 * Il tetto è quindi un freno contro le librerie fuori scala, non una politica.
 * Oltre, le voci restanti vanno negli irrisolti, dove l'utente le vede: è un
 * rinvio e non una perdita, e il reimport successivo riparte da lì.
 */
const NAME_SEARCH_CAP = 1000;

/**
 * Di quanti anni possono discostarsi l'anno del negozio e quello di IGDB.
 *
 * Più larga del default di `title-match` perché i cataloghi dei negozi datano
 * l'edizione che vendono loro, non la prima uscita mondiale. Resta stretta
 * abbastanza da fare il lavoro per cui l'anno esiste — separare un gioco dal suo
 * remake — che è una distanza di decenni, non di anni.
 */
const STORE_YEAR_TOLERANCE = 5;

/**
 * Quanto il più recensito deve staccare il secondo per rompere una parità.
 *
 * Serve quando IGDB ha **più schede col titolo identico** e il negozio non dà
 * l'anno per distinguerle — che è il caso di Epic, dove finiscono lì 41 voci su
 * 705. Il matcher a quel punto giustamente rinuncia: sul nome non c'è più
 * niente da dire.
 *
 * Ma i doppioni di IGDB non sono candidati alla pari, sono **schede vuote**:
 *
 *     Inside (2016)   1666 recensioni     ← il gioco
 *     Inside (?)         0 recensioni
 *     Inside (?)         0 recensioni
 *
 * Tre volte, e non «il più recensito vince»: con un margine stretto si
 * sceglierebbe fra due schede entrambe vissute, che è proprio il caso in cui
 * decidere non tocca a noi. Misurata sulla libreria vera, questa regola rompe
 * **34 pareggi su 41** e lascia agli scarti quelli davvero contesi.
 */
const TIE_REVIEW_RATIO = 3;

/**
 * Il candidato che stacca gli altri per numero di recensioni, o null.
 *
 * Sta qui e **non in `pickByName`**: quel giudice lo usano anche HLTB e
 * Metacritic, dove i candidati sono voci loro e un conteggio recensioni IGDB non
 * ce l'hanno. Allargare l'interfaccia condivisa per un caso solo vorrebbe dire
 * pagare in tre posti per risolverne uno.
 */
function breakTieByReviews<T extends { totalRatingCount: number | null }>(
  ranked: Ranked<T>[],
): T | null {
  const esatti = ranked
    .filter((row) => row.exact && row.score >= NAME_THRESHOLD)
    .sort(
      (a, b) =>
        (b.hit.totalRatingCount ?? 0) - (a.hit.totalRatingCount ?? 0),
    );
  if (esatti.length < 2) return null;

  const primo = esatti[0]!.hit.totalRatingCount ?? 0;
  const secondo = esatti[1]!.hit.totalRatingCount ?? 0;
  // Il `+ 1` evita che zero contro zero passi per un distacco infinito.
  return primo > 0 && primo >= TIE_REVIEW_RATIO * (secondo + 1)
    ? esatti[0]!.hit
    : null;
}

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
  account: StoreAccountRow,
  entries: LibraryEntry[],
) {
  if (entries.length === 0) return;

  for (const page of chunk(entries, 500)) {
    await db
      .insert(schema.unresolvedImports)
      .values(
        page.map((entry) => ({
          userId: account.userId,
          store: account.store,
          storeAccountId: account.id,
          externalId: entry.externalId,
          name: entry.name,
          // Solo quella della riga: su un negozio PC resta nulla, e chi
          // risolverà lo scarto la ricaverà da `platformFor` come sempre.
          // Scriverci dentro la costante del negozio vorrebbe dire dire due
          // volte la stessa cosa, e in due posti che possono divergere.
          platformSlug: entry.platformSlug ?? null,
          playtimeMinutes: entry.playtimeMinutes ?? null,
          lastPlayedAt: entry.lastPlayedAt ?? null,
        })),
      )
      // Un reimport aggiorna nome e ore invece di duplicare la voce.
      .onConflictDoUpdate({
        target: [
          schema.unresolvedImports.storeAccountId,
          schema.unresolvedImports.externalId,
        ],
        // `excluded` e non la colonna: riferendo la colonna si riscriverebbe il
        // valore vecchio su sé stesso, e il reimport non aggiornerebbe nulla.
        set: {
          name: sql`excluded.name`,
          platformSlug: sql`excluded.platform_slug`,
          playtimeMinutes: sql`excluded.playtime_minutes`,
          lastPlayedAt: sql`excluded.last_played_at`,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Riallinea gli scarti alla libreria: restano solo quelli ancora irrisolti
 * **e ancora presenti**.
 *
 * Due pulizie in una, per due ragioni diverse.
 *
 * La prima: IGDB cresce, e un gioco che oggi non c'è può esserci fra un mese.
 * Al reimport la voce va tolta dalla lista invece di restare lì a chiedere un
 * intervento che non serve più.
 *
 * La seconda: una voce può **sparire dalla libreria**, perché l'utente l'ha
 * rimossa o perché abbiamo imparato a riconoscerla come non-gioco. Senza questa
 * pulizia quella riga resterebbe negli scarti per sempre, e l'utente si
 * troverebbe a dover scartare a mano roba che nessuno gli sta più proponendo —
 * `coolgrey Production` che sopravvive a tre reimport di fila.
 *
 * `dismiss` resta un'altra cosa: quello è l'utente che dice «non è un gioco» di
 * una voce che nella libreria **c'è**.
 */
async function pruneUnresolved(storeAccountId: string, daTogliere: string[]) {
  if (daTogliere.length === 0) return;

  for (const page of chunk(daTogliere, 1000)) {
    await db
      .delete(schema.unresolvedImports)
      .where(
        and(
          eq(schema.unresolvedImports.storeAccountId, storeAccountId),
          inArray(schema.unresolvedImports.externalId, page),
        ),
      );
  }
}

/** Gli id che questo account ha oggi negli scarti. */
async function currentUnresolvedIds(storeAccountId: string) {
  const rows = await db
    .select({ externalId: schema.unresolvedImports.externalId })
    .from(schema.unresolvedImports)
    .where(eq(schema.unresolvedImports.storeAccountId, storeAccountId));
  return rows.map((row) => row.externalId);
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
  // Normalizzato **anche al primo tentativo**, come fa HLTB. I negozi infilano
  // ™ e ® nei titoli — Epic in particolare — e IGDB su quelli non trova niente:
  // «Rocket League®» dà zero risultati, «rocket league» venti.
  const hits = await searchIgdbGames(normalizeTitle(name));
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
 *
 * Esportata per la stessa ragione di `searchWithFallback`: un arnese che voglia
 * mostrare cosa farebbe l'import deve percorrere **questa** strada e non una
 * sua copia, o mostrerebbe numeri che il job non produrrebbe mai.
 */
export async function resolveByName(
  entries: LibraryEntry[],
): Promise<ExternalGameLink[]> {
  const links: ExternalGameLink[] = [];

  // Le voci si raggruppano **per nome**, e il gruppo si cerca una volta sola.
  //
  // Perché il cross-buy esiste: su PSN lo stesso gioco comprato una volta
  // arriva come due righe, PS4 e PS5, con lo stesso identico titolo — 80 gruppi
  // su 256 nomi, misurati. Cercarli due volte sarebbe spreco; ma il punto vero
  // è un altro, ed è che la regola qui sotto li avrebbe buttati tutti.
  const gruppi = new Map<string, LibraryEntry[]>();
  for (const entry of entries) {
    const chiave = entry.name.trim().toLowerCase();
    gruppi.set(chiave, [...(gruppi.get(chiave) ?? []), entry]);
  }

  // Un nome che si ripete **sulla stessa piattaforma** non è un titolo, è
  // un'etichetta: due prodotti diversi con lo stesso nome non li può separare
  // nessuna ricerca per nome, e agganciarli entrambi vorrebbe dire dire il
  // falso su almeno uno.
  //
  // **Non è un caso di scuola.** Su una libreria Epic vera 266 voci su 705
  // arrivavano chiamate «Live» — sono progetti Unreal e isole di Fortnite
  // Creative — e IGDB un gioco chiamato davvero *Live* ce l'ha, con
  // corrispondenza esatta e unica. Il matcher le ha agganciate tutte e 266 a
  // quello, scrivendo 266 mappature false in `external_ids`, che è **condivisa
  // fra tutti gli utenti**: il danno non era nella libreria di chi importava,
  // era nel catalogo di tutti.
  //
  // «Sulla stessa piattaforma» è il 9b che affina la regola, non che la
  // indebolisce: sui negozi PC la piattaforma è una sola per tutta la libreria,
  // quindi qualunque ripetizione resta ambigua esattamente come prima. Su PSN
  // invece due righe su due console sono **una copia ciascuna** dello stesso
  // gioco, e trattarle da omonimi vorrebbe dire scartare metà libreria in
  // silenzio.
  //
  // Il filtro sulle voci-spazzatura sta a monte, nel client del negozio, ed è
  // il posto giusto per riconoscerle. Questo è la rete sotto: lì serve sapere
  // come è fatto quel negozio, qui basta contare.
  const daCercare = [...gruppi.values()]
    .filter((gruppo) => {
      const piattaforme = new Set(gruppo.map((entry) => entry.platformSlug));
      return gruppo.length <= piattaforme.size;
    })
    .slice(0, NAME_SEARCH_CAP);

  let fatte = 0;

  for (const gruppo of daCercare) {
    // Ogni cinquanta, e non a ogni voce: qui dentro si passano minuti — su Epic
    // sono settecento ricerche a quattro al secondo — e senza una riga ogni
    // tanto un import che lavora e uno che si è piantato si assomigliano
    // parecchio. Cinquanta è circa una riga ogni dodici secondi.
    if (fatte > 0 && fatte % 50 === 0) {
      console.log(
        `[import] ricerca per nome: ${fatte}/${daCercare.length}, ${links.length} agganciati`,
      );
    }
    fatte++;

    const entry = gruppo[0]!;
    const { hits, searchedAs } = await searchWithFallback(entry.name);
    if (hits.length === 0) continue;

    const ranked = rankCandidates(
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
        totalRatingCount: hit.totalRatingCount,
      })),
    );

    // Il giudizio per nome prima, e solo se rinuncia si guarda quanto le schede
    // sono vissute: è un ripiego per le parità, non un criterio di merito.
    const scelto = pickByName(ranked)?.hit ?? breakTieByReviews(ranked);
    if (!scelto) continue;

    // Un link **per ogni riga del gruppo**, non uno per il gruppo: gli id
    // esterni sono distinti — su PSN il `titleId` è per console — e ciascuno va
    // scritto in `external_ids`, o al prossimo import la riga PS4 tornerebbe a
    // costare una ricerca.
    for (const riga of gruppo) {
      links.push({
        externalId: riga.externalId,
        igdbId: scelto.igdbId,
        // Il nome di IGDB, non quello del negozio: i negozi decorano i titoli
        // con l'edizione, e quello finirebbe su una riga `games` condivisa da
        // tutti.
        name: scelto.name,
      });
    }
  }

  return links;
}

export async function importLibrary(
  account: StoreAccountRow,
  library: LibraryEntry[],
): Promise<ImportReport> {
  const { id: storeAccountId, userId, store } = account;

  // 1. Quello che Ludex conosce già.
  const known = await findGameIdsByExternalIds(
    store,
    library.map((entry) => entry.externalId),
  );

  // 2. Il resto su IGDB, per id. Con un negozio che IGDB non mappa questa non
  //    esce nemmeno in rete e cade tutto al passo 3.
  const missing = library.filter((entry) => !known.has(entry.externalId));
  console.log(
    `[import] ${store}: ${library.length} in libreria, ${known.size} già note a Ludex`,
  );
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

  if (idLinks.length > 0 || missing.length > 0) {
    console.log(
      `[import] ${store}: ${idLinks.length} risolte per id, ${missing.length - idLinks.length} da cercare per nome`,
    );
  }

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
  //
  // Prima si guarda cosa c'era negli scarti, perché subito dopo si riscrive:
  // ciò che non torna né fra i risolti né fra gli irrisolti è sparito dalla
  // libreria, e va tolto.
  const scartiPrima = await currentUnresolvedIds(storeAccountId);
  const nellaLibreria = new Set(library.map((entry) => entry.externalId));

  await recordUnresolved(account, unresolved);
  await pruneUnresolved(storeAccountId, [
    ...resolved.map((entry) => entry.externalId),
    ...scartiPrima.filter((externalId) => !nellaLibreria.has(externalId)),
  ]);

  const { byGameId, created } = await ensureBacklogEntries(
    userId,
    resolved.map((entry) => gameIdByExternalId.get(entry.externalId)!),
  );

  // Un possesso per voce di libreria. Due id che puntano allo stesso gioco
  // producono la stessa riga **se stanno sulla stessa piattaforma**: il vincolo
  // unique la collassa, e vince l'ultima che porta le ore. Se le piattaforme
  // sono due — il cross-buy PS4/PS5 — restano due righe, che è la verità.
  //
  // Con `storeAccountId`, lo stesso gioco su due account Amazon resta **due
  // possessi**: è da quale dei due si lancia, ed è la ragione per cui l'account
  // sta nella chiave.
  await ensureOwnerships(
    resolved.map((entry) => ({
      backlogId: byGameId.get(gameIdByExternalId.get(entry.externalId)!)!,
      // Della riga se ce l'ha, del negozio altrimenti: è qui che il cross-buy
      // diventa due possessi invece di uno, perché la piattaforma entra nella
      // chiave del vincolo.
      platformSlug: platformOf(store, entry),
      store,
      storeAccountId,
      playtimeMinutes: entry.playtimeMinutes ?? null,
      lastPlayedAt: entry.lastPlayedAt ?? null,
      subscription: entry.subscription ?? null,
    })),
  );

  // Solo i giochi nati adesso: gli altri l'enrichment ce l'hanno già, o ce
  // l'hanno vecchio e ci pensa la spazzata.
  for (const gameId of createdGameIds) await enqueueEnrichment('igdb', gameId);

  await db
    .update(schema.storeAccounts)
    .set({ lastSyncAt: new Date() })
    .where(eq(schema.storeAccounts.id, storeAccountId));

  return {
    total: library.length,
    resolved: resolved.length,
    resolvedByName: nameLinks.length,
    unresolved: unresolved.length,
    newGames: createdGameIds.length,
    newEntries: created.size,
  };
}
