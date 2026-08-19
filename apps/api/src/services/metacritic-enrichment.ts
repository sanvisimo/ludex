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
 * Le righe da scrivere: il complessivo più una per piattaforma riconosciuta.
 *
 * Le piattaforme che non sappiamo tradurre — iOS, Meta Quest — si saltano e
 * basta: la nostra tabella `platforms` è la lista di ciò che si può possedere
 * in libreria, e un voto per una piattaforma che nessuno può avere non
 * servirebbe a nessuna domanda.
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
  for (const platform of game.platforms) {
    const slug = toPlatformSlug(platform.slug);
    if (!slug) {
      saltate.push(platform.slug);
      continue;
    }
    rows.push({
      platformSlug: slug,
      score: platform.score.score,
      reviewCount: platform.score.reviewCount,
      positiveCount: platform.score.positiveCount,
      neutralCount: platform.score.neutralCount,
      negativeCount: platform.score.negativeCount,
      sentiment: platform.score.sentiment,
    });
  }

  return { rows, saltate };
}

/** Scrive voti e aggancio insieme: o valgono entrambi, o non vale nessuno dei due. */
async function saveGame(gameId: string, game: MetacriticGame) {
  const { rows, saltate } = toScoreInputs(game);

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
    rankCandidates({ name: nostroNome, releaseYear: nostroAnno }, [
      { name: game.name, releaseYear: game.releaseYear },
    ]),
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
