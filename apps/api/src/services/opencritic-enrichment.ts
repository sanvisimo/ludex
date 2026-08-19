import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';

import {
  OpenCriticQuotaError,
  fetchOpenCriticGame,
  searchOpenCriticGames,
  type OpenCriticGame,
} from '../external/opencritic';
import { isUniqueViolation } from '../lib/pg-error';
import { findSourceExternalId, markSource } from './enrichment';
import { saveScores } from './scores';
import { normalizeTitle, pickByName, rankCandidates } from './title-match';

/**
 * Enrichment OpenCritic di un singolo gioco: il voto della critica.
 *
 * Somiglia a HLTB — cerca, scegli, aggancia l'id, e dal secondo giro vai
 * dritto alla scheda — ma con una differenza che governa tutto: **cercare
 * costa**. Il piano gratuito dà 25 ricerche al giorno contro 200 richieste, e
 * su una libreria vera le ricerche finirebbero in un pomeriggio.
 *
 * Per questo la ricerca qui è l'ultima spiaggia e non il primo passo:
 * l'aggancio normale lo fa `opencritic-resolve`, in blocco, da Wikidata e a
 * costo zero. Chi arriva a cercare è il residuo che Wikidata non conosce.
 *
 * L'altra differenza è che la ricerca **non restituisce l'anno**: il matcher
 * può giudicare solo il nome, e l'anno si verifica dopo sulla scheda — una
 * richiesta che si sarebbe comunque fatta.
 */

export type OpenCriticOutcome =
  | { status: 'ok'; openCriticId: number; name: string; via: 'id' | 'nome' }
  | { status: 'skipped'; reason: string }
  /** Budget del giorno finito. Non è un esito del gioco: si riprova domani. */
  | { status: 'deferred'; reason: string }
  | { status: 'not_found'; reason: string };

/**
 * Di quanto possono divergere il nostro anno e il loro prima di dire che non è
 * lo stesso gioco. Uno, come per HLTB: le uscite scivolano fra i mercati e le
 * due fonti datano cose diverse.
 */
const YEAR_TOLERANCE = 1;

/**
 * L'anno in cui OpenCritic ha aperto. Sotto questo non si spende una ricerca:
 * vedi il commento dove viene usato, che è dove sta la ragione.
 */
const OPENCRITIC_FIRST_YEAR = 2015;

/** Scrive voto e aggancio insieme: o valgono entrambi, o non vale nessuno dei due. */
async function saveGame(gameId: string, game: OpenCriticGame) {
  await db.transaction(async (tx) => {
    // Prima la fonte: è qui che l'unique su (source, external_id) può rifiutare
    // il match, e allora il voto sbagliato non è ancora stato scritto.
    await markSource(
      {
        gameId,
        source: 'opencritic',
        status: 'ok',
        error: null,
        externalId: String(game.id),
      },
      tx,
    );

    // Lista vuota quando il gioco su OpenCritic c'è ma non ha recensioni: è un
    // aggancio riuscito senza voto, non un fallimento — e va distinto, o si
    // ricercherebbe ogni volta un gioco che abbiamo già trovato.
    await saveScores(
      gameId,
      'opencritic',
      game.topCriticScore === null
        ? []
        : [
            {
              score: game.topCriticScore,
              reviewCount: game.numReviews,
              medianScore: game.medianScore,
              percentRecommended: game.percentRecommended,
              tier: game.tier,
            },
          ],
      tx,
    );
  });
}

export async function enrichGameFromOpenCritic(
  gameId: string,
): Promise<OpenCriticOutcome> {
  const game = await db.query.games.findFirst({
    columns: { id: true, name: true, firstReleaseDate: true },
    where: eq(schema.games.id, gameId),
  });

  if (!game) return { status: 'skipped', reason: 'gioco inesistente' };

  try {
    return await resolveAndSave(game);
  } catch (error) {
    // Il budget esaurito non è un esito del gioco: non si annota niente, o la
    // prossima spazzata crederebbe di aver già provato. Non si rilancia
    // nemmeno: BullMQ ritenterebbe fra pochi secondi contro un muro che si
    // apre domani.
    if (error instanceof OpenCriticQuotaError) {
      return { status: 'deferred', reason: error.message };
    }

    if (isUniqueViolation(error)) {
      // Due nostri giochi non possono essere la stessa voce OpenCritic. Il caso
      // tipico sono due edizioni dello stesso titolo di cui loro tengono una
      // riga sola. `not_found`, così la spazzata non ci ritorna sopra.
      await markSource({
        gameId,
        source: 'opencritic',
        status: 'not_found',
        error: 'la voce OpenCritic scelta è già agganciata a un altro gioco',
        externalId: null,
      });
      return {
        status: 'not_found',
        reason: 'voce già agganciata a un altro gioco',
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    // `externalId` non si tocca: un guasto di rete non deve far dimenticare un
    // aggancio che era stato trovato.
    await markSource({
      gameId,
      source: 'opencritic',
      status: 'failed',
      error: message.slice(0, 500),
    });
    throw error;
  }
}

type GameRow = { id: string; name: string; firstReleaseDate: Date | null };

async function resolveAndSave(game: GameRow): Promise<OpenCriticOutcome> {
  // Già agganciato — da Wikidata o da una ricerca precedente: una richiesta e
  // basta, che è il caso normale e quello che tiene in piedi il budget.
  const known = await findSourceExternalId(game.id, 'opencritic');
  if (known) {
    const detail = await fetchOpenCriticGame(Number(known));
    if (detail) {
      await saveGame(game.id, detail);
      return {
        status: 'ok',
        openCriticId: detail.id,
        name: detail.name,
        via: 'id',
      };
    }
    // L'id non esiste più: OpenCritic fonde le voci doppie, e su Wikidata un id
    // può essere semplicemente sbagliato. Si stacca e si cerca.
  }

  const nostroAnno = game.firstReleaseDate?.getUTCFullYear() ?? null;

  // Un gioco uscito prima che OpenCritic esistesse non si cerca.
  //
  // Non è pessimismo, è aritmetica: al primo giro vero le 25 ricerche del
  // giorno se le sono prese Half-Life, Portal e Quake III, che nessuna
  // ricerca troverà mai — e i candidati che tornavano erano "Harvest Life" e
  // "Portal Dogs". Il matcher li ha rifiutati tutti, ma la ricerca era già
  // stata spesa.
  //
  // I giochi vecchi che OpenCritic **sì** ha (ce ne sono: il catalogo
  // all'indietro non è vuoto) restano raggiungibili, perché arrivano da
  // Wikidata con l'id già in mano e questa strada non la percorrono. Quello
  // che si perde è solo il caso di un gioco pre-2015 che OpenCritic ha e che
  // Wikidata non collega — e per quello c'è il ri-aggancio, non una ricerca
  // a tentoni.
  if (nostroAnno !== null && nostroAnno < OPENCRITIC_FIRST_YEAR) {
    await markSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'not_found',
      error: `uscito nel ${nostroAnno}: OpenCritic nasce nel ${OPENCRITIC_FIRST_YEAR} e non lo cerchiamo`,
      externalId: null,
    });
    return { status: 'not_found', reason: 'troppo vecchio per essere cercato' };
  }

  const hits = await searchOpenCriticGames(normalizeTitle(game.name));

  if (hits.length === 0) {
    await markSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'not_found',
      error: `OpenCritic non ha nulla per "${game.name}"`,
      externalId: null,
    });
    return { status: 'not_found', reason: 'nessun risultato' };
  }

  // Senza anno nei risultati il giudizio è solo sul nome: `pickByName` sceglie
  // se c'è un titolo identico e uno solo, o se il primo stacca il secondo.
  // `releaseYear: null` è deliberato e non una dimenticanza: i risultati della
  // ricerca OpenCritic l'anno non ce l'hanno, quindi qui non c'è niente da
  // confrontare. Il confronto si fa sotto, sulla scheda.
  const picked = pickByName(
    rankCandidates({ name: game.name, releaseYear: null }, hits),
  );

  if (!picked) {
    await markSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'not_found',
      error:
        `nessun candidato convincente per "${game.name}": ` +
        hits
          .slice(0, 3)
          .map((hit) => `${hit.name} (${hit.id})`)
          .join('; '),
      externalId: null,
    });
    return { status: 'not_found', reason: 'candidati non convincenti' };
  }

  const detail = await fetchOpenCriticGame(picked.hit.id);

  if (!detail) {
    await markSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'not_found',
      error: `la scheda OpenCritic ${picked.hit.id} non esiste`,
      externalId: null,
    });
    return { status: 'not_found', reason: 'scheda inesistente' };
  }

  // La verifica dell'anno arriva qui e non prima perché prima non c'era: è la
  // scheda a portarlo. Ed è quella che separa un remake dal suo originale,
  // esattamente come su HLTB — con la differenza che lì l'anno costava zero e
  // qui costa la richiesta che stavamo comunque facendo.
  if (
    nostroAnno !== null &&
    detail.releaseYear !== null &&
    Math.abs(nostroAnno - detail.releaseYear) > YEAR_TOLERANCE
  ) {
    await markSource({
      gameId: game.id,
      source: 'opencritic',
      status: 'not_found',
      error: `"${detail.name}" (${detail.id}) è del ${detail.releaseYear}, il nostro del ${nostroAnno}`,
      externalId: null,
    });
    return { status: 'not_found', reason: "l'anno non torna" };
  }

  await saveGame(game.id, detail);
  return {
    status: 'ok',
    openCriticId: detail.id,
    name: detail.name,
    via: 'nome',
  };
}
