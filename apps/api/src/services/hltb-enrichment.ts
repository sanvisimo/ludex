import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';

import {
  fetchHltbGameDetail,
  searchHltbGames,
  type HltbGameDetail,
  type HltbSearchHit,
} from '../external/hltb';
import { findSourceExternalId, markSource } from './enrichment';
import {
  normalizeTitle,
  pickByName,
  rankCandidates,
  shortenTitle,
  type Ranked,
} from './title-match';

/**
 * Enrichment HowLongToBeat di un singolo gioco: le durate.
 *
 * Rispetto a IGDB c'è un passo in più, ed è tutto il lavoro. IGDB si chiama per
 * id e risponde di quel gioco; HLTB va **cercato per nome**, perché fra le due
 * fonti non esiste un identificativo comune. Il grosso di questo file serve a
 * non agganciare la voce sbagliata, e a dire chiaramente quando non si è
 * riusciti a sceglierne una invece di tirare a indovinare.
 *
 * Trovata la voce, il suo id resta su `game_sources.external_id`: dal secondo
 * giro in poi la ricerca non si rifà: è la parte cara e l'unica che può
 * sbagliare.
 */

/**
 * Quante voci si arriva a controllare con l'appid.
 *
 * Ogni controllo è una richiesta. Tre bastano: se il gioco giusto non è nei
 * primi tre di una ricerca sul suo stesso titolo, il problema non è l'ordine.
 */
const VERIFY_DEPTH = 3;

export type HltbOutcome =
  | {
      status: 'ok';
      hltbId: number;
      name: string;
      via: 'id' | 'steam' | 'nome' | 'titolo-corto';
    }
  | { status: 'skipped'; reason: string }
  | { status: 'not_found'; reason: string };

/** Gli appid Steam del gioco: la prova d'identità, quando c'è. */
async function steamAppIds(gameId: string) {
  const rows = await db
    .select({ externalId: schema.externalIds.externalId })
    .from(schema.externalIds)
    .where(
      and(
        eq(schema.externalIds.gameId, gameId),
        eq(schema.externalIds.source, 'steam'),
      ),
    );
  return new Set(rows.map((row) => row.externalId));
}

/** Scrive durate e aggancio insieme: o valgono entrambi, o non vale nessuno dei due. */
async function saveDetail(gameId: string, detail: HltbGameDetail) {
  await db.transaction(async (tx) => {
    // Prima la fonte: è qui che l'unique su (source, external_id) può rifiutare
    // il match. Se salta, i tempi sbagliati non sono ancora stati scritti.
    await markSource(
      {
        gameId,
        source: 'hltb',
        status: 'ok',
        error: null,
        externalId: String(detail.hltbId),
      },
      tx,
    );

    await tx
      .update(schema.games)
      .set({
        hltbMainMinutes: detail.mainMinutes,
        hltbPlusMinutes: detail.plusMinutes,
        hltbCompletionistMinutes: detail.completionistMinutes,
        hltbAllStylesMinutes: detail.allStylesMinutes,
        hltbMainCount: detail.mainCount,
        hltbPlusCount: detail.plusCount,
        hltbCompletionistCount: detail.completionistCount,
        hltbAllStylesCount: detail.allStylesCount,
        hltbHasSolo: detail.hasSolo,
        hltbHasCoop: detail.hasCoop,
        hltbHasVersus: detail.hasVersus,
      })
      .where(eq(schema.games.id, gameId));
  });
}

/**
 * Postgres 23505: quell'id HLTB è già di un altro nostro gioco.
 *
 * Si scorre la catena delle cause perché Drizzle non rilancia l'errore di
 * postgres-js: lo avvolge in un "Failed query" con la query e i parametri, e il
 * codice resta un livello più sotto.
 */
function isUniqueViolation(error: unknown) {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    if ('code' in current && current.code === '23505') return true;
  }
  return false;
}

/**
 * I candidati per un gioco, con i tentativi sul titolo accorciato.
 *
 * Si chiede prima il titolo intero. Se HLTB non restituisce niente — e capita,
 * perché cerca in **AND** su tutti i termini, quindi basta una parola scritta
 * diversamente per non trovare nulla — si riprova con le sue parti: prima la
 * testa prima dei due punti, poi la coda dopo. Due casi veri, uno per parte:
 *
 *     "The Witcher: Enhanced Edition Director's Cut"  → "The Witcher"
 *     "Gabriel Knight 3: Blood of the Sacred, …"      → "Blood of the Sacred, …"
 *
 * I tentativi cambiano solo la **domanda**, mai il giudizio: il punteggio
 * guarda comunque anche il titolo intero (vedi `searchedAs` in `title-match`).
 * Il secondo caso lo mostra bene — cercato per coda, viene poi riconosciuto per
 * il titolo intero, che somiglia allo 0.95 nonostante il "3" contro "III".
 *
 * Partono a due condizioni, ed è la parte che conta:
 *
 * - **la ricerca precedente ha restituito zero**, non "niente di convincente".
 *   Zero risultati è un problema della domanda, e riformularla è legittimo.
 *   "Nessuno convince" è invece un giudizio che abbiamo già dato, e rifare la
 *   domanda più larga per ottenere candidati più molli sarebbe cambiare le
 *   carte in tavola.
 * - **l'anno lo sappiamo**. Un titolo accorciato apre a candidati che col nome
 *   intero non sarebbero mai comparsi, e l'anno è l'unica cosa che resta a
 *   verificarli.
 *
 * Esportata perché la usa anche `hltb:probe`: l'arnese deve provare la stessa
 * strada del job, o mostrerebbe scarti che il job non farebbe.
 */
export async function findHltbCandidates(
  name: string,
  releaseYear: number | null,
) {
  const hits = await searchHltbGames(normalizeTitle(name));
  if (hits.length > 0) {
    return {
      ranked: rankCandidates({ name, releaseYear }, hits),
      searchedAs: null,
      tried: [] as string[],
    };
  }

  const tried: string[] = [];
  if (releaseYear === null)
    return { ranked: [] as Ranked<HltbSearchHit>[], searchedAs: null, tried };

  // Testa e coda, in quest'ordine: la testa è il titolo vero privato
  // dell'edizione, la coda è un pezzo di sottotitolo e apre molto di più, quindi
  // è l'ultima spiaggia e non la prima.
  for (const searchedAs of [shortenTitle(name), shortenTitle(name, true)]) {
    if (!searchedAs || tried.includes(searchedAs)) continue;
    tried.push(searchedAs);

    const altri = await searchHltbGames(normalizeTitle(searchedAs));
    if (altri.length === 0) continue;

    return {
      ranked: rankCandidates({ name, searchedAs, releaseYear }, altri),
      searchedAs,
      tried,
    };
  }

  return { ranked: [] as Ranked<HltbSearchHit>[], searchedAs: null, tried };
}

function describe(ranked: Ranked<HltbSearchHit>[]) {
  return ranked
    .slice(0, 3)
    .map(
      (row) => `${row.hit.name} (${row.hit.hltbId}, ${row.score.toFixed(2)})`,
    )
    .join('; ');
}

export async function enrichGameFromHltb(gameId: string): Promise<HltbOutcome> {
  const game = await db.query.games.findFirst({
    columns: { id: true, name: true, firstReleaseDate: true },
    where: eq(schema.games.id, gameId),
  });

  if (!game) return { status: 'skipped', reason: 'gioco inesistente' };

  try {
    return await resolveAndSave(game);
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Non è un guasto: è il match che è sbagliato. Due nostri giochi non
      // possono essere la stessa voce HLTB, e il caso tipico sono due edizioni
      // dello stesso titolo di cui HLTB tiene una riga sola. `not_found`, così
      // la spazzata non ci ritorna sopra ogni giorno con lo stesso esito.
      await markSource({
        gameId,
        source: 'hltb',
        status: 'not_found',
        error: 'la voce HLTB scelta è già agganciata a un altro gioco',
        externalId: null,
      });
      return {
        status: 'not_found',
        reason: 'voce già agganciata a un altro gioco',
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    // `externalId` non si tocca: un timeout non deve far dimenticare un
    // aggancio che era stato trovato.
    await markSource({
      gameId,
      source: 'hltb',
      status: 'failed',
      error: message.slice(0, 500),
    });
    // Rilanciato: è BullMQ a decidere se e quando riprovare.
    throw error;
  }
}

type GameRow = { id: string; name: string; firstReleaseDate: Date | null };

async function resolveAndSave(game: GameRow): Promise<HltbOutcome> {
  // Già agganciato: si va dritti alla pagina, senza ricerca e senza match.
  const known = await findSourceExternalId(game.id, 'hltb');
  if (known) {
    const detail = await fetchHltbGameDetail(Number(known));
    if (detail) {
      await saveDetail(game.id, detail);
      return {
        status: 'ok',
        hltbId: detail.hltbId,
        name: detail.name,
        via: 'id',
      };
    }
    // La voce non c'è più: HLTB fonde i doppioni ogni tanto. Si stacca
    // l'aggancio e si ricerca subito, invece di aspettare la prossima spazzata.
  }

  const { ranked, searchedAs, tried } = await findHltbCandidates(
    game.name,
    game.firstReleaseDate?.getUTCFullYear() ?? null,
  );

  if (ranked.length === 0) {
    await markSource({
      gameId: game.id,
      source: 'hltb',
      status: 'not_found',
      // Si dicono anche i titoli accorciati provati: senza, dalla admin
      // sembrerebbe che i tentativi successivi non siano stati fatti.
      error:
        `HLTB non ha nulla per "${game.name}"` +
        (tried.length > 0
          ? ` né per ${tried.map((q) => `"${q}"`).join(' o ')}`
          : ''),
      externalId: null,
    });
    return { status: 'not_found', reason: 'nessun risultato' };
  }

  const appIds = await steamAppIds(game.id);
  const details = new Map<number, HltbGameDetail | null>();

  // La verifica con l'appid: la pagina HLTB dichiara da che gioco Steam viene, e
  // quello è un confronto fra identità — vale più di qualunque punteggio sul
  // nome, e recupera i titoli che i due cataloghi scrivono diversamente.
  //
  // Conferma e basta: **un appid diverso non smentisce**. Su una libreria vera
  // sarebbe la fonte di errore più grossa, perché su Steam lo stesso gioco può
  // avere più schede e IGDB ne mappa una sola — di "BioShock 2" il nostro
  // possesso è 8850 e HLTB dichiara per primo 409720, che è la remaster. Sono lo
  // stesso gioco, e scartarlo sarebbe stato buttare via un match giusto.
  if (appIds.size > 0) {
    for (const candidate of ranked.slice(0, VERIFY_DEPTH)) {
      const detail = await fetchHltbGameDetail(candidate.hit.hltbId);
      details.set(candidate.hit.hltbId, detail);

      if (detail?.steamAppIds.some((appId) => appIds.has(appId))) {
        await saveDetail(game.id, detail);
        return {
          status: 'ok',
          hltbId: detail.hltbId,
          name: detail.name,
          via: 'steam',
        };
      }
    }
  }

  const picked = pickByName(ranked);

  if (!picked) {
    // Due casi diversi che finiscono nello stesso stato ma non nello stesso
    // messaggio: qui i candidati c'erano, e nessuno convinceva. È questo che
    // rende sistemabile a mano il caso, un domani: l'errore porta con sé i
    // candidati scartati e il loro punteggio.
    await markSource({
      gameId: game.id,
      source: 'hltb',
      status: 'not_found',
      error: `nessun candidato convincente per "${game.name}": ${describe(ranked)}`,
      externalId: null,
    });
    return { status: 'not_found', reason: 'candidati non convincenti' };
  }

  const detail =
    details.get(picked.hit.hltbId) ??
    (await fetchHltbGameDetail(picked.hit.hltbId));

  if (!detail) {
    await markSource({
      gameId: game.id,
      source: 'hltb',
      status: 'not_found',
      error: `la pagina HLTB ${picked.hit.hltbId} non esiste più`,
      externalId: null,
    });
    return { status: 'not_found', reason: 'pagina inesistente' };
  }

  await saveDetail(game.id, detail);
  // Distinto da "nome": è un match su un titolo troncato, ed è utile che il log
  // lo dica invece di farlo sembrare sicuro quanto gli altri.
  return {
    status: 'ok',
    hltbId: detail.hltbId,
    name: detail.name,
    via: searchedAs ? 'titolo-corto' : 'nome',
  };
}
