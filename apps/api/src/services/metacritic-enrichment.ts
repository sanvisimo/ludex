import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';

import {
  fetchMetacriticGame,
  searchMetacriticGames,
  type MetacriticGame,
} from '../external/metacritic';
import { fetchSteamMetacriticSlug } from '../external/steam';
import { isUniqueViolation } from '../lib/pg-error';
import { findSourceExternalId, markSource } from './enrichment';
import { toPlatformSlug } from './metacritic-platforms';
import { saveScores, type ScoreInput } from './scores';
import {
  normalizeTitle,
  pickByName,
  rankCandidates,
  shortenTitle,
} from './title-match';

/**
 * Enrichment Metacritic di un singolo gioco: il voto della critica, **per
 * piattaforma**.
 *
 * È l'unica delle tre fonti di voto che distingue le versioni, ed è la ragione
 * per cui esiste `game_scores` invece di una colonna: su Mafia il numero che
 * Metacritic pubblica è 66, che è il port Xbox, mentre il PC vale 88.
 *
 * L'identità si cerca in tre modi, dal più sicuro al meno:
 *
 * 1. **lo slug che abbiamo già**, da un giro precedente;
 * 2. **il link che la scheda Steam dichiara**, quando il gioco viene da lì.
 *    Costa una richiesta e non una ricerca, ma è un indizio da verificare:
 *    BioShock Remastered punta alla raccolta, Kingdom: Classic a un altro
 *    gioco. Si accetta solo se nome e anno reggono, come per un candidato
 *    qualunque;
 * 3. **la ricerca per nome**, con l'anno che Metacritic restituisce insieme ai
 *    titoli — il che rende questo match più sicuro di quello OpenCritic, dove
 *    l'anno bisogna andarselo a prendere.
 */

/**
 * Tre anni invece di uno, perché Metacritic data la piattaforma capofila e non
 * la prima uscita: Mafia per IGDB è del 2002, per loro del 2004. Vedi
 * `yearTolerance` in `title-match`.
 */
const METACRITIC_YEAR_TOLERANCE = 3;

export type MetacriticOutcome =
  | {
      status: 'ok';
      slug: string;
      name: string;
      platforms: number;
      via: 'slug' | 'steam' | 'nome' | 'titolo-corto';
    }
  | { status: 'skipped'; reason: string }
  | { status: 'not_found'; reason: string };

/**
 * Due righe della stessa piattaforma dicono la stessa cosa?
 *
 * Il confronto è su **tutti** i numeri e non solo sul voto: due righe con lo
 * stesso 68 ma conteggi diversi restano due affermazioni diverse, e fonderle
 * vorrebbe dire scegliere quale dei due gruppi di recensioni raccontare.
 */
function stessoVoto(a: ScoreInput, b: ScoreInput) {
  return (
    a.score === b.score &&
    a.reviewCount === b.reviewCount &&
    a.positiveCount === b.positiveCount &&
    a.neutralCount === b.neutralCount &&
    a.negativeCount === b.negativeCount &&
    a.sentiment === b.sentiment
  );
}

/**
 * Le righe da scrivere: il complessivo più una per piattaforma riconosciuta.
 *
 * Le piattaforme che non sappiamo tradurre — iOS, Meta Quest — si saltano e
 * basta: la nostra tabella `platforms` è la lista di ciò che si può possedere
 * in libreria, e un voto per una piattaforma che nessuno può avere non
 * servirebbe a nessuna domanda.
 *
 * **Metacritic si contraddice**, e va gestito qui. Su *Alien Breed* la stessa
 * pagina elenca `playstation-vita` due volte, stesso nome e stesse nove
 * recensioni, con due voti diversi — 64 con 2/5/2 e 68 con 4/5/0. Non è il
 * nostro mapping che collassa due piattaforme in una: in `sony_vita` ci arriva
 * solo `playstation-vita`.
 *
 * Prima questo faceva fallire **tutta** la scrittura: Postgres rifiuta una
 * `ON CONFLICT DO UPDATE` che tocchi la stessa riga due volte nello stesso
 * comando, quindi quel gioco restava senza nessun voto — PS3 e complessivo
 * compresi — e la spazzata ci riprovava per sempre.
 *
 * La piattaforma contesa si **scarta**, il resto si scrive. È la stessa regola
 * del giudice dei titoli, che davanti a due candidati appaiati preferisce non
 * scegliere: mediarli darebbe un 66 che nessuno ha pubblicato, e tenere il primo
 * lascerebbe decidere all'ordine del loro JSON. Un doppione **identico** invece
 * non è una contraddizione: si tiene una riga sola e non si dice niente.
 */
function toScoreInputs(game: MetacriticGame) {
  const rows: ScoreInput[] = [];

  if (game.overall) {
    rows.push({
      score: game.overall.score,
      reviewCount: game.overall.reviewCount,
      positiveCount: game.overall.positiveCount,
      neutralCount: game.overall.neutralCount,
      negativeCount: game.overall.negativeCount,
      sentiment: game.overall.sentiment,
    });
  }

  const saltate: string[] = [];
  // Per slug e non in coda a `rows`: il complessivo non ha piattaforma e non
  // entra in questo conto.
  const perPiattaforma = new Map<string, ScoreInput[]>();

  for (const platform of game.platforms) {
    const slug = toPlatformSlug(platform.slug);
    if (!slug) {
      saltate.push(platform.slug);
      continue;
    }
    const riga: ScoreInput = {
      platformSlug: slug,
      score: platform.score.score,
      reviewCount: platform.score.reviewCount,
      positiveCount: platform.score.positiveCount,
      neutralCount: platform.score.neutralCount,
      negativeCount: platform.score.negativeCount,
      sentiment: platform.score.sentiment,
    };
    perPiattaforma.set(slug, [...(perPiattaforma.get(slug) ?? []), riga]);
  }

  const contese: string[] = [];
  for (const [slug, righe] of perPiattaforma) {
    const prima = righe[0]!;
    if (righe.every((riga) => stessoVoto(riga, prima))) {
      rows.push(prima);
      continue;
    }
    contese.push(slug);
  }

  return { rows, saltate, contese };
}

/** Scrive voti e aggancio insieme: o valgono entrambi, o non vale nessuno dei due. */
async function saveGame(gameId: string, game: MetacriticGame) {
  const { rows, saltate, contese } = toScoreInputs(game);

  if (contese.length > 0) {
    // Va detto: è un dato della fonte che non torna, non un nostro inciampo, e
    // il log è l'unico posto dove lo si vede.
    console.log(
      `[metacritic] ${game.slug}: voti discordi sulla stessa piattaforma, scartate: ${contese.join(', ')}`,
    );
  }

  if (saltate.length > 0) {
    // Detto e non taciuto: se un domani comparisse una piattaforma vera fra
    // queste, il log è l'unico posto dove lo si vedrebbe.
    console.log(
      `[metacritic] ${game.slug}: piattaforme senza corrispondenza, saltate: ${saltate.join(', ')}`,
    );
  }

  await db.transaction(async (tx) => {
    await markSource(
      {
        gameId,
        source: 'metacritic',
        status: 'ok',
        error: null,
        externalId: game.slug,
      },
      tx,
    );
    await saveScores(gameId, 'metacritic', rows, tx);
  });

  return rows.length;
}

/** Il candidato regge il confronto con quello che sappiamo del nostro gioco? */
function convince(
  game: MetacriticGame,
  nostroNome: string,
  nostroAnno: number | null,
) {
  const picked = pickByName(
    rankCandidates(
      {
        name: nostroNome,
        releaseYear: nostroAnno,
        yearTolerance: METACRITIC_YEAR_TOLERANCE,
      },
      [{ name: game.name, releaseYear: game.releaseYear }],
    ),
  );
  return picked !== null;
}

export async function enrichGameFromMetacritic(
  gameId: string,
): Promise<MetacriticOutcome> {
  const game = await db.query.games.findFirst({
    columns: { id: true, name: true, firstReleaseDate: true },
    where: eq(schema.games.id, gameId),
  });

  if (!game) return { status: 'skipped', reason: 'gioco inesistente' };

  try {
    return await resolveAndSave(game);
  } catch (error) {
    if (isUniqueViolation(error)) {
      await markSource({
        gameId,
        source: 'metacritic',
        status: 'not_found',
        error: 'la scheda Metacritic scelta è già agganciata a un altro gioco',
        externalId: null,
      });
      return {
        status: 'not_found',
        reason: 'scheda già agganciata a un altro gioco',
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    await markSource({
      gameId,
      source: 'metacritic',
      status: 'failed',
      error: message.slice(0, 500),
    });
    throw error;
  }
}

type GameRow = { id: string; name: string; firstReleaseDate: Date | null };

/** Gli appid Steam del gioco: da lì si prende lo slug senza cercare. */
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
  return rows.map((row) => row.externalId);
}

async function resolveAndSave(game: GameRow): Promise<MetacriticOutcome> {
  const anno = game.firstReleaseDate?.getUTCFullYear() ?? null;

  // 1. Lo slug che abbiamo già.
  const known = await findSourceExternalId(game.id, 'metacritic');
  if (known) {
    const detail = await fetchMetacriticGame(known);
    if (detail) {
      const platforms = await saveGame(game.id, detail);
      return {
        status: 'ok',
        slug: detail.slug,
        name: detail.name,
        platforms,
        via: 'slug',
      };
    }
    // La pagina non c'è più: si stacca e si ricerca subito.
  }

  // 2. Il link dichiarato dalla scheda Steam.
  for (const appId of await steamAppIds(game.id)) {
    const slug = await fetchSteamMetacriticSlug(appId);
    if (!slug) continue;

    const detail = await fetchMetacriticGame(slug);
    // Verificato come un candidato qualunque: il link Steam sbaglia abbastanza
    // spesso da non poter essere creduto sulla parola.
    if (detail && convince(detail, game.name, anno)) {
      const platforms = await saveGame(game.id, detail);
      return {
        status: 'ok',
        slug: detail.slug,
        name: detail.name,
        platforms,
        via: 'steam',
      };
    }
  }

  // 3. La ricerca per nome, col titolo intero e poi accorciato.
  const tentativi = [game.name, shortenTitle(game.name)].filter(
    (titolo): titolo is string => Boolean(titolo),
  );

  for (const [indice, titolo] of tentativi.entries()) {
    const hits = await searchMetacriticGames(normalizeTitle(titolo));
    if (hits.length === 0) continue;

    const picked = pickByName(
      rankCandidates(
        {
          name: game.name,
          searchedAs: indice > 0 ? titolo : null,
          releaseYear: anno,
          yearTolerance: METACRITIC_YEAR_TOLERANCE,
        },
        hits,
      ),
    );
    if (!picked) continue;

    const detail = await fetchMetacriticGame(picked.hit.slug);
    if (!detail) continue;

    const platforms = await saveGame(game.id, detail);
    return {
      status: 'ok',
      slug: detail.slug,
      name: detail.name,
      platforms,
      via: indice > 0 ? 'titolo-corto' : 'nome',
    };
  }

  await markSource({
    gameId: game.id,
    source: 'metacritic',
    status: 'not_found',
    error: `nessuna scheda Metacritic convincente per "${game.name}"`,
    externalId: null,
  });
  return { status: 'not_found', reason: 'nessun candidato convincente' };
}
